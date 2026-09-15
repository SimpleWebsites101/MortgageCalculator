// Mortgage Overpayment Calculator — engine + UI wiring
// Core simulation logic mirrors schedule.js's proven amortisation pattern
// (final-payment clamping, balance floored at 0) so both tools stay
// mathematically consistent with each other.

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbpDecimal = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });

const MAX_MONTHS = 720; // 60-year safety cap against pathological inputs

function parseNumber(str) {
  const cleaned = String(str).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function formatWithCommas(n) {
  return Math.round(n).toLocaleString('en-GB');
}

function yearsMonths(totalMonths) {
  const y = Math.floor(totalMonths / 12);
  const m = totalMonths % 12;
  if (y === 0) return `${m} month${m === 1 ? '' : 's'}`;
  if (m === 0) return `${y} year${y === 1 ? '' : 's'}`;
  return `${y} year${y === 1 ? '' : 's'} ${m} month${m === 1 ? '' : 's'}`;
}

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatMonthYear(date) {
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

// The single shared simulation primitive — every mode ultimately calls this,
// so baseline and comparison scenarios are always mathematically consistent.
function simulateSchedule(balance, monthlyRate, payment, lumpSum = 0) {
  balance = Math.max(balance - lumpSum, 0);

  if (balance === 0) {
    return { months: 0, totalInterest: 0, totalPaid: 0, immediatePayoff: true, impossible: false, yearlySnapshots: [] };
  }

  if (payment <= balance * monthlyRate) {
    return { impossible: true, reason: 'payment-too-low' };
  }

  let totalInterest = 0;
  let totalPaid = 0;
  const yearlySnapshots = [];
  let months = 0;

  while (balance > 0 && months < MAX_MONTHS) {
    months++;
    const interestPortion = balance * monthlyRate;
    let principalPortion = payment - interestPortion;
    let actualPayment = payment;

    if (principalPortion > balance) {
      principalPortion = balance;
      actualPayment = principalPortion + interestPortion;
    }

    balance = Math.max(balance - principalPortion, 0);
    totalInterest += interestPortion;
    totalPaid += actualPayment;

    if (months % 12 === 0 || balance === 0) {
      yearlySnapshots.push({ months, balance });
    }
  }

  if (balance > 0) {
    return { impossible: true, reason: 'too-long' };
  }

  return { months, totalInterest, totalPaid, immediatePayoff: false, impossible: false, yearlySnapshots };
}

function requiredPayment(balance, monthlyRate, months) {
  if (monthlyRate === 0) return balance / months;
  const f = Math.pow(1 + monthlyRate, months);
  return balance * (monthlyRate * f) / (f - 1);
}

// ---- Element references ----

const els = {
  balance: document.getElementById('balance'),
  rate: document.getElementById('current-rate'),
  payment: document.getElementById('current-payment'),
  baselineSummary: document.getElementById('baseline-summary'),
  payoffResult: document.getElementById('payoff-result'),

  modeRadios: document.querySelectorAll('input[name="calc-mode"]'),
  modePayoff: document.getElementById('mode-payoff'),
  modeOverpay: document.getElementById('mode-overpay'),
  modeTarget: document.getElementById('mode-target'),

  overpayTypeRadios: document.querySelectorAll('input[name="overpay-type"]'),
  overpayMonthlyFields: document.getElementById('overpay-monthly-fields'),
  overpayPercentFields: document.getElementById('overpay-percent-fields'),
  overpayLumpFields: document.getElementById('overpay-lump-fields'),
  overpayCombinedFields: document.getElementById('overpay-combined-fields'),

  monthlyOverpayment: document.getElementById('monthly-overpayment'),
  percentPreset: document.querySelectorAll('input[name="percent-preset"]'),
  percentCustom: document.getElementById('percent-custom'),
  percentCustomField: document.getElementById('percent-custom-field'),
  percentAmountDisplay: document.getElementById('percent-amount-display'),
  lumpSum: document.getElementById('lump-sum'),
  combinedLump: document.getElementById('combined-lump'),
  combinedMonthly: document.getElementById('combined-monthly'),

  overpayCalculateBtn: document.getElementById('overpay-calculate'),
  overpayResult: document.getElementById('overpay-result'),
  scenarioHeading: document.getElementById('scenario-heading'),
  scenarioGrid: document.getElementById('scenario-grid'),

  targetTypeRadios: document.querySelectorAll('input[name="target-type"]'),
  targetYearsField: document.getElementById('target-years-field'),
  targetDateField: document.getElementById('target-date-field'),
  targetYears: document.getElementById('target-years'),
  targetDate: document.getElementById('target-date'),
  targetCalculateBtn: document.getElementById('target-calculate'),
  targetResult: document.getElementById('target-result'),

  progressSection: document.getElementById('progress-section'),
  progressGrid: document.getElementById('progress-grid'),
};

let baseline = null;
let currentBalance = 0;
let currentRate = 0;
let currentPayment = 0;

function getCoreInputs() {
  currentBalance = Math.max(parseNumber(els.balance.value), 0);
  currentRate = Math.max(parseNumber(els.rate.value), 0);
  currentPayment = Math.max(parseNumber(els.payment.value), 0);
  return { balance: currentBalance, rate: currentRate, payment: currentPayment };
}

function computeBaseline() {
  const { balance, rate, payment } = getCoreInputs();
  const monthlyRate = rate / 100 / 12;

  if (payment <= 0 || balance <= 0) {
    baseline = null;
    els.baselineSummary.innerHTML = '<p class="validation-message">Enter your mortgage balance, interest rate and current monthly payment above to get started.</p>';
    renderPayoffMode();
    return;
  }

  const result = simulateSchedule(balance, monthlyRate, payment);

  if (result.impossible) {
    baseline = null;
    const msg = result.reason === 'payment-too-low'
      ? `At ${gbpDecimal.format(payment)} a month, your payment doesn't cover the interest currently being charged, so your mortgage wouldn't reduce at all. Try a higher monthly payment.`
      : `Based on these figures, this would take longer than 60 years to pay off — please double-check your balance, rate and payment.`;
    els.baselineSummary.innerHTML = `<p class="validation-message">${msg}</p>`;
    renderPayoffMode();
    return;
  }

  baseline = result;
  els.baselineSummary.innerHTML = '';
  renderPayoffMode();
}

// Mode 1's own result — this is now the only place the baseline is displayed,
// rather than being duplicated above the mode selector.
function renderPayoffMode() {
  if (!els.payoffResult) return;

  if (!baseline) {
    els.payoffResult.innerHTML = '<p class="hero__sub">Enter your mortgage details above to see your estimated payoff time.</p>';
    return;
  }

  const freeDate = addMonths(new Date(), baseline.months);

  els.payoffResult.innerHTML = `
    <div class="overpay-headline">
      <p>At your current payment, you could be mortgage-free in approximately ${yearsMonths(baseline.months)}.</p>
    </div>
    <div class="compact-bar__summary">
      <div class="compact-bar__summary-item">
        <span>Payoff time</span>
        <strong>${yearsMonths(baseline.months)}</strong>
      </div>
      <div class="compact-bar__summary-item">
        <span>Mortgage-free</span>
        <strong>${formatMonthYear(freeDate)}</strong>
      </div>
      <div class="compact-bar__summary-item">
        <span>Remaining interest</span>
        <strong>${gbp.format(baseline.totalInterest)}</strong>
      </div>
      <div class="compact-bar__summary-item">
        <span>Remaining payments</span>
        <strong>${gbp.format(baseline.totalPaid)}</strong>
      </div>
    </div>
  `;
}

[els.balance, els.rate, els.payment].forEach((el) => {
  el.addEventListener('input', () => {
    computeBaseline();
    refreshActiveMode();
  });
  el.addEventListener('blur', () => {
    if (el === els.balance) el.value = formatWithCommas(parseNumber(el.value));
  });
});

// ---- Mode switching ----

function refreshActiveMode() {
  const active = document.querySelector('input[name="calc-mode"]:checked').value;
  els.modePayoff.hidden = active !== 'payoff';
  els.modeOverpay.hidden = active !== 'overpay';
  els.modeTarget.hidden = active !== 'target';
}

els.modeRadios.forEach((r) => r.addEventListener('change', refreshActiveMode));

// ---- Mode 2: Overpay ----

function refreshOverpayFields() {
  const type = document.querySelector('input[name="overpay-type"]:checked').value;
  els.overpayMonthlyFields.hidden = type !== 'monthly';
  els.overpayPercentFields.hidden = type !== 'percent';
  els.overpayLumpFields.hidden = type !== 'lump';
  els.overpayCombinedFields.hidden = type !== 'combined';
  updatePercentDisplay();
}

els.overpayTypeRadios.forEach((r) => r.addEventListener('change', refreshOverpayFields));

function updatePercentDisplay() {
  const checked = document.querySelector('input[name="percent-preset"]:checked');
  const isCustom = !checked || checked.value === 'custom';
  els.percentCustomField.hidden = !isCustom;

  let pct;
  if (isCustom) {
    pct = parseNumber(els.percentCustom.value);
  } else {
    pct = parseNumber(checked.value);
  }
  const amount = currentBalance * pct / 100;
  els.percentAmountDisplay.textContent = `${pct}% of ${gbp.format(currentBalance)} = ${gbp.format(amount)} one-off overpayment`;
}

els.percentPreset.forEach((r) => r.addEventListener('change', updatePercentDisplay));
els.percentCustom.addEventListener('input', updatePercentDisplay);

function getOverpayScenario(monthlyExtra, lumpSum) {
  const monthlyRate = currentRate / 100 / 12;
  return simulateSchedule(currentBalance, monthlyRate, currentPayment + monthlyExtra, lumpSum);
}

function renderComparison(container, resultA, resultB, labelA, labelB, extraRowsA = '', extraRowsB = '', customHeadline = null) {
  if (!resultA || resultA.impossible || !resultB) return '';

  if (resultB.impossible) {
    const msg = resultB.reason === 'payment-too-low'
      ? "This combination doesn't cover the interest being charged, so it wouldn't reduce your mortgage."
      : 'This would take longer than 60 years to pay off — please check the figures.';
    return `<p class="validation-message">${msg}</p>`;
  }

  const monthsSaved = resultA.months - resultB.months;
  const interestSaved = resultA.totalInterest - resultB.totalInterest;
  const freeDateA = addMonths(new Date(), resultA.months);
  const freeDateB = addMonths(new Date(), resultB.months);

  const headline = customHeadline || (resultB.immediatePayoff
    ? `This would pay off your mortgage immediately, saving ${gbp.format(interestSaved)} in interest.`
    : monthsSaved > 0
      ? `You could pay off your mortgage approximately ${yearsMonths(monthsSaved)} sooner and save around ${gbp.format(interestSaved)} in interest.`
      : `This wouldn't reduce your payoff time versus your current path.`);

  return `
    <div class="overpay-headline">
      <p>${headline}</p>
    </div>
    <div class="overpay-compare">
      <div class="overpay-compare__col">
        <h3>${labelA}</h3>
        <dl class="result__breakdown">
          <div><dt>Payoff time</dt><dd>${yearsMonths(resultA.months)}</dd></div>
          <div><dt>Mortgage-free</dt><dd>${formatMonthYear(freeDateA)}</dd></div>
          <div><dt>Remaining interest</dt><dd>${gbp.format(resultA.totalInterest)}</dd></div>
          <div><dt>Remaining payments</dt><dd>${gbp.format(resultA.totalPaid)}</dd></div>
          ${extraRowsA}
        </dl>
      </div>
      <div class="overpay-compare__col overpay-compare__col--highlight">
        <h3>${labelB}</h3>
        <dl class="result__breakdown">
          <div><dt>Payoff time</dt><dd>${resultB.immediatePayoff ? 'Immediately' : yearsMonths(resultB.months)}</dd></div>
          <div><dt>Mortgage-free</dt><dd>${resultB.immediatePayoff ? formatMonthYear(new Date()) : formatMonthYear(freeDateB)}</dd></div>
          <div><dt>Remaining interest</dt><dd>${gbp.format(resultB.totalInterest)}</dd></div>
          <div><dt>Remaining payments</dt><dd>${gbp.format(resultB.totalPaid)}</dd></div>
          ${extraRowsB}
        </dl>
      </div>
    </div>
    <div class="overpay-savings">
      <div class="overpay-savings__item">
        <span>Time saved</span>
        <strong>${resultB.immediatePayoff ? yearsMonths(resultA.months) : yearsMonths(Math.max(monthsSaved, 0))}</strong>
      </div>
      <div class="overpay-savings__item">
        <span>Interest saved</span>
        <strong>${gbp.format(Math.max(interestSaved, 0))}</strong>
      </div>
    </div>
  `;
}

function calculateOverpay() {
  if (!baseline) return;
  const type = document.querySelector('input[name="overpay-type"]:checked').value;
  const { monthlyExtra, lumpSum } = getOverpayInputs(type);

  const result = getOverpayScenario(monthlyExtra, lumpSum);
  els.overpayResult.innerHTML = renderComparison(els.overpayResult, baseline, result, 'Current payments', 'With overpayments');
  renderScenarios(type);
  renderProgress(result);
}

els.overpayCalculateBtn.addEventListener('click', calculateOverpay);

// Reads whatever the currently-selected overpayment type actually needs,
// in one place, so every caller (calculate button, scenario cards) agrees
// on what "the current inputs" mean.
function getOverpayInputs(type) {
  let monthlyExtra = 0, lumpSum = 0;

  if (type === 'monthly') {
    monthlyExtra = Math.max(parseNumber(els.monthlyOverpayment.value), 0);
  } else if (type === 'percent') {
    const checked = document.querySelector('input[name="percent-preset"]:checked');
    const pct = (!checked || checked.value === 'custom') ? parseNumber(els.percentCustom.value) : parseNumber(checked.value);
    lumpSum = currentBalance * pct / 100;
  } else if (type === 'lump') {
    lumpSum = Math.max(parseNumber(els.lumpSum.value), 0);
  } else if (type === 'combined') {
    lumpSum = Math.max(parseNumber(els.combinedLump.value), 0);
    monthlyExtra = Math.max(parseNumber(els.combinedMonthly.value), 0);
  }

  return { monthlyExtra, lumpSum };
}

// Rounds a scenario value to a sensible nearby step so generated options
// look like real numbers a person would consider, not arbitrary maths.
function roundToStep(n, step) {
  return Math.max(Math.round(n / step) * step, step);
}

function buildScenarioCard(labelTop, resultLine, savingsLine, onClick) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'milestone-card';
  card.innerHTML = `
    <span class="milestone-card__year">${labelTop}</span>
    <span class="milestone-card__balance-group">
      <span class="milestone-card__balance">${resultLine}</span>
      <span class="milestone-card__balance-label">sooner</span>
    </span>
    <span class="milestone-card__principal-group">
      <span class="milestone-card__principal-value">${savingsLine}</span>
      <span class="milestone-card__principal-label">interest saved</span>
    </span>
  `;
  card.addEventListener('click', onClick);
  return card;
}

// Generates up to 4 "nearby" alternative amounts around a base value,
// using multipliers that deliberately never reproduce the base itself
// (no 1x), rounded to a clean step, deduplicated, and with the exact
// entered amount filtered out as a final safety net.
function nearbyAmounts(base, step, currentValue) {
  const multipliers = [0.5, 0.75, 1.5, 2];
  let values = multipliers
    .map((m) => roundToStep(base * m, step))
    .filter((v) => v > 0 && Math.abs(v - currentValue) > 0.001);
  values = [...new Set(values)];

  // Best-effort backfill if rounding/dedup/exclusion left fewer than 4.
  const extraMultipliers = [0.25, 2.5, 3, 0.1];
  let i = 0;
  while (values.length < 4 && i < extraMultipliers.length) {
    const candidate = roundToStep(base * extraMultipliers[i], step);
    if (candidate > 0 && Math.abs(candidate - currentValue) > 0.001 && !values.includes(candidate)) {
      values.push(candidate);
    }
    i++;
  }

  return values.sort((a, b) => a - b);
}

function renderScenarios(type) {
  if (!baseline) return;
  els.scenarioGrid.innerHTML = '';

  if (type === 'monthly') {
    els.scenarioHeading.textContent = 'Explore other monthly overpayments';
    const entered = Math.max(parseNumber(els.monthlyOverpayment.value), 0);
    const base = entered > 0 ? entered : 100;
    const amounts = nearbyAmounts(base, 10, entered);

    amounts.forEach((amount) => {
      const result = getOverpayScenario(amount, 0);
      if (result.impossible) return;
      const monthsSaved = baseline.months - result.months;
      const interestSaved = baseline.totalInterest - result.totalInterest;
      const card = buildScenarioCard(
        `${gbp.format(amount)}/month extra`,
        yearsMonths(Math.max(monthsSaved, 0)),
        gbp.format(Math.max(interestSaved, 0)),
        () => {
          els.monthlyOverpayment.value = amount;
          calculateOverpay();
        }
      );
      els.scenarioGrid.appendChild(card);
    });
  }

  else if (type === 'percent') {
    els.scenarioHeading.textContent = 'Explore other percentages';
    const checked = document.querySelector('input[name="percent-preset"]:checked');
    const currentPct = (!checked || checked.value === 'custom') ? parseNumber(els.percentCustom.value) : parseNumber(checked.value);
    const candidates = [1, 2, 3, 5, 10];
    const percentages = candidates.filter((p) => Math.abs(p - currentPct) > 0.001).slice(0, 4);

    percentages.forEach((pct) => {
      const lumpSum = currentBalance * pct / 100;
      const result = getOverpayScenario(0, lumpSum);
      if (result.impossible) return;
      const monthsSaved = baseline.months - result.months;
      const interestSaved = baseline.totalInterest - result.totalInterest;
      const card = buildScenarioCard(
        `${pct}% — ${gbp.format(lumpSum)} one-off`,
        yearsMonths(Math.max(monthsSaved, 0)),
        gbp.format(Math.max(interestSaved, 0)),
        () => {
          const preset = document.querySelector(`input[name="percent-preset"][value="${pct}"]`);
          if (preset) {
            preset.checked = true;
          } else {
            document.getElementById('percent-preset-custom').checked = true;
            els.percentCustom.value = pct;
          }
          updatePercentDisplay();
          calculateOverpay();
        }
      );
      els.scenarioGrid.appendChild(card);
    });
  }

  else if (type === 'lump') {
    els.scenarioHeading.textContent = 'Explore other lump sums';
    const entered = Math.max(parseNumber(els.lumpSum.value), 0);
    const base = entered > 0 ? entered : 10000;
    const amounts = nearbyAmounts(base, 500, entered);

    amounts.forEach((amount) => {
      const result = getOverpayScenario(0, amount);
      if (result.impossible) return;
      const monthsSaved = baseline.months - result.months;
      const interestSaved = baseline.totalInterest - result.totalInterest;
      const card = buildScenarioCard(
        `${gbp.format(amount)} lump sum`,
        result.immediatePayoff ? 'Immediate' : yearsMonths(Math.max(monthsSaved, 0)),
        gbp.format(Math.max(interestSaved, 0)),
        () => {
          els.lumpSum.value = formatWithCommas(amount);
          calculateOverpay();
        }
      );
      els.scenarioGrid.appendChild(card);
    });
  }

  else if (type === 'combined') {
    const fixedLump = Math.max(parseNumber(els.combinedLump.value), 0);
    els.scenarioHeading.textContent = `Explore monthly overpayments with your ${gbp.format(fixedLump)} lump sum`;
    const entered = Math.max(parseNumber(els.combinedMonthly.value), 0);
    const base = entered > 0 ? entered : 100;
    const amounts = nearbyAmounts(base, 10, entered);

    amounts.forEach((amount) => {
      const result = getOverpayScenario(amount, fixedLump);
      if (result.impossible) return;
      const monthsSaved = baseline.months - result.months;
      const interestSaved = baseline.totalInterest - result.totalInterest;
      const card = buildScenarioCard(
        `${gbp.format(amount)}/month extra`,
        result.immediatePayoff ? 'Immediate' : yearsMonths(Math.max(monthsSaved, 0)),
        gbp.format(Math.max(interestSaved, 0)),
        () => {
          els.combinedMonthly.value = amount;
          calculateOverpay();
        }
      );
      els.scenarioGrid.appendChild(card);
    });
  }
}

// ---- Mode 3: Target ----

function refreshTargetFields() {
  const type = document.querySelector('input[name="target-type"]:checked').value;
  els.targetYearsField.hidden = type !== 'years';
  els.targetDateField.hidden = type !== 'date';
}

els.targetTypeRadios.forEach((r) => r.addEventListener('change', refreshTargetFields));

function calculateTarget() {
  if (!baseline) return;
  const type = document.querySelector('input[name="target-type"]:checked').value;
  const monthlyRate = currentRate / 100 / 12;
  let targetMonths;

  if (type === 'years') {
    const yrs = parseNumber(els.targetYears.value);
    targetMonths = Math.round(yrs * 12);
  } else {
    const target = new Date(els.targetDate.value);
    if (isNaN(target.getTime())) {
      els.targetResult.innerHTML = '<p class="validation-message">Please choose a valid target date.</p>';
      return;
    }
    const now = new Date();
    targetMonths = (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth());
    if (target.getDate() < now.getDate()) targetMonths -= 1;
  }

  if (targetMonths <= 0) {
    els.targetResult.innerHTML = '<p class="validation-message">Your target needs to be at least one month from now.</p>';
    return;
  }

  const required = requiredPayment(currentBalance, monthlyRate, targetMonths);
  const result = simulateSchedule(currentBalance, monthlyRate, required);
  const extra = required - currentPayment;

  const extraLine = extra > 0.5
    ? `<div><dt>Extra required each month</dt><dd>${gbpDecimal.format(extra)}</dd></div>`
    : `<div><dt>You could actually pay</dt><dd>${gbpDecimal.format(currentPayment - required)} less per month</dd></div>`;

  const targetHeadline = `To be mortgage-free in ${yearsMonths(targetMonths)}, you'd need to pay ${gbpDecimal.format(required)} a month — that's ${yearsMonths(Math.max(baseline.months - result.months, 0))} sooner than your current path.`;

  els.targetResult.innerHTML = renderComparison(
    els.targetResult, baseline, result, 'Current payments', 'Required to hit your target',
    '', `<div><dt>Required monthly payment</dt><dd>${gbpDecimal.format(required)}</dd></div>${extraLine}`,
    targetHeadline
  );
  renderProgress(result);
}

els.targetCalculateBtn.addEventListener('click', calculateTarget);

// ---- Progress / milestones ----

function renderProgress(comparisonResult) {
  if (!baseline || !comparisonResult || comparisonResult.impossible) {
    els.progressSection.hidden = true;
    return;
  }
  els.progressSection.hidden = false;
  els.progressGrid.innerHTML = '';

  const compMonths = comparisonResult.immediatePayoff ? 0 : comparisonResult.months;

  // Spread milestone points across whichever scenario finishes first — no
  // point showing a comparison card years after the faster path is already
  // paid off, so the shorter duration is what actually drives the spread.
  const spanMonths = Math.min(baseline.months, compMonths || baseline.months);
  const spanYears = Math.max(1, Math.round(spanMonths / 12));
  const interval = Math.max(1, Math.round(spanYears / 4));

  let points = [...new Set([interval, interval * 2, interval * 3].filter((y) => y > 0 && y < spanYears))];

  points.forEach((yr) => {
    const targetMonth = yr * 12;
    const baseSnap = [...baseline.yearlySnapshots].reverse().find((s) => s.months <= targetMonth) || { balance: currentBalance };
    const compSnap = [...comparisonResult.yearlySnapshots].reverse().find((s) => s.months <= targetMonth);
    const compBalance = compSnap ? compSnap.balance : currentBalance;
    const diff = baseSnap.balance - compBalance;

    const card = document.createElement('div');
    card.className = 'milestone-card';
    card.innerHTML = `
      <span class="milestone-card__year">After ${yr} year${yr === 1 ? '' : 's'}</span>
      <span class="milestone-card__balance-group">
        <span class="milestone-card__balance">${gbp.format(compBalance)}</span>
        <span class="milestone-card__balance-label">remaining with overpayments</span>
      </span>
      <span class="milestone-card__principal-group">
        <span class="milestone-card__principal-value">${gbp.format(Math.max(diff, 0))}</span>
        <span class="milestone-card__principal-label">less mortgage debt</span>
      </span>
    `;
    els.progressGrid.appendChild(card);
  });

  // Final card always marks the actual payoff point of whichever scenario
  // finishes first, rather than a generic "after N years" balance snapshot.
  const finalIsComparison = compMonths <= baseline.months;
  const finalMonths = finalIsComparison ? compMonths : baseline.months;
  const finalYears = yearsMonths(finalMonths);
  const otherSideBalance = finalIsComparison
    ? ([...baseline.yearlySnapshots].reverse().find((s) => s.months <= finalMonths) || { balance: currentBalance }).balance
    : 0;

  const finalCard = document.createElement('div');
  finalCard.className = 'milestone-card';
  finalCard.innerHTML = finalIsComparison
    ? `
      <span class="milestone-card__year">Mortgage-free with overpayments</span>
      <span class="milestone-card__balance-group">
        <span class="milestone-card__balance">${finalYears}</span>
        <span class="milestone-card__balance-label">from now</span>
      </span>
      <span class="milestone-card__principal-group">
        <span class="milestone-card__principal-value">${gbp.format(otherSideBalance)}</span>
        <span class="milestone-card__principal-label">still owed on your current path at this point</span>
      </span>
    `
    : `
      <span class="milestone-card__year">Mortgage-free (current path)</span>
      <span class="milestone-card__balance-group">
        <span class="milestone-card__balance">${finalYears}</span>
        <span class="milestone-card__balance-label">from now</span>
      </span>
      <span class="milestone-card__principal-group">
        <span class="milestone-card__principal-value">£0</span>
        <span class="milestone-card__principal-label">both paths fully repaid</span>
      </span>
    `;
  els.progressGrid.appendChild(finalCard);
}

// ---- Init ----
computeBaseline();
refreshActiveMode();
refreshOverpayFields();
refreshTargetFields();
