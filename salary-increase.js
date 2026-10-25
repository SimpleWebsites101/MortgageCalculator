// Salary Increase Calculator — page wiring. Runs both salaries through the
// same calculateTakeHome() engine as the Take-Home Pay Calculator.
(function () {
  'use strict';
  const { gbp, gbp2, pct, readNumber, formatOnBlur, formatWithCommas, radioValue, setResultsState, FIELD_ERRORS, tile, escapeHtml, bindHandoff, takeHandoff, fillNumber } = window.CalcUI;
  const T = window.UKTax;
  const F = window.TaxForm;

  const $ = (id) => document.getElementById(id);
  const els = {
    current: $('current'), risePercent: $('rise-percent'), newSalary: $('new-salary'),
    headline: $('headline'), tiles: $('tiles'), notes: $('notes'), compare: $('compare-tbody'), takehomeLink: $('takehome-link'),
  };

  let handoff = null; // what the take-home link carries to the next page

  function syncMode() {
    const pctMode = radioValue('rise-mode') === 'percent';
    els.risePercent.closest('.compact-bar__field').hidden = !pctMode;
    els.newSalary.closest('.compact-bar__field').hidden = pctMode;
  }

  // Thresholds the rise moves across, explained in plain English.
  function crossingNotes(a, b, opts, current, next) {
    const notes = [];
    const year = T.TAX_YEARS[opts.taxYear];
    if (next > year.taperThreshold && current < year.taperThreshold + 2 * year.personalAllowance && opts.taxCode.toUpperCase().replace(/^[SC]/, '') === '1257L') {
      notes.push('Part of this rise falls between £100,000 and £125,140, where your Personal Allowance is withdrawn — so the effective tax rate on that slice is much higher than your headline rate.');
    }
    const aTop = a.taxBreakdown.length ? a.taxBreakdown[a.taxBreakdown.length - 1].name : null;
    const bTop = b.taxBreakdown.length ? b.taxBreakdown[b.taxBreakdown.length - 1].name : null;
    if (aTop && bTop && aTop !== bTop && !bTop.startsWith('Flat')) notes.push(`The rise takes some of your income into the ${bTop.toLowerCase()} band.`);
    if (opts.studentLoan !== 'none' && a.studentLoan === 0 && b.studentLoan > 0) notes.push('The rise takes you over your student loan repayment threshold, so 9% of earnings above it now goes to your loan.');
    if (opts.postgraduate && a.postgraduateLoan === 0 && b.postgraduateLoan > 0) notes.push('The rise takes you over the Postgraduate Loan threshold of £21,000.');
    return notes;
  }

  function calculate() {
    syncMode();
    const pctMode = radioValue('rise-mode') === 'percent';
    const current = readNumber(els.current, { label: 'Current salary', min: 0, max: 10000000, maxLabel: '£10,000,000' });
    let next = NaN;
    if (pctMode) {
      const rise = readNumber(els.risePercent, { label: 'Pay rise', min: -100, max: 1000, maxLabel: '1,000%' });
      if (!Number.isNaN(current) && !Number.isNaN(rise)) next = current * (1 + rise / 100);
      window.CalcUI.setFieldError(els.newSalary, '');
    } else {
      next = readNumber(els.newSalary, { label: 'New salary', min: 0, max: 10000000, maxLabel: '£10,000,000' });
      window.CalcUI.setFieldError(els.risePercent, '');
    }
    const opts = F.readOptions();
    if (Number.isNaN(current) || Number.isNaN(next) || !opts) return setResultsState([FIELD_ERRORS]);

    const a = T.calculateTakeHome({ ...opts, grossAnnual: current });
    const b = T.calculateTakeHome({ ...opts, grossAnnual: next });
    if (!a.ok || !b.ok) return setResultsState((a.ok ? b : a).errors);
    setResultsState([]);

    // Keep the inactive field in step so switching modes is seamless.
    if (pctMode && document.activeElement !== els.newSalary) els.newSalary.value = formatWithCommas(Math.round(next));
    if (!pctMode && current > 0 && document.activeElement !== els.risePercent) els.risePercent.value = String(+(((next - current) / current) * 100).toFixed(2));

    const grossChange = b.gross - a.gross;
    const netChange = b.netAnnual - a.netAnnual;
    const keepShare = grossChange !== 0 ? netChange / grossChange : 0;
    const risePct = current > 0 ? grossChange / current : 0;

    if (grossChange === 0) {
      els.headline.textContent = 'Enter a new salary or percentage to compare.';
    } else if (grossChange > 0) {
      els.headline.textContent = `A ${pct(risePct)} rise (${gbp.format(grossChange)} a year) would add about ${gbp2.format(netChange / 12)} a month to your take-home pay — you’d keep ${pct(keepShare, 0)} of it.`;
    } else {
      els.headline.textContent = `A ${pct(-risePct)} cut (${gbp.format(-grossChange)} a year) would reduce your take-home pay by about ${gbp2.format(-netChange / 12)} a month.`;
    }

    els.tiles.innerHTML = [
      tile('Gross increase', `${grossChange < 0 ? '−' : ''}${gbp.format(Math.abs(grossChange))}`, `${pct(risePct)} on ${gbp.format(current)}`),
      tile('Extra take-home per year', `${netChange < 0 ? '−' : ''}${gbp.format(Math.abs(netChange))}`, `${gbp.format(a.netAnnual)} → ${gbp.format(b.netAnnual)}`, true),
      tile('Extra take-home per month', `${netChange < 0 ? '−' : ''}${gbp2.format(Math.abs(netChange) / 12)}`, `${gbp2.format(a.netMonthly)} → ${gbp2.format(b.netMonthly)}`),
      tile('Share of the rise you keep', grossChange !== 0 ? pct(keepShare, 0) : '—', 'after all deductions'),
    ].join('');

    const notes = [...new Set([...crossingNotes(a, b, opts, current, next), ...b.notes])];
    els.notes.innerHTML = notes.length ? `<div class="validation-message calc-note"><ul>${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : '';

    const rowsA = F.deductionRows(a, opts);
    const rowsB = F.deductionRows(b, opts);
    const signed = (v) => (Math.abs(v) < 0.005 ? '£0.00' : `${v > 0 ? '+' : '−'}${gbp2.format(Math.abs(v))}`);
    els.compare.innerHTML = `<tr><td>Gross salary</td><td>${gbp2.format(a.gross)}</td><td>${gbp2.format(b.gross)}</td><td>${signed(grossChange)}</td></tr>`
      + rowsA.map(([label, va], i) => `<tr><td>${escapeHtml(label)}</td><td>${gbp2.format(va)}</td><td>${gbp2.format(rowsB[i][1])}</td><td>${signed(rowsB[i][1] - va)}</td></tr>`).join('')
      + `<tr><td>Total deductions</td><td>${gbp2.format(a.totalDeductions)}</td><td>${gbp2.format(b.totalDeductions)}</td><td>${signed(b.totalDeductions - a.totalDeductions)}</td></tr>`
      + `<tr class="is-total-row"><td>Take-home per year</td><td>${gbp2.format(a.netAnnual)}</td><td>${gbp2.format(b.netAnnual)}</td><td>${signed(netChange)}</td></tr>`
      + `<tr class="is-total-row"><td>Take-home per month</td><td>${gbp2.format(a.netMonthly)}</td><td>${gbp2.format(b.netMonthly)}</td><td>${signed(netChange / 12)}</td></tr>`;

    handoff = { salary: Math.round(next), options: opts };
  }

  const incoming = takeHandoff();
  if (incoming) {
    fillNumber(els.current, incoming.salary);
    F.applyOptions(incoming.options);
  }
  bindHandoff(els.takehomeLink, () => handoff);
  [els.current, els.newSalary].forEach((i) => formatOnBlur(i));
  [els.current, els.risePercent, els.newSalary].forEach((i) => i.addEventListener('input', calculate));
  document.querySelectorAll('input[name="rise-mode"]').forEach((r) => r.addEventListener('change', calculate));
  F.onChange(calculate);
  calculate();
})();
