// 24/7 UK Mortgage Calculator — payment schedule page logic

const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbpDecimal = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });

const els = {
  principal: document.getElementById('principal'),
  principalRange: document.getElementById('principal-range'),
  rate: document.getElementById('rate'),
  rateRange: document.getElementById('rate-range'),
  term: document.getElementById('term'),
  termRange: document.getElementById('term-range'),
  deposit: document.getElementById('deposit'),
  depositRange: document.getElementById('deposit-range'),
  monthlyPayment: document.getElementById('monthly-payment'),
  totalRepaid: document.getElementById('total-repaid'),
  totalInterest: document.getElementById('total-interest'),
  ltv: document.getElementById('ltv'),
  milestonesGrid: document.getElementById('milestones-grid'),
  payoffBanner: document.getElementById('payoff-banner'),
  tbody: document.getElementById('schedule-tbody'),
  downloadBtn: document.getElementById('download-csv'),
  toggleFullBtn: document.getElementById('toggle-full-schedule'),
  tableWrap: document.getElementById('schedule-table-wrap'),
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

pairField(els.principal, els.principalRange, { isCurrency: true });
pairField(els.rate, els.rateRange);
pairField(els.term, els.termRange);
pairField(els.deposit, els.depositRange, { isCurrency: true });

// Pre-fill from URL parameters if arriving from the main calculator.
(function prefillFromURL() {
  const params = new URLSearchParams(window.location.search);
  const price = params.get('price');
  const deposit = params.get('deposit');
  const rate = params.get('rate');
  const term = params.get('term');

  if (price !== null) {
    const v = clampToRange(parseNumber(price), els.principalRange);
    els.principal.value = formatWithCommas(v);
    els.principalRange.value = v;
  }
  if (deposit !== null) {
    const v = clampToRange(parseNumber(deposit), els.depositRange);
    els.deposit.value = formatWithCommas(v);
    els.depositRange.value = v;
  }
  if (rate !== null) {
    const v = clampToRange(parseNumber(rate), els.rateRange);
    els.rate.value = v;
    els.rateRange.value = v;
  }
  if (term !== null) {
    const v = clampToRange(parseNumber(term), els.termRange);
    els.term.value = v;
    els.termRange.value = v;
  }
})();

// Full month-by-month schedule — single source of truth for milestones,
// the yearly table, the on-demand monthly expansion, and the CSV export.
let currentSchedule = [];
let currentLoan = 0;
let currentYears = 0;

function computeSchedule(loan, monthlyRate, monthlyPayment, years) {
  const schedule = [];
  let balance = loan;
  const numPayments = Math.round(years * 12);

  for (let m = 1; m <= numPayments; m++) {
    const interestPortion = balance * monthlyRate;
    let principalPortion = monthlyPayment - interestPortion;
    let payment = monthlyPayment;

    if (principalPortion > balance) {
      principalPortion = balance;
      payment = principalPortion + interestPortion;
    }

    balance = Math.max(balance - principalPortion, 0);

    schedule.push({
      year: Math.ceil(m / 12),
      month: ((m - 1) % 12) + 1,
      payment,
      principal: principalPortion,
      interest: interestPortion,
      balance,
    });
  }
  return schedule;
}

function groupByYear(schedule) {
  const years = {};
  schedule.forEach((row) => {
    if (!years[row.year]) {
      years[row.year] = { year: row.year, totalPrincipal: 0, totalInterest: 0, balance: 0, months: [] };
    }
    years[row.year].totalPrincipal += row.principal;
    years[row.year].totalInterest += row.interest;
    years[row.year].balance = row.balance;
    years[row.year].months.push(row);
  });
  return Object.values(years);
}

function calculate() {
  const price = clampToRange(parseNumber(els.principal.value), els.principalRange);
  const deposit = clampToRange(parseNumber(els.deposit.value), els.depositRange);
  const loan = Math.max(price - deposit, 0);
  const annualRate = clampToRange(parseNumber(els.rate.value), els.rateRange);
  const years = clampToRange(parseNumber(els.term.value), els.termRange);

  const monthlyRate = annualRate / 100 / 12;
  const numPayments = years * 12;

  let monthlyPayment;
  if (monthlyRate === 0) {
    monthlyPayment = loan / numPayments;
  } else {
    monthlyPayment = loan * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                      (Math.pow(1 + monthlyRate, numPayments) - 1);
  }
  if (!isFinite(monthlyPayment) || loan === 0) monthlyPayment = 0;

  const totalRepaid = monthlyPayment * numPayments;
  const totalInterest = totalRepaid - loan;
  const ltv = price > 0 ? (loan / price) * 100 : 0;

  els.monthlyPayment.textContent = gbpDecimal.format(monthlyPayment);
  els.totalRepaid.textContent = gbp.format(totalRepaid);
  els.totalInterest.textContent = gbp.format(totalInterest);
  els.ltv.textContent = `${ltv.toFixed(0)}%`;

  currentLoan = loan;
  currentYears = years;
  currentSchedule = loan > 0 ? computeSchedule(loan, monthlyRate, monthlyPayment, years) : [];

  renderMilestones(currentSchedule, loan, years, totalInterest);
  renderYearlyTable(groupByYear(currentSchedule));

  // Collapse the full table back down whenever the numbers change —
  // an already-expanded 25-year table from a previous input would be
  // showing stale rows otherwise.
  els.tableWrap.hidden = true;
  els.toggleFullBtn.setAttribute('aria-expanded', 'false');
  els.toggleFullBtn.querySelector('.toggle-label').textContent = `Show full ${years}-year schedule ↓`;
}

// Always targets exactly 5 milestone years (never the final term year, which
// belongs only in the payoff banner) regardless of how long the term is.
// Derives a clean whole-year interval from term/5 rather than using a fixed
// step, so a 30-year term doesn't simply accumulate more cards than a
// 10-year one. Falls back to filling with the smallest unused whole years
// only in extreme edge cases (very short terms) where 5 unique years below
// the term aren't mathematically available.
function computeMilestoneYears(term) {
  const interval = Math.max(1, Math.round(term / 5));
  const candidates = [1, interval, interval * 2, interval * 3, interval * 4];

  const seen = new Set();
  const yearsList = [];
  candidates.forEach((y) => {
    if (y < term && !seen.has(y)) {
      seen.add(y);
      yearsList.push(y);
    }
  });

  let filler = 1;
  while (yearsList.length < 5 && filler < term) {
    if (!seen.has(filler)) {
      seen.add(filler);
      yearsList.push(filler);
    }
    filler++;
  }

  return yearsList.sort((a, b) => a - b).slice(0, 5);
}

function renderMilestones(schedule, loan, years, totalInterest) {
  els.milestonesGrid.innerHTML = '';
  els.payoffBanner.innerHTML = '';
  if (schedule.length === 0) return;

  const regularYears = computeMilestoneYears(years);

  regularYears.forEach((year) => {
    const yearEndRow = [...schedule].reverse().find((r) => r.year === year);
    if (!yearEndRow) return;

    const principalRepaid = loan - yearEndRow.balance;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'milestone-card';
    card.innerHTML = `
      <span class="milestone-card__year">${year} year${year === 1 ? '' : 's'}</span>
      <span class="milestone-card__balance-group">
        <span class="milestone-card__balance">${gbp.format(yearEndRow.balance)}</span>
        <span class="milestone-card__balance-label">remaining</span>
      </span>
      <span class="milestone-card__principal-group">
        <span class="milestone-card__principal-value">${gbp.format(principalRepaid)}</span>
        <span class="milestone-card__principal-label">capital repaid</span>
      </span>
      <span class="milestone-card__link">View breakdown →</span>
    `;
    card.addEventListener('click', () => jumpToYear(year));
    els.milestonesGrid.appendChild(card);
  });

  // Payoff banner — the destination of the timeline, not just another card.
  const banner = document.createElement('button');
  banner.type = 'button';
  banner.className = 'payoff-banner';
  banner.innerHTML = `
    <span class="payoff-banner__headline">Year ${years} <span class="payoff-banner__check">✓</span> Mortgage paid off</span>
    <span class="payoff-banner__detail"><strong>${gbp.format(loan)}</strong> capital repaid · <strong>${gbp.format(totalInterest)}</strong> total interest</span>
  `;
  banner.addEventListener('click', () => jumpToYear(years));
  els.payoffBanner.appendChild(banner);
}

function jumpToYear(year) {
  els.tableWrap.hidden = false;
  els.toggleFullBtn.setAttribute('aria-expanded', 'true');
  els.toggleFullBtn.querySelector('.toggle-label').textContent = 'Hide full schedule ↑';

  const yearRow = els.tbody.querySelector(`[data-year-row="${year}"]`);
  if (!yearRow) return;

  const toggle = yearRow.querySelector('.schedule__toggle');
  if (toggle && toggle.getAttribute('aria-expanded') !== 'true') {
    toggle.click();
  }
  yearRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderYearlyTable(yearGroups) {
  els.tbody.innerHTML = '';

  yearGroups.forEach((yearData) => {
    const yearRow = document.createElement('tr');
    yearRow.className = 'schedule__year-row';
    yearRow.dataset.yearRow = yearData.year;
    yearRow.innerHTML = `
      <td><button type="button" class="schedule__toggle" aria-expanded="false" aria-controls="months-${yearData.year}">▸</button>Year ${yearData.year}</td>
      <td>${gbp.format(yearData.totalPrincipal)}</td>
      <td>${gbp.format(yearData.totalInterest)}</td>
      <td>${gbp.format(yearData.balance)}</td>
    `;

    const monthRow = document.createElement('tr');
    monthRow.className = 'schedule__month-row';
    monthRow.id = `months-${yearData.year}`;
    monthRow.hidden = true;
    const cell = document.createElement('td');
    cell.colSpan = 4;
    monthRow.appendChild(cell);

    let monthsBuilt = false;

    const toggleBtn = yearRow.querySelector('.schedule__toggle');
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';

      if (!monthsBuilt) {
        cell.appendChild(buildMonthTable(yearData.months));
        monthsBuilt = true;
      }

      monthRow.hidden = expanded;
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      toggleBtn.textContent = expanded ? '▸' : '▾';
    });

    els.tbody.appendChild(yearRow);
    els.tbody.appendChild(monthRow);
  });
}

function buildMonthTable(months) {
  const table = document.createElement('table');
  table.className = 'schedule__month-table';
  table.innerHTML = `
    <thead>
      <tr><th>Month</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Balance</th></tr>
    </thead>
    <tbody>
      ${months.map((m) => `
        <tr>
          <td>${m.month}</td>
          <td>${gbp.format(m.payment)}</td>
          <td>${gbp.format(m.principal)}</td>
          <td>${gbp.format(m.interest)}</td>
          <td>${gbp.format(m.balance)}</td>
        </tr>
      `).join('')}
    </tbody>
  `;
  return table;
}

function downloadCSV() {
  if (currentSchedule.length === 0) return;

  const header = 'Year,Month,Payment,Principal,Interest,Balance\n';
  const rows = currentSchedule.map((r) =>
    [r.year, r.month, r.payment.toFixed(2), r.principal.toFixed(2), r.interest.toFixed(2), r.balance.toFixed(2)].join(',')
  ).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mortgage-payment-schedule.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

els.downloadBtn.addEventListener('click', downloadCSV);

els.toggleFullBtn.addEventListener('click', () => {
  const expanded = els.toggleFullBtn.getAttribute('aria-expanded') === 'true';
  els.tableWrap.hidden = expanded;
  els.toggleFullBtn.setAttribute('aria-expanded', String(!expanded));
  els.toggleFullBtn.querySelector('.toggle-label').textContent =
    expanded ? `Show full ${currentYears}-year schedule ↓` : 'Hide full schedule ↑';
});

calculate();
