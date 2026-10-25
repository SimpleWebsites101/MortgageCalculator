// Savings Goal Calculator — page wiring. Maths lives in calc-savings.js.
(function () {
  'use strict';
  const { gbp, gbp2, pct, readNumber, formatOnBlur, radioValue, setResultsState, FIELD_ERRORS, tile, lineChart, yearsMonths, monthFromNow, formatMonthYear, formatShortMonthYear } = window.CalcUI;
  const S = window.SavingsCalc;

  const $ = (id) => document.getElementById(id);
  const els = {
    target: $('target'), initial: $('initial'), years: $('years'), months: $('months'), rate: $('rate'),
    headline: $('headline'), tiles: $('tiles'), progress: $('progress-bar'),
    chart: $('goal-chart'), tooltip: $('goal-chart-tooltip'), rates: $('rates-tbody'), timeline: $('timeline-tbody'),
  };
  const COMPARISON_RATES = [0, 1, 2, 3, 4, 5, 6];

  function seg(share, colour) {
    return share > 0 ? `<span class="split-bar__seg" style="width:${(share * 100).toFixed(3)}%;background:${colour}"></span>` : '';
  }

  function setSectionsVisible(visible) {
    document.querySelectorAll('[data-results]').forEach((s) => { s.hidden = !visible; });
  }

  function calculate() {
    const v = {
      target: readNumber(els.target, { label: 'Savings target', min: 1, minLabel: '£1', max: 100000000, maxLabel: '£100,000,000' }),
      initial: readNumber(els.initial, { label: 'Already saved', min: 0, max: 100000000, maxLabel: '£100,000,000', allowBlank: true }),
      years: readNumber(els.years, { label: 'Years', min: 0, max: 60, integer: true, allowBlank: true }),
      months: readNumber(els.months, { label: 'Extra months', min: 0, max: 11, integer: true, allowBlank: true }),
      aer: readNumber(els.rate, { label: 'Interest rate', min: 0, max: 30, maxLabel: '30%' }),
    };
    if (Object.values(v).some(Number.isNaN)) return setResultsState([FIELD_ERRORS]);
    const n = v.years * 12 + v.months;
    if (n < 1 && v.initial < v.target) return setResultsState(['Enter a timescale of at least one month.']);
    setResultsState([]);

    const timing = radioValue('timing');
    const goal = S.requiredMonthlyContribution({ target: v.target, initial: v.initial, aerPercent: v.aer, months: n, timing });
    const targetDate = formatMonthYear(monthFromNow(n));

    if (goal.status === 'achieved') {
      els.headline.textContent = `You’ve already reached your ${gbp.format(v.target)} target — you have ${gbp.format(v.initial - v.target)} more than you need.`;
      els.tiles.innerHTML = [
        tile('Monthly saving needed', gbp.format(0), 'target already met', true),
        tile('Already saved', gbp.format(v.initial), `${pct(v.initial / v.target, 0)} of your target`),
        tile('Target', gbp.format(v.target), 'reached today'),
      ].join('');
      els.progress.innerHTML = seg(1, '#F6F7F9');
      els.progress.setAttribute('aria-label', 'Your current savings already cover the whole target.');
      setSectionsVisible(false);
      return;
    }

    const monthly = goal.monthly;
    const p = S.projectSavings({ initial: v.initial, monthly, aerPercent: v.aer, months: n, timing });
    const paidIn = monthly * n;
    const interest = p.finalBalance - v.initial - paidIn;

    els.headline.textContent = goal.status === 'on-track'
      ? `At ${v.aer}% AER, the ${gbp.format(v.initial)} you’ve saved would grow to ${gbp.format(goal.projectedWithoutContributions)} by ${targetDate} without adding anything — enough to reach your target.`
      : `To reach ${gbp.format(v.target)} by ${targetDate} you’d need to save about ${gbp2.format(monthly)} a month.`;

    els.tiles.innerHTML = [
      tile('Monthly saving needed', gbp2.format(monthly), `for ${yearsMonths(n)}`, true),
      tile('You pay in', gbp.format(paidIn), `plus the ${gbp.format(v.initial)} already saved`),
      tile('Interest earned', gbp.format(Math.max(interest, 0)), `at ${v.aer}% AER, before tax`),
      tile('Target date', targetDate, `${yearsMonths(n)} from now`),
    ].join('');

    const total = Math.max(p.finalBalance, v.target);
    els.progress.innerHTML = seg(v.initial / total, '#F6F7F9') + seg(paidIn / total, '#A6A9B2') + seg(Math.max(interest, 0) / total, '#3B7DFF');
    els.progress.setAttribute('aria-label', `You already have ${pct(v.initial / v.target, 0)} of your target. Future deposits make up ${pct(paidIn / total, 0)} and interest ${pct(Math.max(interest, 0) / total, 0)}.`);
    setSectionsVisible(true);

    // Chart: monthly points for short goals, yearly for longer ones.
    const step = n <= 36 ? 1 : 12;
    const points = [];
    for (let m = 0; m <= n; m += step) points.push(m);
    if (points[points.length - 1] !== n) points.push(n);
    lineChart(els.chart, els.tooltip, {
      labels: points.map((m) => (m === 0 ? 'Today' : formatMonthYear(monthFromNow(m)))),
      tickLabels: points.map((m) => (m === 0 ? 'Now' : step === 1 ? formatShortMonthYear(monthFromNow(m)) : `Yr ${Math.ceil(m / 12)}`)),
      series: [
        { name: 'Balance', values: points.map((m) => S.futureValue(v.initial, monthly, v.aer, m, timing)), color: '#F6F7F9', area: true },
        { name: 'Target', values: points.map(() => v.target), color: '#3B7DFF', dash: true },
      ],
    });

    // Rate comparison, always including the user's own rate.
    const rates = [...new Set([...COMPARISON_RATES, v.aer])].sort((a, b) => a - b);
    els.rates.innerHTML = rates.map((r) => {
      const g = S.requiredMonthlyContribution({ target: v.target, initial: v.initial, aerPercent: r, months: n, timing });
      const mth = g.monthly;
      const end = S.futureValue(v.initial, mth, r, n, timing);
      const current = r === v.aer;
      return `<tr${current ? ' class="is-current"' : ''}>
        <td>${r}%${current ? ' (your rate)' : ''}</td>
        <td>${g.status === 'needs' ? gbp2.format(mth) : 'Nothing extra needed'}</td>
        <td>${gbp.format(mth * n)}</td>
        <td>${gbp.format(Math.max(end - v.initial - mth * n, 0))}</td></tr>`;
    }).join('');

    let monthCount = 0;
    els.timeline.innerHTML = p.years.map((y) => {
      monthCount += y.monthsInYear;
      return `<tr><td>Year ${y.year}${y.monthsInYear < 12 ? ` (${y.monthsInYear} month${y.monthsInYear === 1 ? '' : 's'})` : ''}</td>
        <td>${formatMonthYear(monthFromNow(monthCount))}</td>
        <td>${gbp.format(y.contributions)}</td><td>${gbp.format(y.interest)}</td>
        <td>${gbp.format(y.closing)}</td><td>${pct(Math.min(y.closing / v.target, 9.99), 0)}</td></tr>`;
    }).join('');
  }

  [els.target, els.initial].forEach((i) => formatOnBlur(i));
  document.querySelectorAll('#calculator input').forEach((i) => i.addEventListener('input', calculate));
  calculate();
})();
