// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../calc-pay.js');
const B = require('../calc-budget.js');

const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('hourly to salary: basic hours only', () => {
  const r = P.hourlyToSalary({ hourlyRate: 12, hoursPerWeek: 37.5 });
  close(r.annual, 23400);
  close(r.monthlyAverage, 1950);
  close(r.annualHours, 1950);
  close(r.overtimeAnnual, 0);
});

test('hourly to salary: overtime is only paid in overtime weeks', () => {
  const r = P.hourlyToSalary({ hourlyRate: 12, hoursPerWeek: 37.5, overtimeHours: 5, overtimeMultiplier: 1.5 });
  close(r.overtimeRate, 18);
  close(r.typicalWeek, 450 + 90);
  close(r.overtimeAnnual, 90 * 46.4);
  close(r.annual, 23400 + 4176);
});

test('hourly to salary: unpaid weeks reduce annual pay', () => {
  const r = P.hourlyToSalary({ hourlyRate: 15, hoursPerWeek: 30, paidWeeks: 39 });
  close(r.annual, 15 * 30 * 39);
  close(r.weeklyAverage, (15 * 30 * 39) / 52);
});

test('hourly to salary: invalid inputs', () => {
  assert.equal(P.hourlyToSalary({ hourlyRate: -1, hoursPerWeek: 30 }).ok, false);
  assert.equal(P.hourlyToSalary({ hourlyRate: 10, hoursPerWeek: 200 }).ok, false);
  assert.equal(P.hourlyToSalary({ hourlyRate: 10, hoursPerWeek: 40, paidWeeks: 53 }).ok, false);
  assert.equal(P.hourlyToSalary({ hourlyRate: NaN, hoursPerWeek: 40 }).ok, false);
});

test('budget: frequencies convert to monthly', () => {
  close(B.toMonthly(100, 'weekly'), 433.33);
  close(B.toMonthly(1200, 'annual'), 100);
  close(B.toMonthly(300, 'quarterly'), 100);
});

test('budget: totals, surplus and savings rate', () => {
  const r = B.summariseBudget([
    { label: 'Pay', amount: 2500, kind: 'income' },
    { label: 'Rent', amount: 1000, kind: 'expense' },
    { label: 'Food', amount: 75, frequency: 'weekly', kind: 'expense' },
    { label: 'Car insurance', amount: 600, frequency: 'annual', kind: 'expense' },
    { label: 'ISA', amount: 250, kind: 'savings' },
  ]);
  close(r.expenses, 1000 + 325 + 50);
  close(r.remaining, 2500 - 1375 - 250);
  close(r.savingsRate, 0.1, 1e-9);
  close(r.annual.remaining, (2500 - 1625) * 12);
  assert.equal(r.categories[0].label, 'Rent');
});

test('budget: shortfall and zero income', () => {
  const r = B.summariseBudget([{ label: 'Rent', amount: 800, kind: 'expense' }]);
  close(r.remaining, -800);
  assert.equal(r.savingsRate, null);
});

test('budget: negative amounts are rejected', () => {
  assert.equal(B.summariseBudget([{ label: 'Rent', amount: -5, kind: 'expense' }]).ok, false);
});
