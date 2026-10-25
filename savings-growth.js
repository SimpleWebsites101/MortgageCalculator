// Savings Growth Calculator — page wiring. Maths lives in calc-savings.js.
(function () {
  'use strict';
  const { gbp, pct, readNumber, formatOnBlur, radioValue, setResultsState, FIELD_ERRORS, tile, lineChart, yearsMonths } = window.CalcUI;
  const S = window.SavingsCalc;

  const $ = (id) => document.getElementById(id);
  const els = {
    initial: $('initial'), monthly: $('monthly'), rate: $('rate'), years: $('years'), months: $('months'),
    headline: $('headline'), tiles: $('tiles'), split: $('split-bar'),
    chart: $('growth-chart'), tooltip: $('growth-chart-tooltip'), tbody: $('year-tbody'),
  };


  function calculate() {
    const v = {
      initial: readNumber(els.initial, { label: 'Starting balance', min: 0, max: 100000000, maxLabel: '£100,000,000', allowBlank: true }),
      monthly: readNumber(els.monthly, { label: 'Monthly deposit', min: 0, max: 1000000, maxLabel: '£1,000,000', allowBlank: true }),
      aer: readNumber(els.rate, { label: 'Interest rate', min: 0, max: 30, maxLabel: '30%' }),
      years: readNumber(els.years, { label: 'Years', min: 0, max: 60, integer: true, allowBlank: true }),
      months: readNumber(els.months, { label: 'Extra months', min: 0, max: 11, integer: true, allowBlank: true }),
    };
    if (Object.values(v).some(Number.isNaN)) return setResultsState([FIELD_ERRORS]);
    const months = v.years * 12 + v.months;
    if (months < 1) return setResultsState(['Enter a savings period of at least one month.']);
    if (v.initial === 0 && v.monthly === 0) return setResultsState(['Enter a starting balance, a monthly deposit, or both, to see a projection.']);
    setResultsState([]);

    const p = S.projectSavings({ initial: v.initial, monthly: v.monthly, aerPercent: v.aer, months, timing: radioValue('timing') });
    const share = p.finalBalance > 0 ? p.totalInterest / p.finalBalance : 0;

    els.headline.textContent = `After ${yearsMonths(months)} you could have ${gbp.format(p.finalBalance)} — ${gbp.format(p.totalInterest)} of it interest.`;
    els.tiles.innerHTML = [
      tile('Projected balance', gbp.format(p.finalBalance), `after ${yearsMonths(months)}`, true),
      tile('Total you pay in', gbp.format(p.totalContributed), `${gbp.format(v.initial)} now + ${gbp.format(p.newContributions)} in deposits`),
      tile('Interest earned', gbp.format(p.totalInterest), `at ${v.aer}% AER, before tax`),
      tile('Share from interest', pct(share), 'of the final balance'),
    ].join('');

    const inShare = (1 - share) * 100;
    els.split.innerHTML = `<span class="split-bar__seg" style="width:${inShare}%;background:#F6F7F9"></span><span class="split-bar__seg" style="width:${100 - inShare}%;background:#3B7DFF"></span>`;
    els.split.setAttribute('aria-label', `${pct(1 - share)} of the final balance is money paid in and ${pct(share)} is interest.`);

    lineChart(els.chart, els.tooltip, {
      labels: ['Today', ...p.years.map((y) => (y.monthsInYear === 12 ? `End of year ${y.year}` : `End of term (${yearsMonths(months)})`))],
      tickLabels: ['Now', ...p.years.map((y) => `Yr ${y.year}`)],
      series: [
        { name: 'Balance', values: [v.initial, ...p.years.map((y) => y.closing)], color: '#F6F7F9', area: true },
        { name: 'Paid in', values: [v.initial, ...p.years.map((y) => y.totalContributed)], color: '#6B6E77' },
      ],
    });

    els.tbody.innerHTML = p.years.map((y) => `<tr>
      <td>Year ${y.year}${y.monthsInYear < 12 ? ` (${y.monthsInYear} month${y.monthsInYear === 1 ? '' : 's'})` : ''}</td>
      <td>${gbp.format(y.contributions)}</td><td>${gbp.format(y.interest)}</td>
      <td>${gbp.format(y.totalContributed)}</td><td>${gbp.format(y.totalInterest)}</td><td>${gbp.format(y.closing)}</td></tr>`).join('');
  }

  [els.initial, els.monthly].forEach((i) => formatOnBlur(i));
  document.querySelectorAll('#calculator input').forEach((i) => i.addEventListener('input', calculate));
  calculate();
})();
