// Compact mobile resource groups — homepage only.
//
// Keeps calculator/article sections from growing into an endless mobile
// scroll as more resources are added, without touching desktop at all.
//
// Markup contract (per collapsible group):
//   [data-collapsible-group]            the grid/list that holds the items
//     id="..."                          referenced by the toggle's aria-controls
//     data-item-selector="..."          CSS selector matching one item
//     data-resource-label="..."         plural noun used in the toggle text
//     (items matching data-item-selector, in DOM order)
//
// Behaviour:
//   - Groups with 3 or fewer items are left completely alone: no button,
//     no hidden items, nothing for JS to do.
//   - Groups with more than 3 items get items beyond the 3rd marked
//     .resource-grid__item--extra and a real <button> inserted after the
//     group. CSS (not JS) hides .resource-grid__item--extra, and only
//     inside the small-viewport media query — desktop always shows every
//     item, with or without JS, with or without the button's state.
//   - The button toggles a single .is-expanded class on the group and its
//     own aria-expanded/text. Each group gets its own independent button
//     and state, so expanding one category never touches another.
(function () {
  const LIMIT = 3;

  function initGroup(container) {
    const itemSelector = container.getAttribute('data-item-selector');
    const label = container.getAttribute('data-resource-label') || 'items';
    if (!itemSelector || !container.id) return;

    const items = Array.from(container.querySelectorAll(itemSelector));
    if (items.length <= LIMIT) return; // nothing to collapse — no control needed

    items.slice(LIMIT).forEach((el) => el.classList.add('resource-grid__item--extra'));
    container.setAttribute('data-collapsible', '');

    const collapsedText = `Show all ${label} (${items.length})`;
    const expandedText = 'Show fewer';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'resource-grid__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', container.id);
    toggle.textContent = collapsedText;

    toggle.addEventListener('click', () => {
      const expanding = !container.classList.contains('is-expanded');
      container.classList.toggle('is-expanded', expanding);
      toggle.setAttribute('aria-expanded', String(expanding));
      toggle.textContent = expanding ? expandedText : collapsedText;

      if (!expanding) {
        // Collapsing can remove a lot of height above the fold position the
        // user was at — if that leaves the toggle itself out of view, bring
        // it gently back rather than stranding the viewport over whatever
        // now-unrelated content scrolled up to fill the gap.
        const rect = toggle.getBoundingClientRect();
        const outOfView = rect.top < 0 || rect.bottom > window.innerHeight;
        if (outOfView) {
          const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          toggle.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      }
    });

    container.insertAdjacentElement('afterend', toggle);
  }

  function init() {
    document.querySelectorAll('[data-collapsible-group]').forEach(initGroup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
