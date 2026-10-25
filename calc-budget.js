// 24/7 UK Mortgage Calculator — monthly budget maths
//
// Turns a list of income and spending lines (each with its own frequency)
// into monthly and annual totals. Pure functions only (window.BudgetCalc in
// the browser, module.exports in Node for tests). Nothing is stored or sent.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BudgetCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Multipliers to convert an amount at each frequency to a monthly figure.
  const TO_MONTHLY = {
    weekly: 52 / 12,
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };

  function toMonthly(amount, frequency) {
    const factor = TO_MONTHLY[frequency || 'monthly'];
    if (factor == null) throw new Error(`Unknown frequency: ${frequency}`);
    return amount * factor;
  }

  // lines: [{ label, amount, frequency, kind: 'income'|'expense'|'savings' }]
  // Blank amounts should be passed as 0. Negative amounts are rejected.
  function summariseBudget(lines) {
    const errors = [];
    let income = 0;
    let expenses = 0;
    let savings = 0;
    const categories = [];

    lines.forEach((line, i) => {
      const amount = Number(line.amount);
      if (!isFinite(amount) || amount < 0) {
        errors.push(`${line.label || `Line ${i + 1}`}: enter an amount of £0 or more.`);
        return;
      }
      const monthly = toMonthly(amount, line.frequency);
      if (line.kind === 'income') income += monthly;
      else if (line.kind === 'savings') savings += monthly;
      else expenses += monthly;
      if (line.kind !== 'income') categories.push({ label: line.label, kind: line.kind, monthly });
    });

    if (errors.length) return { ok: false, errors };

    const remaining = income - expenses - savings;
    const outgoings = expenses + savings;
    return {
      ok: true,
      income,
      expenses,
      savings,
      outgoings,
      remaining,
      savingsRate: income > 0 ? savings / income : null,
      // Savings rate if any surplus were also saved (never below the actual).
      potentialSavingsRate: income > 0 ? (savings + Math.max(remaining, 0)) / income : null,
      categories: categories
        .filter((c) => c.monthly > 0)
        .map((c) => ({
          ...c,
          shareOfIncome: income > 0 ? c.monthly / income : null,
          shareOfOutgoings: outgoings > 0 ? c.monthly / outgoings : null,
        }))
        .sort((a, b) => b.monthly - a.monthly),
      annual: { income: income * 12, expenses: expenses * 12, savings: savings * 12, remaining: remaining * 12 },
    };
  }

  return { TO_MONTHLY, toMonthly, summariseBudget };
});
