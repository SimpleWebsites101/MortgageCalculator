// 24/7 UK Mortgage Calculator — shared UK take-home pay engine
//
// The single source of truth for Income Tax, employee National Insurance,
// student loan and pension deductions. Both the Take-Home Pay and Salary
// Increase calculators call calculateTakeHome(), so their figures can never
// disagree. Pure functions only — runs in the browser (window.UKTax) and in
// Node for the automated tests.
//
// Every threshold below was checked against HMRC's published "Rates and
// thresholds for employers" pages on GOV.UK for the relevant tax year (see
// `sources`). Do not edit a figure without checking it against GOV.UK.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UKTax = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Income Tax bands are bands of *taxable* income (income after the
  // personal allowance), exactly as HMRC publishes them for PAYE.
  const TAX_YEARS = {
    '2026-27': {
      label: '2026/27',
      dates: '6 April 2026 to 5 April 2027',
      personalAllowance: 12570,
      taperThreshold: 100000,
      bands: {
        rUK: [
          { name: 'Basic rate', rate: 0.20, upTo: 37700 },
          { name: 'Higher rate', rate: 0.40, upTo: 125140 },
          { name: 'Additional rate', rate: 0.45, upTo: Infinity },
        ],
        scotland: [
          { name: 'Starter rate', rate: 0.19, upTo: 3967 },
          { name: 'Basic rate', rate: 0.20, upTo: 16956 },
          { name: 'Intermediate rate', rate: 0.21, upTo: 31092 },
          { name: 'Higher rate', rate: 0.42, upTo: 62430 },
          { name: 'Advanced rate', rate: 0.45, upTo: 125140 },
          { name: 'Top rate', rate: 0.48, upTo: Infinity },
        ],
      },
      ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, mainRate: 0.08, upperRate: 0.02 },
      studentLoans: {
        plan1: { threshold: 26900, rate: 0.09 },
        plan2: { threshold: 29385, rate: 0.09 },
        plan4: { threshold: 33795, rate: 0.09 },
        plan5: { threshold: 25000, rate: 0.09 },
      },
      postgraduateLoan: { threshold: 21000, rate: 0.06 },
      sources: [
        { label: 'HMRC: Rates and thresholds for employers 2026 to 2027', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027' },
      ],
    },
    '2025-26': {
      label: '2025/26',
      dates: '6 April 2025 to 5 April 2026',
      personalAllowance: 12570,
      taperThreshold: 100000,
      bands: {
        rUK: [
          { name: 'Basic rate', rate: 0.20, upTo: 37700 },
          { name: 'Higher rate', rate: 0.40, upTo: 125140 },
          { name: 'Additional rate', rate: 0.45, upTo: Infinity },
        ],
        scotland: [
          { name: 'Starter rate', rate: 0.19, upTo: 2827 },
          { name: 'Basic rate', rate: 0.20, upTo: 14921 },
          { name: 'Intermediate rate', rate: 0.21, upTo: 31092 },
          { name: 'Higher rate', rate: 0.42, upTo: 62430 },
          { name: 'Advanced rate', rate: 0.45, upTo: 125140 },
          { name: 'Top rate', rate: 0.48, upTo: Infinity },
        ],
      },
      ni: { primaryThreshold: 12570, upperEarningsLimit: 50270, mainRate: 0.08, upperRate: 0.02 },
      studentLoans: {
        plan1: { threshold: 26065, rate: 0.09 },
        plan2: { threshold: 28470, rate: 0.09 },
        plan4: { threshold: 32745, rate: 0.09 },
        // HMRC's 2025 to 2026 employer rates publish no Plan 5 threshold.
        plan5: null,
      },
      postgraduateLoan: { threshold: 21000, rate: 0.06 },
      sources: [
        { label: 'HMRC: Rates and thresholds for employers 2025 to 2026', url: 'https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2025-to-2026' },
      ],
    },
  };

  const DEFAULT_TAX_YEAR = '2026-27';
  const STANDARD_CODE = '1257L';

  // Flat-rate codes apply one rate to all pay from the job. Scottish codes
  // (S prefix) map to different rates from the rest of the UK.
  const FLAT_CODES = {
    rUK: { BR: 0.20, D0: 0.40, D1: 0.45 },
    scotland: { BR: 0.20, D0: 0.21, D1: 0.42, D2: 0.45, D3: 0.48 },
  };

  function isScotland(region) {
    return region === 'scotland';
  }

  // Interprets a PAYE tax code for an annual estimate. Supported:
  //   1257L — the standard code (personal allowance £12,570, tapered above
  //           £100,000 of income, as HMRC would apply to the annual figure)
  //   other number + L/M/N/T — allowance = number × 10, used as given
  //   0T, BR, D0–D3, NT — no allowance / flat rate / no tax
  // K codes and anything unrecognised are reported as unsupported rather
  // than guessed at.
  function parseTaxCode(rawCode, region) {
    const notes = [];
    let code = String(rawCode || '').toUpperCase().replace(/\s+/g, '');
    if (code === '') code = STANDARD_CODE;

    const emergency = code.match(/^(.*?)(W1|M1|X)$/);
    if (emergency && emergency[1]) {
      code = emergency[1];
      notes.push('Emergency (W1, M1 or X) codes calculate each pay period on its own. For a regular salary paid all year that gives the same annual result, so the suffix has been ignored here.');
    }

    const prefix = code[0];
    if (prefix === 'S' || prefix === 'C') {
      code = code.slice(1);
      if (prefix === 'S' && !isScotland(region)) notes.push('Your code starts with S, which means HMRC treats you as a Scottish taxpayer. Consider switching the region to Scotland.');
      if (prefix === 'C' && region !== 'wales') notes.push('Your code starts with C, which means HMRC treats you as a Welsh taxpayer. Welsh rates currently match England and Northern Ireland.');
    }

    if (/^K\d+$/.test(code)) {
      return { type: 'unsupported', code: rawCode, reason: 'K codes (which add to your taxable income and cap tax at 50% of pay) are not supported by this calculator.' };
    }
    if (code === 'NT') return { type: 'no-tax', code: rawCode, notes };
    const flatTable = isScotland(region) ? FLAT_CODES.scotland : FLAT_CODES.rUK;
    if (Object.prototype.hasOwnProperty.call(flatTable, code)) {
      return { type: 'flat', rate: flatTable[code], code: rawCode, notes };
    }
    const m = code.match(/^(\d{1,4})([LMNT])$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const isStandard = `${num}${m[2]}` === STANDARD_CODE;
      return { type: 'allowance', allowance: num * 10, taper: isStandard, isStandard, code: rawCode, notes };
    }
    return { type: 'unsupported', code: rawCode, reason: `"${rawCode}" isn't a tax code this calculator recognises. Supported formats include 1257L, 1100L, 0T, BR, D0, D1 and NT.` };
  }

  // Personal allowance after the £100,000 taper: reduced by £1 for every
  // £2 of adjusted net income above the threshold, down to zero.
  function taperedAllowance(baseAllowance, adjustedNetIncome, threshold) {
    const excess = Math.max(0, adjustedNetIncome - threshold);
    return Math.max(0, baseAllowance - excess / 2);
  }

  // Applies the banded rates to taxable income. Returns the total and a
  // per-band breakdown (only bands that are actually used).
  function bandedTax(taxableIncome, bands) {
    let remaining = Math.max(0, taxableIncome);
    let lower = 0;
    let total = 0;
    const breakdown = [];
    for (const band of bands) {
      if (remaining <= 0) break;
      const width = band.upTo - lower;
      const amount = Math.min(remaining, width);
      const tax = amount * band.rate;
      breakdown.push({ name: band.name, rate: band.rate, amount, tax });
      total += tax;
      remaining -= amount;
      lower = band.upTo;
    }
    return { total, breakdown };
  }

  // Employee Class 1 NI (category A) on annual earnings.
  function employeeNI(earnings, ni) {
    const main = Math.max(0, Math.min(earnings, ni.upperEarningsLimit) - ni.primaryThreshold) * ni.mainRate;
    const upper = Math.max(0, earnings - ni.upperEarningsLimit) * ni.upperRate;
    return main + upper;
  }

  function loanRepayment(earnings, plan) {
    if (!plan) return 0;
    return Math.max(0, earnings - plan.threshold) * plan.rate;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  // Main entry point. All money amounts are annual.
  //
  // options:
  //   taxYear      '2026-27' | '2025-26'
  //   region       'england' | 'wales' | 'northern-ireland' | 'scotland'
  //   grossAnnual  gross salary before any deductions
  //   taxCode      PAYE code (default 1257L)
  //   pension      { method: 'none'|'net-pay'|'relief-at-source'|'salary-sacrifice',
  //                  percent?: % of gross salary, fixedAnnual?: £ per year }
  //                For relief at source, the amount is the total going into
  //                the pension; 80% comes out of pay and the provider claims
  //                the 20% basic-rate relief.
  //   studentLoan  'none'|'plan1'|'plan2'|'plan4'|'plan5'
  //   postgraduate boolean
  function calculateTakeHome(options) {
    const year = TAX_YEARS[options.taxYear || DEFAULT_TAX_YEAR];
    if (!year) throw new Error(`Unsupported tax year: ${options.taxYear}`);
    const region = options.region || 'england';
    const gross = Number(options.grossAnnual);
    const errors = [];
    const notes = [];

    if (!isFinite(gross) || gross < 0) errors.push('Enter a gross salary of £0 or more.');

    const pensionOpts = options.pension || { method: 'none' };
    const method = pensionOpts.method || 'none';
    let pensionContribution = 0;
    if (method !== 'none') {
      if (pensionOpts.fixedAnnual != null) pensionContribution = Number(pensionOpts.fixedAnnual);
      else pensionContribution = gross * (Number(pensionOpts.percent) || 0) / 100;
      if (!isFinite(pensionContribution) || pensionContribution < 0) errors.push('Pension contribution must be zero or more.');
      if (pensionContribution > gross) errors.push('Pension contribution can’t be more than your gross salary.');
    }

    const code = parseTaxCode(options.taxCode, region);
    if (code.type === 'unsupported') errors.push(code.reason);
    if (code.notes) notes.push(...code.notes);

    let plan = null;
    const planKey = options.studentLoan || 'none';
    if (planKey !== 'none') {
      if (!Object.prototype.hasOwnProperty.call(year.studentLoans, planKey)) errors.push('Unknown student loan plan.');
      else if (!year.studentLoans[planKey]) errors.push(`HMRC's ${year.label} employer rates don't include a threshold for this plan, so it can't be calculated for that tax year.`);
      else plan = year.studentLoans[planKey];
    }

    if (errors.length) return { ok: false, errors };

    // Pay figures each deduction is based on.
    //   salary sacrifice — contractually lower pay: reduces tax, NI and
    //                      student loan earnings
    //   net pay          — taken before tax, but NI and student loans are
    //                      still worked out on the full salary
    //   relief at source — taken from pay after tax; nothing changes the
    //                      tax, NI or student loan calculations
    const sacrifice = method === 'salary-sacrifice' ? pensionContribution : 0;
    const contractualPay = gross - sacrifice;
    const taxablePay = method === 'net-pay' ? gross - pensionContribution : contractualPay;
    const niPay = contractualPay;

    // Income Tax
    const bands = isScotland(region) ? year.bands.scotland : year.bands.rUK;
    let allowance = 0;
    let taxable = 0;
    let incomeTax = 0;
    let taxBreakdown = [];
    if (code.type === 'allowance') {
      allowance = code.taper ? taperedAllowance(code.allowance, taxablePay, year.taperThreshold) : code.allowance;
      if (code.taper && allowance < code.allowance) {
        notes.push(`Your income is over £${year.taperThreshold.toLocaleString('en-GB')}, so your personal allowance is reduced by £1 for every £2 above that, to £${Math.round(allowance).toLocaleString('en-GB')}.`);
      }
      if (!code.isStandard) {
        notes.push('A non-standard tax code has been used as entered, with no further personal allowance taper applied.');
      }
      taxable = Math.max(0, taxablePay - allowance);
      const banded = bandedTax(taxable, bands);
      incomeTax = banded.total;
      taxBreakdown = banded.breakdown;
    } else if (code.type === 'flat') {
      taxable = Math.max(0, taxablePay);
      incomeTax = taxable * code.rate;
      taxBreakdown = [{ name: `Flat rate (${code.code})`, rate: code.rate, amount: taxable, tax: incomeTax }];
    }

    const nationalInsurance = employeeNI(niPay, year.ni);
    const studentLoan = loanRepayment(niPay, plan);
    const postgraduateLoan = options.postgraduate ? loanRepayment(niPay, year.postgraduateLoan) : 0;

    // What actually leaves your pay for the pension, and what ends up in it.
    let pensionFromPay = 0;
    let pensionInvested = 0;
    if (method === 'salary-sacrifice' || method === 'net-pay') {
      pensionFromPay = pensionContribution;
      pensionInvested = pensionContribution;
    } else if (method === 'relief-at-source') {
      pensionFromPay = pensionContribution * 0.8;
      pensionInvested = pensionContribution;
      notes.push('With relief at source, 80% of your contribution comes out of take-home pay and your pension provider claims the other 20% from HMRC. Any higher-rate relief you’re due has to be claimed separately and isn’t included.');
    }

    const totalDeductions = incomeTax + nationalInsurance + studentLoan + postgraduateLoan + pensionFromPay;
    const netAnnual = gross - totalDeductions;

    const r = (n) => round2(n);
    return {
      ok: true,
      taxYear: options.taxYear || DEFAULT_TAX_YEAR,
      taxYearLabel: year.label,
      region,
      gross: r(gross),
      personalAllowance: r(allowance),
      taxableIncome: r(taxable),
      incomeTax: r(incomeTax),
      taxBreakdown: taxBreakdown.map((b) => ({ ...b, amount: r(b.amount), tax: r(b.tax) })),
      nationalInsurance: r(nationalInsurance),
      studentLoan: r(studentLoan),
      postgraduateLoan: r(postgraduateLoan),
      pensionMethod: method,
      pensionFromPay: r(pensionFromPay),
      pensionInvested: r(pensionInvested),
      totalDeductions: r(totalDeductions),
      netAnnual: r(netAnnual),
      netMonthly: r(netAnnual / 12),
      netWeekly: r(netAnnual / 52),
      effectiveDeductionRate: gross > 0 ? totalDeductions / gross : 0,
      notes,
      sources: year.sources,
    };
  }

  // How much of an extra £`step` of gross pay you'd keep — i.e. the
  // combined marginal rate of tax, NI and student loan at this salary.
  function marginalRetention(options, step = 100) {
    const a = calculateTakeHome(options);
    const b = calculateTakeHome({ ...options, grossAnnual: Number(options.grossAnnual) + step });
    if (!a.ok || !b.ok) return null;
    return (b.netAnnual - a.netAnnual) / step;
  }

  // Converts a pay figure at a given frequency to annual.
  function toAnnual(amount, frequency) {
    if (frequency === 'monthly') return amount * 12;
    if (frequency === 'weekly') return amount * 52;
    return amount;
  }

  return {
    TAX_YEARS, DEFAULT_TAX_YEAR, STANDARD_CODE,
    parseTaxCode, taperedAllowance, bandedTax, employeeNI, loanRepayment,
    calculateTakeHome, marginalRetention, toAnnual,
  };
});
