// Monthly Budget Calculator — page wiring. Maths lives in calc-budget.js.
// Everything stays in memory on this page: nothing is stored or sent.
(function () {
  'use strict';
  const { gbp, gbp2, pct, readNumber, formatOnBlur, setResultsState, FIELD_ERRORS, tile, escapeHtml } = window.CalcUI;
  const B = window.BudgetCalc;

  const $ = (id) => document.getElementById(id);
  const els = { headline: $('headline'), tiles: $('tiles'), bars: $('bar-list'), annual: $('annual-tbody') };
  const MAX_LINES = 25;
  const FREQUENCIES = [['monthly', 'Monthly'], ['weekly', 'Weekly'], ['quarterly', 'Quarterly'], ['annual', 'Yearly']];

  const DEFAULTS = {
    'income-lines': [['Take-home pay', '2,400'], ['Other income', '0']],
    'expense-lines': [
      ['Housing (rent or mortgage)', '950'],
      ['Utilities and household bills', '290'],
      ['Food and groceries', '80', 'weekly'],
      ['Transport', '160'],
      ['Debt repayments', '120'],
      ['Subscriptions', '35'],
      ['Entertainment and eating out', '120'],
      ['Other expenses', '100'],
    ],
    'savings-lines': [['Savings and investments', '200']],
  };
  const PLACEHOLDER = { income: 'e.g. Child Benefit', expense: 'e.g. Car insurance', savings: 'e.g. Cash ISA' };

  let seq = 0;

  function addLine(list, name = '', amount = '', frequency = 'monthly', focus = false) {
    const kind = list.dataset.kind;
    const id = `li-${++seq}`;
    const row = document.createElement('div');
    row.className = 'line-item';
    row.innerHTML = `
      <div class="compact-bar__field">
        <label class="line-item__label" for="${id}-name">Item</label>
        <div class="field__control"><input type="text" id="${id}-name" maxlength="60" placeholder="${PLACEHOLDER[kind]}" autocomplete="off"></div>
      </div>
      <div class="compact-bar__field">
        <label class="line-item__label" for="${id}-amount">Amount</label>
        <div class="field__control"><span class="field__prefix" aria-hidden="true">£</span><input type="text" inputmode="decimal" id="${id}-amount" autocomplete="off"></div>
      </div>
      <div class="compact-bar__field">
        <label class="line-item__label" for="${id}-freq">How often</label>
        <div class="field__control"><select id="${id}-freq">${FREQUENCIES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></div>
      </div>
      <button type="button" class="line-item__remove"><span aria-hidden="true">×</span></button>`;
    const nameInput = row.querySelector(`#${id}-name`);
    const amountInput = row.querySelector(`#${id}-amount`);
    const freq = row.querySelector('select');
    const remove = row.querySelector('.line-item__remove');
    nameInput.value = name;
    amountInput.value = amount;
    freq.value = frequency;

    // Accessible names include the item's own label so screen-reader users
    // know which line each amount or remove button belongs to.
    const label = () => nameInput.value.trim() || 'this item';
    const syncNames = () => {
      amountInput.setAttribute('aria-label', `Amount for ${label()}`);
      freq.setAttribute('aria-label', `How often for ${label()}`);
      remove.setAttribute('aria-label', `Remove ${label()}`);
    };
    syncNames();
    nameInput.addEventListener('input', () => { syncNames(); calculate(); });
    amountInput.addEventListener('input', calculate);
    freq.addEventListener('change', calculate);
    formatOnBlur(amountInput, 2);
    amountInput.addEventListener('blur', () => { amountInput.value = amountInput.value.replace(/\.00$/, ''); });
    remove.addEventListener('click', () => {
      const next = row.nextElementSibling || row.previousElementSibling;
      row.remove();
      syncAddButtons();
      calculate();
      (next ? next.querySelector('input') : document.querySelector(`[data-add="${list.id}"]`)).focus();
    });

    list.appendChild(row);
    syncAddButtons();
    if (focus) nameInput.focus();
  }

  function syncAddButtons() {
    document.querySelectorAll('[data-add]').forEach((btn) => {
      const count = $(btn.dataset.add).children.length;
      btn.disabled = count >= MAX_LINES;
      btn.title = btn.disabled ? `Up to ${MAX_LINES} lines per section` : '';
    });
  }

  function readLines() {
    const lines = [];
    let invalid = false;
    document.querySelectorAll('.line-items').forEach((list) => {
      list.querySelectorAll('.line-item').forEach((row, i) => {
        const [nameInput, amountInput] = row.querySelectorAll('input');
        const label = nameInput.value.trim() || `Unnamed ${list.dataset.kind === 'income' ? 'income' : 'item'} ${i + 1}`;
        const amount = readNumber(amountInput, { label: 'Amount', min: 0, max: 10000000, maxLabel: '£10,000,000', allowBlank: true });
        if (Number.isNaN(amount)) invalid = true;
        lines.push({ label, amount, frequency: row.querySelector('select').value, kind: list.dataset.kind });
      });
    });
    return invalid ? null : lines;
  }

  function calculate() {
    const lines = readLines();
    if (!lines) return setResultsState([FIELD_ERRORS]);
    const r = B.summariseBudget(lines);
    if (!r.ok) return setResultsState(r.errors);
    if (r.income === 0 && r.outgoings === 0) return setResultsState(['Enter at least one amount to see your budget.']);
    setResultsState([]);

    const surplus = r.remaining >= 0;
    if (r.income === 0) {
      els.headline.textContent = `You’ve entered ${gbp2.format(r.outgoings)} a month going out but no income yet.`;
    } else if (Math.abs(r.remaining) < 0.005) {
      els.headline.textContent = 'Your budget balances exactly — every pound of income has a job.';
    } else {
      els.headline.textContent = surplus
        ? `You have ${gbp2.format(r.remaining)} left over each month — ${gbp.format(r.annual.remaining)} a year.`
        : `You’re spending ${gbp2.format(-r.remaining)} a month more than comes in — ${gbp.format(-r.annual.remaining)} a year.`;
    }

    els.tiles.innerHTML = [
      tile('Monthly income', gbp2.format(r.income), `${gbp.format(r.annual.income)} a year`),
      tile('Monthly spending', gbp2.format(r.expenses), r.income > 0 ? `${pct(r.expenses / r.income, 0)} of income` : 'no income entered'),
      tile('Monthly savings', gbp2.format(r.savings), r.savingsRate != null ? `savings rate ${pct(r.savingsRate)}` : 'savings rate needs income'),
      tile(surplus ? 'Left over' : 'Shortfall', gbp2.format(Math.abs(r.remaining)),
        surplus && r.potentialSavingsRate != null && r.remaining > 0 ? `saving it too would make your rate ${pct(r.potentialSavingsRate)}` : surplus ? 'per month' : 'more going out than coming in', true),
    ].join('');

    const max = Math.max(...r.categories.map((c) => c.monthly), 1);
    els.bars.innerHTML = r.categories.length ? r.categories.map((c) => `<li class="bar-list__row">
        <span class="bar-list__label">${escapeHtml(c.label)}${c.kind === 'savings' ? ' <span class="is-muted">(savings)</span>' : ''}</span>
        <span class="bar-list__track"><span class="bar-list__fill${c.kind === 'savings' ? ' bar-list__fill--savings' : ''}" style="width:${(c.monthly / max) * 100}%"></span></span>
        <span class="bar-list__value">${gbp2.format(c.monthly)}<span>${c.shareOfIncome != null ? pct(c.shareOfIncome, 0) : '—'}</span></span>
      </li>`).join('') : '<li class="bar-list__row"><span class="bar-list__label">No spending entered yet.</span></li>';

    const row = (label, m, cls = '') => `<tr${cls}><td>${label}</td><td>${m < 0 ? '−' : ''}${gbp2.format(Math.abs(m))}</td><td>${m < 0 ? '−' : ''}${gbp2.format(Math.abs(m * 12))}</td></tr>`;
    els.annual.innerHTML = row('Income', r.income) + row('Spending', r.expenses) + row('Savings', r.savings)
      + row(surplus ? 'Left over' : 'Shortfall', r.remaining, ' class="is-total-row"');
  }

  Object.entries(DEFAULTS).forEach(([listId, lines]) => {
    lines.forEach(([name, amount, freq]) => addLine($(listId), name, amount, freq || 'monthly'));
  });
  document.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => { addLine($(btn.dataset.add), '', '', 'monthly', true); calculate(); });
  });
  calculate();
})();
