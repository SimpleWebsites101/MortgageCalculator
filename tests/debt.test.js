// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../calc-debt.js');

const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('APR converts to the monthly rate that compounds back to it', () => {
  close(Math.pow(1 + D.monthlyRate(19.9), 12), 1.199, 1e-12);
  close(D.monthlyRate(12, 'nominal'), 0.01, 1e-12);
});

test('zero-interest debt', () => {
  const r = D.repaySingleDebt({ balance: 1000, annualRate: 0, payment: 100 });
  assert.equal(r.months, 10);
  close(r.totalInterest, 0);
  close(r.totalPaid, 1000);
});

test('final payment is only what is left', () => {
  const r = D.repaySingleDebt({ balance: 1050, annualRate: 0, payment: 100 });
  assert.equal(r.months, 11);
  close(r.finalPayment, 50);
});

test('payments that do not cover interest are flagged, not simulated', () => {
  const r = D.repaySingleDebt({ balance: 10000, annualRate: 24, payment: 150 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'payment-too-low');
  // exactly equal to the interest is also too low
  const i = Math.round(10000 * 100 * D.monthlyRate(24)) / 100;
  assert.equal(D.repaySingleDebt({ balance: 10000, annualRate: 24, payment: i }).ok, false);
});

test('a payment barely above interest that would take over 50 years is rejected', () => {
  const r = D.repaySingleDebt({ balance: 10000, annualRate: 20, payment: 153.10 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'too-long');
});

test('standard amortising loan clears in the expected term and the books balance', () => {
  // £10,000 at 12% nominal over 12 months -> £888.49 a month
  const r = D.repaySingleDebt({ balance: 10000, annualRate: 12, rateType: 'nominal', payment: 888.49 });
  assert.equal(r.months, 12);
  close(r.totalPaid, 10000 + r.totalInterest);
  assert.ok(r.finalPayment <= 888.49 && r.finalPayment > 880);
});

test('extra repayments save time and interest', () => {
  const a = D.repaySingleDebt({ balance: 5000, annualRate: 22.9, payment: 150 });
  const b = D.repaySingleDebt({ balance: 5000, annualRate: 22.9, payment: 150, extra: 50 });
  assert.ok(b.months < a.months);
  assert.ok(b.totalInterest < a.totalInterest);
});

test('invalid inputs', () => {
  assert.equal(D.repaySingleDebt({ balance: 0, annualRate: 5, payment: 10 }).ok, false);
  assert.equal(D.repaySingleDebt({ balance: 100, annualRate: -1, payment: 10 }).ok, false);
  assert.equal(D.repaySingleDebt({ balance: 100, annualRate: 5, payment: NaN }).ok, false);
});

const debts = [
  { name: 'Store card', balance: 500, rate: 5, minPayment: 25 },
  { name: 'Credit card', balance: 3000, rate: 25, minPayment: 75 },
  { name: 'Car loan', balance: 6000, rate: 9, minPayment: 150 },
];

test('priority orders and tie-breaks', () => {
  assert.deepEqual(D.priorityOrder(debts, 'snowball'), [0, 1, 2]);
  assert.deepEqual(D.priorityOrder(debts, 'avalanche'), [1, 2, 0]);
  const tied = [
    { name: 'A', balance: 1000, rate: 10, minPayment: 20 },
    { name: 'B', balance: 1000, rate: 15, minPayment: 20 },
    { name: 'C', balance: 1000, rate: 15, minPayment: 20 },
  ];
  assert.deepEqual(D.priorityOrder(tied, 'snowball'), [1, 2, 0]);
  assert.deepEqual(D.priorityOrder(tied, 'avalanche'), [1, 2, 0]);
});

test('both strategies spend the same budget every month until the final one', () => {
  const c = D.compareStrategies(debts, 200);
  assert.equal(c.ok, true);
  for (const s of [c.snowball, c.avalanche]) {
    assert.equal(s.monthlyBudget, 450);
    s.schedule.slice(0, -1).forEach((m) => close(m.totalPaid, 450));
    assert.ok(s.schedule[s.schedule.length - 1].totalPaid <= 450);
  }
});

test('books balance: total paid = starting debt + interest', () => {
  const c = D.compareStrategies(debts, 200);
  for (const s of [c.snowball, c.avalanche]) close(s.totalPaid, 9500 + s.totalInterest, 0.01);
});

test('avalanche never pays more interest than snowball', () => {
  const c = D.compareStrategies(debts, 200);
  assert.ok(c.avalanche.totalInterest <= c.snowball.totalInterest);
  assert.ok(c.interestDifference >= 0);
});

test('snowball clears the smallest balance first', () => {
  const c = D.compareStrategies(debts, 200);
  assert.equal(c.snowball.payoffOrder[0].name, 'Store card');
  assert.equal(c.avalanche.priority[0], 1);
});

test('freed-up minimums roll into the next target', () => {
  const s = D.simulateStrategy(debts, 200, 'snowball');
  const cleared = s.payoffOrder[0].month; // store card
  const next = s.schedule[cleared]; // the month after
  // credit card receives its own minimum + the extra + the store card's freed minimum
  close(next.payments[1], 75 + 200 + 25);
});

test('all zero-interest debts', () => {
  const zero = debts.map((d) => ({ ...d, rate: 0 }));
  const s = D.simulateStrategy(zero, 50, 'avalanche');
  close(s.totalInterest, 0);
  assert.equal(s.months, Math.ceil(9500 / 300));
});

test('insufficient budget is reported', () => {
  const r = D.simulateStrategy([{ name: 'Big', balance: 20000, rate: 30, minPayment: 100 }], 0, 'avalanche');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'budget-too-low');
});

test('a minimum below its own interest is flagged but can still be cleared by the extra', () => {
  const list = [
    { name: 'Small', balance: 200, rate: 10, minPayment: 20 },
    { name: 'Card', balance: 4000, rate: 30, minPayment: 50 },
  ];
  const s = D.simulateStrategy(list, 300, 'snowball');
  assert.equal(s.ok, true);
  assert.equal(s.minimumBelowInterest.length, 1);
  assert.equal(s.minimumBelowInterest[0].name, 'Card');
});

test('invalid debts are rejected', () => {
  assert.equal(D.simulateStrategy([], 100, 'snowball').ok, false);
  assert.equal(D.simulateStrategy([{ name: 'x', balance: 100, rate: 5, minPayment: 0 }], 0, 'snowball').ok, false);
});

test('payment for a target term clears the debt in that many months', () => {
  for (const [bal, rate, months] of [[4000, 22.9, 24], [10000, 0, 36], [2500, 39.9, 12]]) {
    const p = D.paymentForTerm(bal, rate, 'apr', months);
    const r = D.repaySingleDebt({ balance: bal, annualRate: rate, payment: p });
    assert.equal(r.months, months);
  }
});
