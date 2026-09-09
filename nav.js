// Shared responsive navigation toggle — reused verbatim across every page.
// Requires: a button with class "masthead__toggle" (containing children
// ".masthead__toggle-icon" and ".masthead__toggle-label"), and a nav with
// class "masthead__nav". No other page-specific wiring needed.
(function () {
  function init() {
    const toggle = document.querySelector('.masthead__toggle');
    const nav = document.querySelector('.masthead__nav');
    if (!toggle || !nav) return;

    const icon = toggle.querySelector('.masthead__toggle-icon');
    const label = toggle.querySelector('.masthead__toggle-label');

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
    }

    toggle.addEventListener('click', () => {
      if (nav.hidden) openMenu(); else closeMenu();
    });

    // Close whenever a nav link is actually followed — same-page anchors
    // (e.g. #faq) still get the site's existing smooth-scroll behaviour,
    // since we never call preventDefault here.
    nav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('click', (e) => {
      if (!nav.hidden && !nav.contains(e.target) && !toggle.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !nav.hidden) {
        closeMenu();
        toggle.focus();
      }
    });

    // If the window is resized past the point the mobile menu applies,
    // reset to a closed state so it doesn't reappear unexpectedly if the
    // user later resizes back down.
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (window.innerWidth > 900 && !nav.hidden) closeMenu();
      }, 150);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
