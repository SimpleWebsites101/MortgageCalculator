// Shared cookie consent banner — gates Google Analytics behind an actual
// opt-in choice, rather than loading it unconditionally. Reused verbatim
// across every page via the same markup pattern.
//
// When Google AdSense goes live: wire it in the same way as loadAnalytics()
// below — only inject the AdSense script inside the "accepted" path, never
// unconditionally, so ads are only ever shown to visitors who've consented.
(function () {
  const GA_ID = 'G-7C01HBQGR4';
  const STORAGE_KEY = 'cookie-consent';

  function loadAnalytics() {
    // Explicitly re-enable in case a prior visit had disabled tracking.
    window[`ga-disable-${GA_ID}`] = false;

    if (window.__gaLoaded) return;
    window.__gaLoaded = true;

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);
  }

  // Google's own documented opt-out flag. If analytics was previously
  // loaded this session, this stops it sending any further hits — it
  // can't literally unload the script, but it does make it inert.
  function disableAnalytics() {
    window[`ga-disable-${GA_ID}`] = true;
  }

  function showBanner(banner) {
    banner.hidden = false;
    // Move focus into the banner for keyboard/screen-reader users.
    const acceptBtn = document.getElementById('cookie-accept');
    if (acceptBtn) acceptBtn.focus();
  }

  function init() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;

    const acceptBtn = document.getElementById('cookie-accept');
    const rejectBtn = document.getElementById('cookie-reject');
    const settingsLink = document.getElementById('cookie-settings');

    function applyChoice(choice) {
      localStorage.setItem(STORAGE_KEY, choice);
      if (choice === 'accepted') {
        loadAnalytics();
      } else {
        disableAnalytics();
      }
      banner.hidden = true;
    }

    acceptBtn.addEventListener('click', () => applyChoice('accepted'));
    rejectBtn.addEventListener('click', () => applyChoice('rejected'));

    // "Cookie settings" link in the footer — lets a visitor change their
    // mind at any time, on any page, not just their first visit.
    if (settingsLink) {
      settingsLink.addEventListener('click', (e) => {
        e.preventDefault();
        showBanner(banner);
      });
    }

    const choice = localStorage.getItem(STORAGE_KEY);
    if (choice === 'accepted') {
      loadAnalytics();
      return;
    }
    if (choice === 'rejected') {
      disableAnalytics();
      return;
    }

    // No choice made yet — show the banner on this first visit.
    showBanner(banner);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
