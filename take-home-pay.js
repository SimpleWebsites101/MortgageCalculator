// UK Take-Home Pay Calculator — page wiring. All tax maths lives in
// calc-uk-tax.js (shared with the Salary Increase Calculator).
(function () {
  'use strict';
  const { gbp, gbp2, pct, readNumber, formatOnBlur, setResultsState, FIELD_ERRORS, tile, escapeHtml, bindHandoff, takeHandoff, fillNumber } = window.CalcUI;
  const T = window.UKTax;
  const F = window.TaxForm;

  const $ = (id) => document.getElementById(id);
  const els = {
    gross: $('gross'), period: $('period'),
    headline: $('headline'), tiles: $('tiles'), split: $('split-bar'), legend: $('split-legend'), notes: $('notes'),
    breakdown: $('breakdown-tbody'), marginal: $('marginal-note'), increaseLink: $('increase-link'),
    bands: $('bands-tbody'), bandsSub: $('bands-sub'),
  };
  let handoff = null; // what the "pay rise" link carries to the next page
  const PERIOD_TEXT = { annual: 'a year', monthly: 'a month', weekly: 'a week' };
  const SEGMENTS = [
    ['Take-home pay', 'netAnnual', '#F6F7F9'],
    ['Income Tax', 'incomeTax', '#3B7DFF'],
    ['National Insurance', 'nationalInsurance', '#2A5BC4'],
    ['Pension', 'pensionFromPay', '#6B6E77'],
    ['Student loans', 'loans', '#A6A9B2'],
  ];

  function calculate() {
    const amount = readNumber(els.gross, { label: 'Gross pay', min: 0, max: 10000000, maxLabel: '£10,000,000' });
    const opts = F.readOptions();
    if (Number.isNaN(amount) || !opts) return setResultsState([FIELD_ERRORS]);

    const grossAnnual = T.toAnnual(amount, els.period.value);
    const r = T.calculateTakeHome({ ...opts, grossAnnual });
    if (!r.ok) return setResultsState(r.errors);
    setResultsState([]);

    els.headline.textContent = `On ${gbp.format(amount)} ${PERIOD_TEXT[els.period.value]} you’d take home about ${gbp.format(r.netMonthly)} a month (${gbp.format(r.netAnnual)} a year) in ${r.taxYearLabel}.`;
    els.tiles.innerHTML = [
      tile('Take-home per year', gbp.format(r.netAnnual), `from ${gbp.format(r.gross)} gross`, true),
      tile('Take-home per month', gbp2.format(r.netMonthly), 'annual ÷ 12'),
      tile('Take-home per week', gbp2.format(r.netWeekly), 'annual ÷ 52'),
      tile('Total deductions', gbp.format(r.totalDeductions), `${pct(r.effectiveDeductionRate)} of gross pay`),
    ].join('');

    const values = { ...r, loans: r.studentLoan + r.postgraduateLoan };
    const shown = SEGMENTS.filter(([, k]) => values[k] > 0);
    const total = r.gross || 1;
    els.split.innerHTML = shown.map(([, k, c]) => `<span class="split-bar__seg" style="width:${(values[k] / total) * 100}%;background:${c}"></span>`).join('');
    els.split.setAttribute('aria-label', shown.map(([l, k]) => `${l} ${pct(values[k] / total)}`).join(', '));
    els.legend.innerHTML = shown.map(([l, k, c]) => `<span><span class="dot" style="background:${c}"></span> ${l} ${pct(values[k] / total, 0)}</span>`).join('');

    els.notes.innerHTML = r.notes.length
      ? `<div class="validation-message calc-note"><ul>${r.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : '';

    const rows = [['Gross pay', r.gross], ...F.deductionRows(r, opts).map(([l, v]) => [l, -v])];
    const cell = (v) => (v < 0 ? `−${gbp2.format(-v)}` : gbp2.format(v));
    els.breakdown.innerHTML = rows.map(([l, v]) => `<tr><td>${escapeHtml(l)}</td><td>${cell(v)}</td><td>${cell(v / 12)}</td><td>${cell(v / 52)}</td></tr>`).join('')
      + `<tr class="is-total-row"><td>Take-home pay</td><td>${gbp2.format(r.netAnnual)}</td><td>${gbp2.format(r.netMonthly)}</td><td>${gbp2.format(r.netWeekly)}</td></tr>`;
    if (r.pensionInvested > r.pensionFromPay) {
      els.breakdown.innerHTML += `<tr><td class="is-muted">Paid into your pension in total</td><td class="is-muted">${gbp2.format(r.pensionInvested)}</td><td class="is-muted">${gbp2.format(r.pensionInvested / 12)}</td><td class="is-muted">${gbp2.format(r.pensionInvested / 52)}</td></tr>`;
    }

    const keep = T.marginalRetention({ ...opts, grossAnnual }, 100);
    els.marginal.textContent = keep == null ? '' : `Of your next £100 of gross pay, you’d keep about £${(keep * 100).toFixed(2)} — a combined marginal deduction rate of ${pct(1 - keep, 0)}.`;
    handoff = { salary: Math.round(grossAnnual), options: opts };

    els.bandsSub.textContent = r.taxBreakdown.length && r.taxBreakdown[0].name.startsWith('Flat')
      ? `Your tax code applies one rate to all of your taxable pay of ${gbp.format(r.taxableIncome)}.`
      : `Your Personal Allowance is ${gbp.format(r.personalAllowance)}, leaving ${gbp.format(r.taxableIncome)} of taxable income${opts.region === 'scotland' ? ' charged at Scottish rates' : ''}.`;
    els.bands.innerHTML = r.taxBreakdown.length
      ? r.taxBreakdown.map((b) => `<tr><td>${escapeHtml(b.name)}</td><td>${+(b.rate * 100).toFixed(2)}%</td><td>${gbp2.format(b.amount)}</td><td>${gbp2.format(b.tax)}</td></tr>`).join('')
        + `<tr class="is-total-row"><td>Total Income Tax</td><td></td><td>${gbp2.format(r.taxableIncome)}</td><td>${gbp2.format(r.incomeTax)}</td></tr>`
      : '<tr><td colspan="4">No Income Tax is due on this income.</td></tr>';
  }

  const incoming = takeHandoff();
  if (incoming) {
    fillNumber(els.gross, incoming.salary);
    els.period.value = 'annual';
    F.applyOptions(incoming.options);
  }
  bindHandoff(els.increaseLink, () => handoff);
  formatOnBlur(els.gross);
  els.gross.addEventListener('input', calculate);
  els.period.addEventListener('change', calculate);
  F.onChange(calculate);
  calculate();
})();
