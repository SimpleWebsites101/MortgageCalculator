// Debt Snowball vs Avalanche Calculator — page wiring. The simulation lives
// in calc-debt.js (shared with the Debt Repayment Calculator).
(function () {
  'use strict';
  const { gbp, gbp2, readNumber, formatOnBlur, radioValue, setResultsState, FIELD_ERRORS, escapeHtml, yearsMonths, monthFromNow, formatMonthYear, formatShortMonthYear, lineChart, bindDisclosure, resetDisclosure } = window.CalcUI;
  const D = window.DebtCalc;

  const $ = (id) => document.getElementById(id);
  const els = {
    list: $('debt-lines'), add: $('add-debt'), extra: $('extra'), budget: $('budget-total'),
    headline: $('headline'), compare: $('compare'), difference: $('difference'), warnings: $('warnings'), order: $('order'),
    chart: $('strategy-chart'), tooltip: $('strategy-chart-tooltip'),
    toggle: $('schedule-toggle'), wrap: $('schedule-wrap'), thead: $('schedule-thead'), tbody: $('schedule-tbody'),
  };
  const MAX_DEBTS = 10;
  const TOGGLE = { closed: 'Show month-by-month plan ↓', open: 'Hide plan ↑' };
  const DEFAULT_DEBTS = [
    ['Credit card', '4,500', '24.9', '135'],
    ['Personal loan', '1,200', '6.9', '110'],
    ['Store card', '1,800', '29.9', '55'],
    ['Overdraft', '2,000', '39.9', '60'],
  ];
  const NAMES = { snowball: 'Snowball', avalanche: 'Avalanche' };
  let latest = null;
  let seq = 0;

  function addDebt(name = '', balance = '', rate = '', min = '', focus = false) {
    const id = `debt-${++seq}`;
    const row = document.createElement('div');
    row.className = 'line-item line-item--debt';
    row.innerHTML = `
      <div class="compact-bar__field"><label class="line-item__label" for="${id}-name">Name</label>
        <div class="field__control"><input type="text" id="${id}-name" maxlength="40" placeholder="e.g. Credit card" autocomplete="off"></div></div>
      <div class="compact-bar__field"><label class="line-item__label" for="${id}-balance">Balance</label>
        <div class="field__control"><span class="field__prefix" aria-hidden="true">£</span><input type="text" inputmode="decimal" id="${id}-balance" autocomplete="off"></div></div>
      <div class="compact-bar__field"><label class="line-item__label" for="${id}-rate">Interest rate</label>
        <div class="field__control"><input type="text" inputmode="decimal" id="${id}-rate" autocomplete="off"><span class="field__suffix" aria-hidden="true">%</span></div></div>
      <div class="compact-bar__field"><label class="line-item__label" for="${id}-min">Minimum payment</label>
        <div class="field__control"><span class="field__prefix" aria-hidden="true">£</span><input type="text" inputmode="decimal" id="${id}-min" autocomplete="off"></div></div>
      <button type="button" class="line-item__remove"><span aria-hidden="true">×</span></button>`;
    const [nameI, balI, rateI, minI] = row.querySelectorAll('input');
    const remove = row.querySelector('.line-item__remove');
    nameI.value = name; balI.value = balance; rateI.value = rate; minI.value = min;
    const label = () => nameI.value.trim() || 'this debt';
    const sync = () => {
      balI.setAttribute('aria-label', `Balance for ${label()}`);
      rateI.setAttribute('aria-label', `Interest rate for ${label()}`);
      minI.setAttribute('aria-label', `Minimum monthly payment for ${label()}`);
      remove.setAttribute('aria-label', `Remove ${label()}`);
    };
    sync();
    nameI.addEventListener('input', () => { sync(); calculate(); });
    [balI, rateI, minI].forEach((i) => i.addEventListener('input', calculate));
    [balI, minI].forEach((i) => formatOnBlur(i, 0));
    remove.addEventListener('click', () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      syncButtons();
      calculate();
      (next ? next.querySelector('input') : els.add).focus();
    });
    els.list.appendChild(row);
    syncButtons();
    if (focus) nameI.focus();
  }

  function syncButtons() {
    const rows = els.list.children;
    els.add.disabled = rows.length >= MAX_DEBTS;
    els.add.textContent = rows.length >= MAX_DEBTS ? `Up to ${MAX_DEBTS} debts` : '+ Add a debt';
    [...rows].forEach((r) => { r.querySelector('.line-item__remove').disabled = rows.length === 1; });
  }

  function readDebts() {
    let invalid = false;
    const debts = [...els.list.children].map((row, i) => {
      const [nameI, balI, rateI, minI] = row.querySelectorAll('input');
      const d = {
        name: nameI.value.trim() || `Debt ${i + 1}`,
        balance: readNumber(balI, { label: 'Balance', min: 0.01, minLabel: '1p', max: 10000000, maxLabel: '£10,000,000' }),
        rate: readNumber(rateI, { label: 'Interest rate', min: 0, max: 100, maxLabel: '100%' }),
        minPayment: readNumber(minI, { label: 'Minimum payment', min: 0.01, minLabel: '1p', max: 1000000, maxLabel: '£1,000,000' }),
      };
      if ([d.balance, d.rate, d.minPayment].some(Number.isNaN)) invalid = true;
      return d;
    });
    return invalid ? null : debts;
  }

  function column(s, best, other) {
    const first = s.payoffOrder[0];
    return `<div class="overpay-compare__col${best ? ' overpay-compare__col--highlight' : ''}">
      <h3>${NAMES[s.strategy]} — ${s.strategy === 'snowball' ? 'smallest balance first' : 'highest rate first'}</h3>
      <dl class="result__breakdown">
        <div><dt>Debt-free</dt><dd>${formatMonthYear(monthFromNow(s.months))}</dd></div>
        <div><dt>Time to clear</dt><dd>${yearsMonths(s.months)}</dd></div>
        <div><dt>Total interest</dt><dd>${gbp2.format(s.totalInterest)}</dd></div>
        <div><dt>Total repaid</dt><dd>${gbp2.format(s.totalPaid)}</dd></div>
        <div><dt>First debt cleared</dt><dd>${escapeHtml(first.name)}, ${formatShortMonthYear(monthFromNow(first.month))}</dd></div>
        <div><dt>Interest vs ${NAMES[other]}</dt><dd>${s.totalInterest === latest[other].totalInterest ? 'Same' : `${s.totalInterest > latest[other].totalInterest ? '+' : '−'}${gbp2.format(Math.abs(s.totalInterest - latest[other].totalInterest))}`}</dd></div>
      </dl></div>`;
  }

  function orderList(s) {
    return `<div class="overpay-compare__col"><h3>${NAMES[s.strategy]}</h3><ol class="guide__list" style="margin:0">${
      s.payoffOrder.map((p) => `<li><strong>${escapeHtml(p.name)}</strong> — cleared after ${yearsMonths(p.month)} (${formatShortMonthYear(monthFromNow(p.month))}), ${gbp2.format(p.interest)} interest</li>`).join('')}</ol></div>`;
  }

  function renderSchedule() {
    if (!latest) return;
    const s = latest[radioValue('schedule-strategy')];
    const names = latest.debts.map((d) => escapeHtml(d.name));
    els.thead.innerHTML = `<tr><th scope="col">Month</th>${names.map((n) => `<th scope="col">${n}<span class="cell-sub">paid / left</span></th>`).join('')}<th scope="col">Paid</th><th scope="col">Interest</th><th scope="col">Total left</th></tr>`;
    els.tbody.innerHTML = s.schedule.map((m) => `<tr><td>${m.month}<span class="cell-sub">${formatShortMonthYear(monthFromNow(m.month))}</span></td>${
      m.payments.map((p, i) => `<td>${p > 0 ? gbp2.format(p) : '—'}<span class="cell-sub">${gbp.format(m.balances[i])}</span></td>`).join('')}<td>${gbp2.format(m.totalPaid)}</td><td>${gbp2.format(m.interest.reduce((a, b) => a + b, 0))}</td><td>${gbp2.format(m.totalBalance)}</td></tr>`).join('');
  }

  function calculate() {
    resetDisclosure(els.toggle, els.wrap, TOGGLE);
    const debts = readDebts();
    const extra = readNumber(els.extra, { label: 'Extra payment', min: 0, max: 1000000, maxLabel: '£1,000,000', allowBlank: true });
    if (!debts || Number.isNaN(extra)) {
      els.budget.textContent = '—';
      latest = null;
      return setResultsState([FIELD_ERRORS]);
    }
    els.budget.textContent = gbp2.format(debts.reduce((a, d) => a + d.minPayment, 0) + extra);
    const rateType = radioValue('rate-type');
    const c = D.compareStrategies(debts, extra, rateType);
    if (!c.ok) { latest = null; return setResultsState(c.errors); }
    setResultsState([]);
    latest = { ...c, debts };
    const { snowball: sb, avalanche: av } = c;

    const same = Math.abs(c.interestDifference) < 0.005 && c.monthDifference === 0;
    if (same) {
      els.headline.textContent = `Both strategies give the same result for these debts: debt-free in ${yearsMonths(av.months)} (${formatMonthYear(monthFromNow(av.months))}) with ${gbp2.format(av.totalInterest)} of interest.`;
    } else {
      const time = c.monthDifference > 0 ? ` and clear everything ${yearsMonths(c.monthDifference)} sooner` : c.monthDifference < 0 ? `, though it would take ${yearsMonths(-c.monthDifference)} longer` : ', finishing in the same month';
      els.headline.textContent = `The avalanche method would save ${gbp2.format(c.interestDifference)} in interest${time}.`;
    }
    els.compare.innerHTML = column(sb, false, 'avalanche') + column(av, !same, 'snowball');
    els.difference.innerHTML = `<div class="overpay-savings__item"><span>Interest difference</span><strong>${gbp2.format(Math.abs(c.interestDifference))}</strong></div>
      <div class="overpay-savings__item"><span>Time difference</span><strong>${c.monthDifference === 0 ? 'None' : yearsMonths(Math.abs(c.monthDifference))}</strong></div>
      <div class="overpay-savings__item"><span>Monthly budget (both)</span><strong>${gbp2.format(av.monthlyBudget)}</strong></div>`;

    const warnings = av.minimumBelowInterest.map((w) => `${escapeHtml(w.name)}: the ${gbp2.format(w.minimum)} minimum doesn’t cover the ${gbp2.format(w.interest)} of interest in the first month. Paying only the minimum, this balance would grow — it’s cleared here only because extra money reaches it.`);
    els.warnings.innerHTML = warnings.length ? `<div class="validation-message calc-note"><ul>${warnings.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : '';

    els.order.innerHTML = orderList(sb) + orderList(av);

    const len = Math.max(sb.totalSeries.length, av.totalSeries.length);
    const pad = (arr) => Array.from({ length: len }, (_, i) => (i < arr.length ? arr[i] : 0));
    lineChart(els.chart, els.tooltip, {
      labels: Array.from({ length: len }, (_, i) => (i === 0 ? 'Today' : `Month ${i} (${formatMonthYear(monthFromNow(i))})`)),
      tickLabels: Array.from({ length: len }, (_, i) => (i === 0 ? 'Now' : formatShortMonthYear(monthFromNow(i)))),
      series: [
        { name: 'Snowball', values: pad(sb.totalSeries), color: '#A6A9B2' },
        { name: 'Avalanche', values: pad(av.totalSeries), color: '#3B7DFF' },
      ],
    });
    renderSchedule();
  }

  DEFAULT_DEBTS.forEach((d) => addDebt(...d));
  els.add.addEventListener('click', () => { addDebt('', '', '', '', true); calculate(); });
  formatOnBlur(els.extra);
  els.extra.addEventListener('input', calculate);
  document.querySelectorAll('input[name="rate-type"]').forEach((r) => r.addEventListener('change', calculate));
  document.querySelectorAll('input[name="schedule-strategy"]').forEach((r) => r.addEventListener('change', renderSchedule));
  bindDisclosure(els.toggle, els.wrap, TOGGLE);
  calculate();
})();
