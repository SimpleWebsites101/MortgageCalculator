// Shared form handling for the Take-Home Pay and Salary Increase
// calculators. Both pages use the same option fields (tax year, region,
// tax code, pension, student loans) and feed them into the same engine
// (calc-uk-tax.js), so their results always agree. Exposed as window.TaxForm.
(function () {
  'use strict';
  const { readNumber } = window.CalcUI;
  const T = window.UKTax;
  const $ = (id) => document.getElementById(id);

  function fields() {
    return {
      taxYear: $('tax-year'), region: $('region'), taxCode: $('tax-code'),
      pensionMethod: $('pension-method'), pensionPercent: $('pension-percent'),
      studentLoan: $('student-loan'), postgraduate: $('postgraduate'),
    };
  }

  // Plan 5 has no HMRC threshold for 2025/26, so it can't be chosen there.
  function syncAvailability() {
    const f = fields();
    const year = T.TAX_YEARS[f.taxYear.value];
    const plan5 = f.studentLoan.querySelector('option[value="plan5"]');
    plan5.disabled = !year.studentLoans.plan5;
    plan5.textContent = year.studentLoans.plan5 ? 'Plan 5' : 'Plan 5 (not available for 2025/26)';
    const noPension = f.pensionMethod.value === 'none';
    f.pensionPercent.disabled = noPension;
    f.pensionPercent.closest('.field__control').style.opacity = noPension ? 0.5 : '';
  }

  // Returns the engine options (without grossAnnual), or null if a field
  // is invalid (inline errors are shown by readNumber).
  function readOptions() {
    const f = fields();
    syncAvailability();
    const method = f.pensionMethod.value;
    let percent = 0;
    if (method !== 'none') {
      percent = readNumber(f.pensionPercent, { label: 'Pension contribution', min: 0, max: 100, maxLabel: '100%' });
      if (Number.isNaN(percent)) return null;
    } else {
      window.CalcUI.setFieldError(f.pensionPercent, '');
    }
    return {
      taxYear: f.taxYear.value,
      region: f.region.value,
      taxCode: f.taxCode.value.trim() || T.STANDARD_CODE,
      pension: { method, percent },
      studentLoan: f.studentLoan.value,
      postgraduate: f.postgraduate.value === 'yes',
    };
  }

  function onChange(callback) {
    const f = fields();
    Object.values(f).forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', callback));
  }

  // Applies tax options handed over from the other calculator (see
  // CalcUI.bindHandoff). Every value is checked before it's used.
  function applyOptions(opts) {
    if (!opts) return;
    const f = fields();
    const setSelect = (el, v) => { if (v != null && [...el.options].some((o) => o.value === String(v))) el.value = String(v); };
    setSelect(f.taxYear, opts.taxYear);
    syncAvailability();
    setSelect(f.region, opts.region);
    setSelect(f.studentLoan, opts.studentLoan);
    if (f.studentLoan.selectedOptions[0] && f.studentLoan.selectedOptions[0].disabled) f.studentLoan.value = 'none';
    setSelect(f.postgraduate, opts.postgraduate ? 'yes' : 'no');
    if (opts.pension) {
      setSelect(f.pensionMethod, opts.pension.method);
      const pct = Number(opts.pension.percent);
      if (Number.isFinite(pct) && pct >= 0 && pct <= 100) f.pensionPercent.value = String(pct);
    }
    if (typeof opts.taxCode === 'string' && /^[A-Za-z0-9 ]{1,10}$/.test(opts.taxCode)) f.taxCode.value = opts.taxCode.toUpperCase();
  }

  const PENSION_LABEL = {
    'net-pay': 'Pension (net pay)',
    'relief-at-source': 'Pension (from take-home pay)',
    'salary-sacrifice': 'Pension (salary sacrifice)',
  };

  // Deduction rows shared by both pages' tables. Selected loans are listed
  // even when nothing is due, so a £0 is visible rather than missing.
  function deductionRows(r, opts) {
    const rows = [['Income Tax', r.incomeTax], ['National Insurance', r.nationalInsurance]];
    if (r.pensionMethod !== 'none') rows.push([PENSION_LABEL[r.pensionMethod], r.pensionFromPay]);
    if (opts.studentLoan !== 'none') rows.push([`Student loan (${opts.studentLoan.replace('plan', 'Plan ')})`, r.studentLoan]);
    if (opts.postgraduate) rows.push(['Postgraduate loan', r.postgraduateLoan]);
    return rows;
  }

  window.TaxForm = { readOptions, onChange, syncAvailability, applyOptions, deductionRows };
})();
