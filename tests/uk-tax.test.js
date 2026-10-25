// Run with: node --test tests/
// Expected figures are worked by hand from HMRC's published rates and
// thresholds for employers (2025 to 2026 and 2026 to 2027).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../calc-uk-tax.js');

const base = { taxYear: '2026-27', region: 'england', taxCode: '1257L', pension: { method: 'none' }, studentLoan: 'none', postgraduate: false };
const calc = (o) => T.calculateTakeHome({ ...base, ...o });
const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);

test('basic-rate taxpayer, England 2026/27', () => {
  const r = calc({ grossAnnual: 30000 });
  assert.equal(r.ok, true);
  close(r.incomeTax, 3486);
  close(r.nationalInsurance, 1394.4);
  close(r.netAnnual, 25119.6);
  close(r.netMonthly, 25119.6 / 12, 0.01);
});

test('income at or below the personal allowance pays no tax or NI', () => {
  const r = calc({ grossAnnual: 12570 });
  close(r.incomeTax, 0);
  close(r.nationalInsurance, 0);
  close(r.netAnnual, 12570);
  close(calc({ grossAnnual: 0 }).netAnnual, 0);
});

test('band edges: basic/higher boundary at £50,270', () => {
  const r = calc({ grossAnnual: 50270 });
  close(r.incomeTax, 7540);
  close(r.nationalInsurance, 3016);
  const r2 = calc({ grossAnnual: 50271 });
  close(r2.incomeTax, 7540.4);
  close(r2.nationalInsurance, 3016.02);
});

test('higher-rate taxpayer', () => {
  const r = calc({ grossAnnual: 60000 });
  close(r.incomeTax, 11432);
  close(r.nationalInsurance, 3210.6);
  close(r.netAnnual, 45357.4);
});

test('personal allowance taper between £100,000 and £125,140', () => {
  const r = calc({ grossAnnual: 110000 });
  close(r.personalAllowance, 7570);
  close(r.incomeTax, 33432);
  close(r.nationalInsurance, 4210.6);
  const zero = calc({ grossAnnual: 125140 });
  close(zero.personalAllowance, 0);
  close(zero.incomeTax, 42516);
});

test('additional rate above £125,140', () => {
  close(calc({ grossAnnual: 150000 }).incomeTax, 53703);
});

test('Scottish rates 2026/27 differ from the rest of the UK', () => {
  const s = calc({ grossAnnual: 30000, region: 'scotland' });
  close(s.incomeTax, 3451.07);
  const s80 = calc({ grossAnnual: 80000, region: 'scotland' });
  close(s80.incomeTax, 21732.05);
  // NI is UK-wide, so identical
  close(s.nationalInsurance, calc({ grossAnnual: 30000 }).nationalInsurance);
});

test('Scottish rates 2025/26', () => {
  close(calc({ grossAnnual: 30000, region: 'scotland', taxYear: '2025-26' }).incomeTax, 3482.82);
});

test('Wales and Northern Ireland use the England bands', () => {
  const e = calc({ grossAnnual: 75000 });
  close(calc({ grossAnnual: 75000, region: 'wales' }).netAnnual, e.netAnnual);
  close(calc({ grossAnnual: 75000, region: 'northern-ireland' }).netAnnual, e.netAnnual);
});

test('student loan plans use the tax year’s threshold', () => {
  close(calc({ grossAnnual: 40000, studentLoan: 'plan2' }).studentLoan, 955.35);
  close(calc({ grossAnnual: 40000, studentLoan: 'plan2', taxYear: '2025-26' }).studentLoan, 1037.7);
  close(calc({ grossAnnual: 40000, studentLoan: 'plan1' }).studentLoan, (40000 - 26900) * 0.09);
  close(calc({ grossAnnual: 40000, studentLoan: 'plan4' }).studentLoan, (40000 - 33795) * 0.09);
  close(calc({ grossAnnual: 40000, studentLoan: 'plan5' }).studentLoan, 1350);
  close(calc({ grossAnnual: 20000, studentLoan: 'plan2' }).studentLoan, 0);
});

test('Plan 5 is rejected for 2025/26 (no HMRC threshold published)', () => {
  const r = calc({ grossAnnual: 40000, studentLoan: 'plan5', taxYear: '2025-26' });
  assert.equal(r.ok, false);
});

test('postgraduate loan is charged alongside an undergraduate plan', () => {
  const r = calc({ grossAnnual: 40000, studentLoan: 'plan2', postgraduate: true });
  close(r.postgraduateLoan, 1140);
  close(r.studentLoan, 955.35);
});

test('pension: net pay vs relief at source give the same take-home for a basic-rate taxpayer', () => {
  const net = calc({ grossAnnual: 40000, pension: { method: 'net-pay', percent: 5 } });
  close(net.incomeTax, 5086);
  close(net.nationalInsurance, 2194.4);
  close(net.netAnnual, 30719.6);
  const ras = calc({ grossAnnual: 40000, pension: { method: 'relief-at-source', percent: 5 } });
  close(ras.incomeTax, 5486);
  close(ras.pensionFromPay, 1600);
  close(ras.netAnnual, 30719.6);
});

test('pension: salary sacrifice also saves NI', () => {
  const r = calc({ grossAnnual: 40000, pension: { method: 'salary-sacrifice', percent: 5 } });
  close(r.nationalInsurance, 2034.4);
  close(r.netAnnual, 30879.6);
});

test('salary sacrifice can restore the personal allowance', () => {
  const r = calc({ grossAnnual: 105000, pension: { method: 'salary-sacrifice', percent: 5 } });
  close(r.personalAllowance, 12570);
});

test('student loan is based on NI earnings: net pay pension does not reduce it, salary sacrifice does', () => {
  const np = calc({ grossAnnual: 40000, studentLoan: 'plan2', pension: { method: 'net-pay', percent: 10 } });
  close(np.studentLoan, 955.35);
  const ss = calc({ grossAnnual: 40000, studentLoan: 'plan2', pension: { method: 'salary-sacrifice', percent: 10 } });
  close(ss.studentLoan, (36000 - 29385) * 0.09);
});

test('salary increase across the £100k taper loses 62% of the rise', () => {
  const a = calc({ grossAnnual: 100000 });
  const b = calc({ grossAnnual: 110000 });
  close(b.netAnnual - a.netAnnual, 3800);
  close(T.marginalRetention({ ...base, grossAnnual: 105000 }), 0.38, 0.0001);
});

test('salary increase within the basic rate band keeps 72%', () => {
  const a = calc({ grossAnnual: 30000 });
  const b = calc({ grossAnnual: 33000 });
  close(b.netAnnual - a.netAnnual, 3000 * 0.72);
});

test('tax codes', () => {
  close(calc({ grossAnnual: 30000, taxCode: 'BR' }).incomeTax, 6000);
  close(calc({ grossAnnual: 30000, taxCode: '0T' }).incomeTax, 6000);
  close(calc({ grossAnnual: 30000, taxCode: 'D0' }).incomeTax, 12000);
  close(calc({ grossAnnual: 30000, taxCode: 'NT' }).incomeTax, 0);
  close(calc({ grossAnnual: 30000, taxCode: '1100L' }).incomeTax, 3800);
  close(calc({ grossAnnual: 30000, taxCode: ' 1257l ' }).incomeTax, 3486);
  close(calc({ grossAnnual: 30000, taxCode: '1257L M1' }).incomeTax, 3486);
  close(calc({ grossAnnual: 30000, taxCode: 'SD1', region: 'scotland' }).incomeTax, 12600);
  assert.equal(calc({ grossAnnual: 30000, taxCode: 'K475' }).ok, false);
  assert.equal(calc({ grossAnnual: 30000, taxCode: 'banana' }).ok, false);
  assert.equal(calc({ grossAnnual: 30000, taxCode: 'D2' }).ok, false); // D2 is Scotland-only
  const s = calc({ grossAnnual: 30000, taxCode: 'S1257L' });
  assert.ok(s.notes.some((n) => n.includes('Scottish')));
});

test('non-standard L codes are not tapered again', () => {
  const r = calc({ grossAnnual: 120000, taxCode: '1100L' });
  close(r.personalAllowance, 11000);
});

test('invalid inputs are rejected rather than producing a result', () => {
  assert.equal(calc({ grossAnnual: -1 }).ok, false);
  assert.equal(calc({ grossAnnual: NaN }).ok, false);
  assert.equal(calc({ grossAnnual: 20000, pension: { method: 'net-pay', percent: 150 } }).ok, false);
  assert.throws(() => calc({ grossAnnual: 20000, taxYear: '2019-20' }));
});

test('deductions always add up', () => {
  for (const g of [0, 9000, 25000, 51000, 99999, 100001, 124000, 200000]) {
    for (const region of ['england', 'scotland']) {
      const r = calc({ grossAnnual: g, region, studentLoan: 'plan1', postgraduate: true, pension: { method: 'net-pay', percent: 4 } });
      close(r.gross - r.incomeTax - r.nationalInsurance - r.studentLoan - r.postgraduateLoan - r.pensionFromPay, r.netAnnual, 0.02);
    }
  }
});

test('frequency conversion', () => {
  assert.equal(T.toAnnual(2500, 'monthly'), 30000);
  assert.equal(T.toAnnual(500, 'weekly'), 26000);
  assert.equal(T.toAnnual(30000, 'annual'), 30000);
});
