// 24/7 UK Mortgage Calculator — shared debt repayment maths
//
// Used by the Debt Repayment and Debt Snowball vs Avalanche calculators so
// both convert rates, accrue interest and round in exactly the same way.
// Pure functions only (window.DebtCalc in the browser, module.exports in
// Node for tests).
//
// All simulation is done in whole pence, so rounding is explicit: each
// month's interest is rounded to the nearest penny, and the final payment
// is exactly what's left rather than a full instalment.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DebtCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_MONTHS = 600; // 50-year safety cap

  // UK lenders quote an APR, which is an annual *effective* rate, so the
  // monthly rate that compounds to it is (1 + APR)^(1/12) − 1. Some
  // agreements instead quote a nominal yearly rate charged monthly
  // (rate ÷ 12) — the caller can choose that with rateType 'nominal'.
  function monthlyRate(annualPercent, rateType = 'apr') {
    const a = annualPercent / 100;
    if (rateType === 'nominal') return a / 12;
    return Math.pow(1 + a, 1 / 12) - 1;
  }

  const toPence = (pounds) => Math.round(pounds * 100);
  const toPounds = (pence) => pence / 100;

  // Level monthly payment that clears `balance` in exactly `months`
  // (standard annuity formula), rounded up to the next penny so it never
  // falls short. Used to suggest workable payments when one is too low.
  function paymentForTerm(balance, annualRate, rateType, months) {
    const r = monthlyRate(annualRate, rateType);
    const exact = r === 0 ? balance / months : (balance * r) / (1 - Math.pow(1 + r, -months));
    return Math.ceil(exact * 100 - 1e-7) / 100;
  }

  // Single debt with a fixed monthly payment. Interest is added at the end
  // of each month, then the payment is taken.
  function repaySingleDebt({ balance, annualRate, rateType = 'apr', payment, extra = 0 }) {
    const errors = [];
    if (!(balance > 0)) errors.push('Enter an outstanding balance above £0.');
    if (!(annualRate >= 0 && annualRate <= 100)) errors.push('Interest rate must be between 0% and 100%.');
    if (!(payment > 0)) errors.push('Enter a monthly repayment above £0.');
    if (!(extra >= 0)) errors.push('Additional repayment can’t be negative.');
    if (errors.length) return { ok: false, errors };

    const r = monthlyRate(annualRate, rateType);
    let bal = toPence(balance);
    const pay = toPence(payment + extra);
    const firstInterest = Math.round(bal * r);
    if (pay <= firstInterest) {
      return {
        ok: false,
        reason: 'payment-too-low',
        firstMonthInterest: toPounds(firstInterest),
        errors: [`A monthly payment of £${(pay / 100).toFixed(2)} doesn’t cover the £${(firstInterest / 100).toFixed(2)} of interest charged in the first month, so the balance would never fall. Increase the payment to more than the monthly interest.`],
      };
    }

    const schedule = [];
    let totalInterest = 0;
    let totalPaid = 0;
    let month = 0;
    while (bal > 0 && month < MAX_MONTHS) {
      month++;
      const opening = bal;
      const interest = Math.round(bal * r);
      bal += interest;
      const thisPayment = Math.min(pay, bal);
      bal -= thisPayment;
      totalInterest += interest;
      totalPaid += thisPayment;
      schedule.push({ month, opening: toPounds(opening), interest: toPounds(interest), payment: toPounds(thisPayment), closing: toPounds(bal) });
    }
    if (bal > 0) {
      return { ok: false, reason: 'too-long', errors: [`At this payment the debt would take longer than ${MAX_MONTHS / 12} years to clear. Try a higher monthly payment.`] };
    }
    return {
      ok: true,
      months: month,
      totalInterest: toPounds(totalInterest),
      totalPaid: toPounds(totalPaid),
      finalPayment: schedule[schedule.length - 1].payment,
      monthlyRate: r,
      schedule,
    };
  }

  // Order debts are targeted in. Ties are broken deterministically so the
  // result never depends on chance:
  //   snowball  — smallest balance first; ties: higher rate, then list order
  //   avalanche — highest rate first; ties: smaller balance, then list order
  function priorityOrder(debts, strategy) {
    const idx = debts.map((d, i) => i);
    if (strategy === 'snowball') {
      idx.sort((a, b) => debts[a].balance - debts[b].balance || debts[b].rate - debts[a].rate || a - b);
    } else {
      idx.sort((a, b) => debts[b].rate - debts[a].rate || debts[a].balance - debts[b].balance || a - b);
    }
    return idx;
  }

  function validateDebts(debts, extra) {
    const errors = [];
    if (!debts.length) errors.push('Add at least one debt.');
    debts.forEach((d, i) => {
      const name = d.name && d.name.trim() ? d.name.trim() : `Debt ${i + 1}`;
      if (!(d.balance > 0)) errors.push(`${name}: enter a balance above £0.`);
      if (!(d.rate >= 0 && d.rate <= 100)) errors.push(`${name}: interest rate must be between 0% and 100%.`);
      if (!(d.minPayment > 0)) errors.push(`${name}: enter a minimum monthly payment above £0.`);
    });
    if (!(extra >= 0)) errors.push('Additional monthly amount can’t be negative.');
    return errors;
  }

  // Multi-debt simulation with a fixed total monthly budget
  // (sum of minimum payments + extra). Each month:
  //   1. interest is added to every open balance
  //   2. every open debt receives its minimum (or its balance, if smaller)
  //   3. everything left — the extra, plus minimums freed up by debts
  //      already cleared — goes to the highest-priority open debt, then the
  //      next, until the budget is used up
  // Both strategies therefore spend exactly the same amount each month
  // until the last debt is repaid, which keeps the comparison fair.
  function simulateStrategy(debts, extra, strategy, rateType = 'apr') {
    const errors = validateDebts(debts, extra);
    if (errors.length) return { ok: false, errors };

    const rates = debts.map((d) => monthlyRate(d.rate, rateType));
    const bal = debts.map((d) => toPence(d.balance));
    const mins = debts.map((d) => toPence(d.minPayment));
    const budget = mins.reduce((a, b) => a + b, 0) + toPence(extra);
    const order = priorityOrder(debts, strategy);

    const firstInterest = bal.reduce((sum, b, i) => sum + Math.round(b * rates[i]), 0);
    if (budget <= firstInterest) {
      return {
        ok: false,
        reason: 'budget-too-low',
        errors: [`Your total monthly budget of £${(budget / 100).toFixed(2)} doesn’t cover the £${(firstInterest / 100).toFixed(2)} of interest charged across your debts in the first month, so the total would never fall. Increase your payments.`],
      };
    }

    const paidOffMonth = debts.map(() => null);
    const interestByDebt = debts.map(() => 0);
    const schedule = [];
    const totalSeries = [bal.reduce((a, b) => a + b, 0) / 100];
    let totalInterest = 0;
    let totalPaid = 0;
    let month = 0;

    while (bal.some((b) => b > 0) && month < MAX_MONTHS) {
      month++;
      const payments = debts.map(() => 0);
      const interest = debts.map(() => 0);

      bal.forEach((b, i) => {
        if (b > 0) {
          interest[i] = Math.round(b * rates[i]);
          bal[i] += interest[i];
        }
      });

      let available = budget;
      bal.forEach((b, i) => {
        if (b > 0) {
          const p = Math.min(mins[i], b);
          payments[i] += p;
          bal[i] -= p;
          available -= p;
        }
      });
      for (const i of order) {
        if (available <= 0) break;
        if (bal[i] > 0) {
          const p = Math.min(available, bal[i]);
          payments[i] += p;
          bal[i] -= p;
          available -= p;
        }
      }

      bal.forEach((b, i) => {
        if (b === 0 && paidOffMonth[i] === null) paidOffMonth[i] = month;
        interestByDebt[i] += interest[i];
      });
      const monthInterest = interest.reduce((a, b) => a + b, 0);
      const monthPaid = payments.reduce((a, b) => a + b, 0);
      totalInterest += monthInterest;
      totalPaid += monthPaid;
      schedule.push({
        month,
        payments: payments.map(toPounds),
        interest: interest.map(toPounds),
        balances: bal.map(toPounds),
        totalPaid: toPounds(monthPaid),
        totalBalance: toPounds(bal.reduce((a, b) => a + b, 0)),
        unusedBudget: toPounds(budget - monthPaid),
      });
      totalSeries.push(toPounds(bal.reduce((a, b) => a + b, 0)));
    }

    if (bal.some((b) => b > 0)) {
      return { ok: false, reason: 'too-long', errors: [`With this budget your debts would take longer than ${MAX_MONTHS / 12} years to clear. Try increasing the additional monthly amount.`] };
    }

    // Debts whose minimum alone wouldn't cover their own first month's
    // interest — they only clear because extra money reaches them.
    const minimumBelowInterest = debts
      .map((d, i) => ({ index: i, name: d.name, interest: toPounds(Math.round(toPence(d.balance) * rates[i])), minimum: d.minPayment }))
      .filter((x) => toPence(x.minimum) <= toPence(x.interest));

    const payoffOrder = debts
      .map((d, i) => ({ index: i, name: d.name, month: paidOffMonth[i], interest: toPounds(interestByDebt[i]) }))
      .sort((a, b) => a.month - b.month || order.indexOf(a.index) - order.indexOf(b.index));

    return {
      ok: true,
      strategy,
      monthlyBudget: toPounds(budget),
      months: month,
      totalInterest: toPounds(totalInterest),
      totalPaid: toPounds(totalPaid),
      priority: order,
      payoffOrder,
      minimumBelowInterest,
      schedule,
      totalSeries,
    };
  }

  function compareStrategies(debts, extra, rateType = 'apr') {
    const snowball = simulateStrategy(debts, extra, 'snowball', rateType);
    const avalanche = simulateStrategy(debts, extra, 'avalanche', rateType);
    if (!snowball.ok || !avalanche.ok) {
      return { ok: false, errors: (snowball.errors || avalanche.errors) };
    }
    return {
      ok: true,
      snowball,
      avalanche,
      interestDifference: Math.round((snowball.totalInterest - avalanche.totalInterest) * 100) / 100,
      monthDifference: snowball.months - avalanche.months,
    };
  }

  return { MAX_MONTHS, monthlyRate, paymentForTerm, repaySingleDebt, priorityOrder, simulateStrategy, compareStrategies };
});
