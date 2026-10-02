// 24/7 UK Mortgage Calculator — mortgage affordability calculator page logic

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbpDecimal = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });

const els = {
  income1: document.getElementById('income1'),
  income1Range: document.getElementById('income1-range'),
  income2: document.getElementById('income2'),
  income2Range: document.getElementById('income2-range'),
  deposit: document.getElementById('deposit'),
  depositRange: document.getElementById('deposit-range'),
  rate: document.getElementById('rate'),
  rateRange: document.getElementById('rate-range'),
  term: document.getElementById('term'),
  termRange: document.getElementById('term-range'),
  scenarioCards: document.getElementById('scenario-cards'),
};

function parseNumber(str) {
  const cleaned = String(str).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatWithCommas(n) {
  return Math.round(n).toLocaleString('en-GB');
}

function clampToRange(value, rangeEl) {
  const min = parseFloat(rangeEl.min);
  const max = parseFloat(rangeEl.max);
  return Math.min(Math.max(value, min), max);
}

function pairField(textEl, rangeEl, { isCurrency = false } = {}) {
  textEl.addEventListener('input', () => {
    const raw = parseNumber(textEl.value);
    const clamped = clampToRange(raw, rangeEl);
    rangeEl.value = clamped;
    calculate();
  });
  textEl.addEventListener('blur', () => {
    const raw = parseNumber(textEl.value);
    const clamped = clampToRange(raw, rangeEl);
    textEl.value = isCurrency ? formatWithCommas(clamped) : clamped;
    calculate();
  });
  rangeEl.addEventListener('input', () => {
    const val = parseFloat(rangeEl.value);
    textEl.value = isCurrency ? formatWithCommas(val) : val;
    calculate();
  });
}

pairField(els.income1, els.income1Range, { isCurrency: true });
pairField(els.income2, els.income2Range, { isCurrency: true });
pairField(els.deposit, els.depositRange, { isCurrency: true });
pairField(els.rate, els.rateRange);
pairField(els.term, els.termRange);

// Standard capital-and-interest monthly repayment formula — same approach
// used on the repayment schedule calculator, applied here to each
// income-multiple scenario's estimated borrowing amount.
function monthlyRepayment(loan, annualRatePercent, years) {
  const monthlyRate = annualRatePercent / 100 / 12;
  const numPayments = years * 12;
  if (loan <= 0 || numPayments <= 0) return 0;

  let payment;
  if (monthlyRate === 0) {
    payment = loan / numPayments;
  } else {
    payment = loan * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
              (Math.pow(1 + monthlyRate, numPayments) - 1);
  }
  return isFinite(payment) ? payment : 0;
}

const SCENARIOS = [
  { multiple: 4, label: '4× income' },
  { multiple: 4.5, label: '4.5× income' },
  { multiple: 5, label: '5× income' },
];

function calculate() {
  const income1 = clampToRange(parseNumber(els.income1.value), els.income1Range);
  const income2 = clampToRange(parseNumber(els.income2.value), els.income2Range);
  const deposit = clampToRange(parseNumber(els.deposit.value), els.depositRange);
  const rate = clampToRange(parseNumber(els.rate.value), els.rateRange);
  const term = clampToRange(parseNumber(els.term.value), els.termRange);

  const combinedIncome = income1 + income2;

  els.scenarioCards.innerHTML = '';

  SCENARIOS.forEach((scenario) => {
    const borrowing = combinedIncome * scenario.multiple;
    const propertyBudget = borrowing + deposit;
    const repayment = monthlyRepayment(borrowing, rate, term);

    const card = document.createElement('div');
    card.className = 'milestone-card';
    card.style.cursor = 'default';
    card.innerHTML = `
      <span class="milestone-card__year">${scenario.label}</span>
      <dl class="result__breakdown">
        <div><dt>Estimated borrowing</dt><dd>${gbp.format(borrowing)}</dd></div>
        <div><dt>Indicative property budget</dt><dd>${gbp.format(propertyBudget)}</dd></div>
        <div><dt>Illustrative monthly repayment</dt><dd>${gbpDecimal.format(repayment)}</dd></div>
      </dl>
    `;
    els.scenarioCards.appendChild(card);
  });
}

calculate();
