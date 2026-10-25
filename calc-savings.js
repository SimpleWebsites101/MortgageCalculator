// 24/7 UK Mortgage Calculator — shared savings maths
//
// Used by the Savings Growth, Savings Goal and Fixed-Rate Savings
// calculators so all three make identical interest-rate and contribution
// assumptions. Pure functions only (no DOM access), so the same file runs
// in the browser (as window.SavingsCalc) and under Node for the tests.
//
// Rates are passed in as percentages (e.g. 4.5 for 4.5% AER).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SavingsCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // AER is an annual *effective* rate: the growth you'd see over a year with
  // interest compounded. The equivalent monthly rate is the one that,
  // compounded 12 times, reproduces it exactly:
  //   (1 + monthly)^12 = 1 + AER   =>   monthly = (1 + AER)^(1/12) - 1
  // (Dividing AER by 12 would overstate growth slightly.)
  function monthlyRateFromAER(aerPercent) {
    return Math.pow(1 + aerPercent / 100, 1 / 12) - 1;
  }

  // Closed-form future value — used by the goal solver and as an
  // independent cross-check of the month-by-month simulation in tests.
  // timing: 'start' (contribution paid at the start of each month, so it
  // earns that month's interest) or 'end'.
  function futureValue(initial, monthly, aerPercent, months, timing) {
    const r = monthlyRateFromAER(aerPercent);
    if (r === 0) return initial + monthly * months;
    const growth = Math.pow(1 + r, months);
    const annuity = ((growth - 1) / r) * (timing === 'start' ? 1 + r : 1);
    return initial * growth + monthly * annuity;
  }

  // Month-by-month projection with a year-by-year summary. Values are kept
  // unrounded internally; rounding happens only for display.
  function projectSavings({ initial, monthly, aerPercent, months, timing = 'end' }) {
    const r = monthlyRateFromAER(aerPercent);
    let balance = initial;
    let contributed = initial;
    let interestTotal = 0;
    const years = [];
    let year = null;

    for (let m = 1; m <= months; m++) {
      if (!year) {
        year = { year: years.length + 1, opening: balance, contributions: 0, interest: 0, closing: 0, monthsInYear: 0 };
      }
      if (timing === 'start') {
        balance += monthly;
        contributed += monthly;
        year.contributions += monthly;
      }
      const interest = balance * r;
      balance += interest;
      interestTotal += interest;
      year.interest += interest;
      if (timing !== 'start') {
        balance += monthly;
        contributed += monthly;
        year.contributions += monthly;
      }
      year.monthsInYear++;
      if (year.monthsInYear === 12 || m === months) {
        year.closing = balance;
        year.totalContributed = contributed;
        year.totalInterest = interestTotal;
        years.push(year);
        year = null;
      }
    }

    return {
      finalBalance: balance,
      totalContributed: contributed,
      newContributions: contributed - initial,
      totalInterest: interestTotal,
      monthlyRate: r,
      years,
    };
  }

  // Monthly contribution needed to reach `target` in `months`, given what is
  // already saved. Returns { status, monthly, ... }:
  //   'achieved'  — current savings already meet the target today
  //   'on-track'  — interest on current savings alone reaches it in time
  //   'needs'     — a positive monthly contribution is required
  function requiredMonthlyContribution({ target, initial, aerPercent, months, timing = 'end' }) {
    if (initial >= target) {
      return { status: 'achieved', monthly: 0, projectedWithoutContributions: futureValue(initial, 0, aerPercent, months, timing) };
    }
    const fromCurrent = futureValue(initial, 0, aerPercent, months, timing);
    if (fromCurrent >= target) {
      return { status: 'on-track', monthly: 0, projectedWithoutContributions: fromCurrent };
    }
    const r = monthlyRateFromAER(aerPercent);
    const annuity = r === 0
      ? months
      : ((Math.pow(1 + r, months) - 1) / r) * (timing === 'start' ? 1 + r : 1);
    return {
      status: 'needs',
      monthly: (target - fromCurrent) / annuity,
      projectedWithoutContributions: fromCurrent,
    };
  }

  // Fixed-term deposit. Real products differ in how often interest is
  // credited and whether it's left to compound or paid out, so the caller
  // chooses. Given an AER:
  //   'monthly'  — credited monthly at the AER-equivalent monthly rate
  //   'annually' — credited each 12 months at the AER; any final part-year
  //                is credited pro rata (simple interest) at maturity
  //   'maturity' — one payment at the end, sized so the effective annual
  //                rate equals the AER: P × ((1 + AER)^(months/12) − 1)
  // treatment: 'compound' (left in the account) or 'paid-out' (paid to
  // another account, so it never earns interest itself). 'maturity' only
  // makes sense as a single credit, so treatment is ignored for it.
  function fixedRateDeposit({ deposit, aerPercent, months, frequency = 'annually', treatment = 'compound' }) {
    const aer = aerPercent / 100;
    const periods = [];
    let balance = deposit;
    let paidOut = 0;
    let interestTotal = 0;
    const compound = treatment !== 'paid-out';

    if (frequency === 'maturity') {
      const interest = deposit * (Math.pow(1 + aer, months / 12) - 1);
      balance += interest;
      interestTotal = interest;
      periods.push({ label: `At maturity (month ${months})`, endMonth: months, opening: deposit, interest, paidOut: 0, closing: balance });
    } else if (frequency === 'monthly') {
      const g = monthlyRateFromAER(aerPercent);
      for (let m = 1; m <= months; m++) {
        const opening = balance;
        const interest = (compound ? balance : deposit) * g;
        interestTotal += interest;
        if (compound) balance += interest; else paidOut += interest;
        periods.push({ label: `Month ${m}`, endMonth: m, opening, interest, paidOut: compound ? 0 : interest, closing: balance });
      }
    } else {
      let m = 0;
      let n = 1;
      while (m < months) {
        const span = Math.min(12, months - m);
        const opening = balance;
        const interest = (compound ? balance : deposit) * aer * (span / 12);
        interestTotal += interest;
        if (compound) balance += interest; else paidOut += interest;
        m += span;
        periods.push({
          label: span === 12 ? `Year ${n}` : `Final ${span} month${span === 1 ? '' : 's'}`,
          endMonth: m, opening, interest, paidOut: compound ? 0 : interest, closing: balance,
        });
        n++;
      }
    }

    const years = months / 12;
    const totalReturn = interestTotal / deposit;
    return {
      maturityBalance: balance,
      interestPaidOut: paidOut,
      totalInterest: interestTotal,
      totalReceived: balance + paidOut,
      growthOverTerm: totalReturn,
      // Effective annual growth actually achieved by this arrangement.
      effectiveAnnualRate: years > 0 ? Math.pow(1 + totalReturn, 1 / years) - 1 : 0,
      // Nominal rate per period that the provider would quote as "gross".
      grossRateMonthly: monthlyRateFromAER(aerPercent) * 12,
      periods,
    };
  }

  return { monthlyRateFromAER, futureValue, projectSavings, requiredMonthlyContribution, fixedRateDeposit };
});
