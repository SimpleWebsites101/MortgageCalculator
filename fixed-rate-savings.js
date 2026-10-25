// Fixed-Rate Savings Calculator — page wiring. Maths lives in calc-savings.js.
(function () {
  'use strict';
  const { gbp, gbp2, pct, readNumber, formatOnBlur, radioValue, setResultsState, FIELD_ERRORS, tile, yearsMonths, monthFromNow, formatMonthYear } = window.CalcUI;
  const S = window.SavingsCalc;

  const $ = (id) => document.getElementById(id);
  const els = {
    deposit: $('deposit'), rate: $('rate'), years: $('years'), months: $('months'),
    headline: $('headline'), tiles: $('tiles'), compare: $('compare-tbody'),
    breakdown: $('breakdown-tbody'), breakdownSub: $('breakdown-sub'), treatmentNote: $('treatment-note'),
  };

  const ARRANGEMENTS = [
    { frequency: 'monthly', treatment: 'compound', label: 'Monthly, added to the bond' },
    { frequency: 'monthly', treatment: 'paid-out', label: 'Monthly, paid to another account' },
    { frequency: 'annually', treatment: 'compound', label: 'Annually, added to the bond' },
    { frequency: 'annually', treatment: 'paid-out', label: 'Annually, paid to another account' },
    { frequency: 'maturity', treatment: 'compound', label: 'All at maturity' },
  ];

  function calculate() {
    const v = {
      deposit: readNumber(els.deposit, { label: 'Deposit', min: 1, minLabel: '£1', max: 100000000, maxLabel: '£100,000,000' }),
      aer: readNumber(els.rate, { label: 'Interest rate', min: 0, max: 20, maxLabel: '20%' }),
      years: readNumber(els.years, { label: 'Term', min: 0, max: 10, integer: true, allowBlank: true }),
      months: readNumber(els.months, { label: 'Extra months', min: 0, max: 11, integer: true, allowBlank: true }),
    };
    const frequency = radioValue('frequency');
    const atMaturity = frequency === 'maturity';
    document.querySelectorAll('input[name="treatment"]').forEach((r) => { r.disabled = atMaturity; });
    els.treatmentNote.hidden = !atMaturity;
    const treatment = atMaturity ? 'compound' : radioValue('treatment');

    if (Object.values(v).some(Number.isNaN)) return setResultsState([FIELD_ERRORS]);
    const months = v.years * 12 + v.months;
    if (months < 1) return setResultsState(['Enter a term of at least one month.']);
    if (months > 120) return setResultsState(['This calculator covers terms of up to 10 years.']);
    setResultsState([]);

    const r = S.fixedRateDeposit({ deposit: v.deposit, aerPercent: v.aer, months, frequency, treatment });
    const maturityDate = formatMonthYear(monthFromNow(months));
    const paidOut = treatment === 'paid-out';

    els.headline.textContent = paidOut
      ? `Over ${yearsMonths(months)} you’d receive about ${gbp2.format(r.totalInterest)} in interest, paid out as you go, and get your ${gbp.format(v.deposit)} back at maturity.`
      : `After ${yearsMonths(months)} your ${gbp.format(v.deposit)} could be worth ${gbp2.format(r.maturityBalance)} — ${gbp2.format(r.totalInterest)} of interest.`;

    els.tiles.innerHTML = [
      tile('Interest earned', gbp2.format(r.totalInterest), 'before tax', true),
      paidOut
        ? tile('Paid out during the term', gbp2.format(r.interestPaidOut), `${frequency === 'monthly' ? 'monthly' : 'yearly'} payments to another account`)
        : tile('Balance at maturity', gbp2.format(r.maturityBalance), `around ${maturityDate}`),
      tile('Growth over the term', pct(r.growthOverTerm, 2), `on your ${gbp.format(v.deposit)} deposit`),
      tile('Equivalent annual growth', pct(r.effectiveAnnualRate, 2), frequency === 'monthly' ? `gross rate ${pct(r.grossRateMonthly, 2)} a year` : 'what this arrangement actually delivers'),
    ].join('');

    els.compare.innerHTML = ARRANGEMENTS.map((a) => {
      const x = S.fixedRateDeposit({ deposit: v.deposit, aerPercent: v.aer, months, frequency: a.frequency, treatment: a.treatment });
      const selected = a.frequency === frequency && (atMaturity || a.treatment === treatment);
      return `<tr${selected ? ' class="is-current"' : ''}><td>${a.label}${selected ? ' (selected)' : ''}</td>
        <td>${gbp2.format(x.totalInterest)}</td><td>${gbp2.format(x.maturityBalance)}</td><td>${gbp2.format(x.totalReceived)}</td></tr>`;
    }).join('');

    els.breakdownSub.textContent = atMaturity
      ? 'All the interest is paid in a single amount at the end of the term.'
      : `Each ${frequency === 'monthly' ? 'monthly' : 'yearly'} interest payment over the term${paidOut ? ', paid out rather than added to the bond' : ', added to the bond so later payments earn interest on it'}.`;
    els.breakdown.innerHTML = r.periods.map((p) => `<tr><td>${p.label}</td><td>${gbp2.format(p.opening)}</td>
      <td>${gbp2.format(p.interest)}</td><td>${gbp2.format(p.paidOut)}</td><td>${gbp2.format(p.closing)}</td></tr>`).join('')
      + `<tr class="is-total-row"><td>Total</td><td></td><td>${gbp2.format(r.totalInterest)}</td><td>${gbp2.format(r.interestPaidOut)}</td><td>${gbp2.format(r.maturityBalance)}</td></tr>`;
  }

  formatOnBlur(els.deposit);
  document.querySelectorAll('#calculator input').forEach((i) => {
    i.addEventListener(i.type === 'radio' ? 'change' : 'input', calculate);
  });
  calculate();
})();
