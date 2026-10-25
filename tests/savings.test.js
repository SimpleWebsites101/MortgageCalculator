// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../calc-savings.js');

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('monthly rate compounds back to the AER exactly', () => {
  const r = S.monthlyRateFromAER(5);
  close(Math.pow(1 + r, 12), 1.05, 1e-12);
  assert.equal(S.monthlyRateFromAER(0), 0);
});

test('lump sum for one year grows by exactly the AER', () => {
  const p = S.projectSavings({ initial: 1000, monthly: 0, aerPercent: 5, months: 12 });
  close(p.finalBalance, 1050);
  close(p.totalInterest, 50);
});

test('zero interest: balance is just the sum of contributions', () => {
  const p = S.projectSavings({ initial: 1000, monthly: 100, aerPercent: 0, months: 12 });
  close(p.finalBalance, 2200);
  close(p.totalInterest, 0);
  close(p.newContributions, 1200);
});

test('zero contributions and zero balance stay at zero', () => {
  const p = S.projectSavings({ initial: 0, monthly: 0, aerPercent: 4, months: 60 });
  close(p.finalBalance, 0);
});

test('simulation matches the closed-form future value for both timings', () => {
  for (const timing of ['start', 'end']) {
    for (const [aer, months] of [[3.5, 7], [4.2, 120], [0, 36], [12, 480]]) {
      const p = S.projectSavings({ initial: 2500, monthly: 175, aerPercent: aer, months, timing });
      close(p.finalBalance, S.futureValue(2500, 175, aer, months, timing), 1e-6 * Math.max(1, p.finalBalance));
    }
  }
});

test('start-of-month contributions earn more than end-of-month', () => {
  const s = S.projectSavings({ initial: 0, monthly: 100, aerPercent: 5, months: 24, timing: 'start' });
  const e = S.projectSavings({ initial: 0, monthly: 100, aerPercent: 5, months: 24, timing: 'end' });
  assert.ok(s.finalBalance > e.finalBalance);
  close(s.newContributions, e.newContributions);
});

test('high rate and long period', () => {
  close(S.projectSavings({ initial: 1000, monthly: 0, aerPercent: 50, months: 120 }).finalBalance, 57665.04);
  const p = S.projectSavings({ initial: 0, monthly: 200, aerPercent: 5, months: 600 });
  assert.equal(p.years.length, 50);
  close(p.years[49].closing, p.finalBalance);
});

test('year breakdown handles a final part year and adds up', () => {
  const p = S.projectSavings({ initial: 500, monthly: 50, aerPercent: 4, months: 30 });
  assert.equal(p.years.length, 3);
  assert.equal(p.years[2].monthsInYear, 6);
  const sumInterest = p.years.reduce((s, y) => s + y.interest, 0);
  close(sumInterest, p.totalInterest, 1e-9);
  close(p.years[1].opening, p.years[0].closing, 1e-9);
});

test('goal: zero interest is a simple division', () => {
  const g = S.requiredMonthlyContribution({ target: 10000, initial: 0, aerPercent: 0, months: 20 });
  assert.equal(g.status, 'needs');
  close(g.monthly, 500);
});

test('goal: required contribution hits the target exactly', () => {
  for (const timing of ['start', 'end']) {
    const g = S.requiredMonthlyContribution({ target: 25000, initial: 3000, aerPercent: 4.5, months: 54, timing });
    const p = S.projectSavings({ initial: 3000, monthly: g.monthly, aerPercent: 4.5, months: 54, timing });
    close(p.finalBalance, 25000, 1e-6);
  }
});

test('goal already achieved', () => {
  const g = S.requiredMonthlyContribution({ target: 5000, initial: 5000, aerPercent: 3, months: 12 });
  assert.equal(g.status, 'achieved');
  assert.equal(g.monthly, 0);
});

test('goal reached by interest alone', () => {
  const g = S.requiredMonthlyContribution({ target: 10000, initial: 9000, aerPercent: 5, months: 36 });
  assert.equal(g.status, 'on-track');
  assert.equal(g.monthly, 0);
});

test('goal: a higher rate never needs a larger contribution', () => {
  let prev = Infinity;
  for (const aer of [0, 1, 2, 3, 4, 5, 6, 8]) {
    const g = S.requiredMonthlyContribution({ target: 20000, initial: 1000, aerPercent: aer, months: 60 });
    assert.ok(g.monthly <= prev);
    prev = g.monthly;
  }
});

test('fixed rate: interest added annually compounds at the AER', () => {
  const f = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 24, frequency: 'annually', treatment: 'compound' });
  close(f.maturityBalance, 10816);
  close(f.effectiveAnnualRate, 0.04, 1e-9);
});

test('fixed rate: monthly compounding reproduces the AER over a year', () => {
  const f = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 12, frequency: 'monthly', treatment: 'compound' });
  close(f.totalInterest, 400);
  assert.equal(f.periods.length, 12);
});

test('fixed rate: interest paid out earns less than interest left to compound', () => {
  const out = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 12, frequency: 'monthly', treatment: 'paid-out' });
  close(out.totalInterest, 392.85);
  close(out.maturityBalance, 10000);
  close(out.totalReceived, 10392.85);
});

test('fixed rate: part years', () => {
  const annualOut = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 18, frequency: 'annually', treatment: 'paid-out' });
  close(annualOut.totalInterest, 600);
  const annualIn = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 18, frequency: 'annually', treatment: 'compound' });
  close(annualIn.totalInterest, 400 + 10400 * 0.02);
  const maturity = S.fixedRateDeposit({ deposit: 10000, aerPercent: 4, months: 18, frequency: 'maturity' });
  close(maturity.totalInterest, 605.96);
});

test('fixed rate: zero interest', () => {
  const f = S.fixedRateDeposit({ deposit: 5000, aerPercent: 0, months: 36, frequency: 'monthly' });
  close(f.totalInterest, 0);
  close(f.maturityBalance, 5000);
});
