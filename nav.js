// Shared responsive navigation — reused verbatim across every page.
//
// Markup contract:
//   .masthead__menu                     wraps the toggle + panel (anchor)
//     button.masthead__toggle           opens/closes the whole panel
//       .masthead__toggle-icon          ☰ / ✕ glyph
//       .masthead__toggle-label         "Menu" / "Close" text (hidden <620px)
//     nav.masthead__nav[hidden]         the dropdown panel
//       .masthead__section              one per top-level group (Calculators, Articles, ...)
//         button.masthead__section-toggle[aria-expanded][aria-controls]
//         ul.masthead__submenu[hidden]  real <a href> children, or a
//                                       .masthead__submenu-placeholder span
//                                       for links that don't exist yet
//
// No other page-specific wiring needed — every page shares this file.
(function () {
  function init() {
    const menu = document.querySelector('.masthead__menu');
    const toggle = document.querySelector('.masthead__toggle');
    const nav = document.querySelector('.masthead__nav');
    if (!menu || !toggle || !nav) return;

    const icon = toggle.querySelector('.masthead__toggle-icon');
    const label = toggle.querySelector('.masthead__toggle-label');
    const sectionToggles = Array.from(nav.querySelectorAll('.masthead__section-toggle'));

    function closeSection(sectionToggle) {
      const submenu = document.getElementById(sectionToggle.getAttribute('aria-controls'));
      sectionToggle.setAttribute('aria-expanded', 'false');
      if (submenu) submenu.hidden = true;
    }

    function openMenu() {
      nav.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      if (icon) icon.textContent = '✕';
      if (label) label.textContent = 'Close';
    }

    function closeMenu() {
      nav.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (icon) icon.textContent = '☰';
      if (label) label.textContent = 'Menu';
      // Collapse any open accordion sections so the panel always reopens
      // in the same, predictable, fully-collapsed state.
      sectionToggles.forEach(closeSection);
    }

    toggle.addEventListener('click', () => {
      if (nav.hidden) openMenu(); else closeMenu();
    });

    // Each top-level group (Calculators, Articles, ...) is its own
    // disclosure control — click/tap only, so it works the same on
    // touchscreens as it does with a mouse.
    sectionToggles.forEach((sectionToggle) => {
      const submenu = document.getElementById(sectionToggle.getAttribute('aria-controls'));
      if (!submenu) return;
      sectionToggle.addEventListener('click', () => {
        const isOpen = sectionToggle.getAttribute('aria-expanded') === 'true';
        if (isOpen) {
          closeSection(sectionToggle);
        } else {
          sectionToggle.setAttribute('aria-expanded', 'true');
          submenu.hidden = false;
        }
      });
    });

    // Close whenever a real child link is followed — same-page anchors
    // still get the site's existing smooth-scroll behaviour, since we
    // never call preventDefault here.
    nav.querySelectorAll('.masthead__submenu a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
      if (!nav.hidden && !menu.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !nav.hidden) {
        closeMenu();
        toggle.focus();
      }
    });

    // The panel behaves identically at every width, so there's no
    // breakpoint-driven reset here — it only ever closes on its own
    // triggers (toggle click, link click, outside click, Escape).
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
