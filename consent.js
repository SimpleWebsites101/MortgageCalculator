// Shared cookie consent banner — gates Google Analytics behind an actual
// opt-in choice, rather than loading it unconditionally. Reused verbatim
// across every page via the same markup pattern.
(function () {
  const GA_ID = 'G-7C01HBQGR4';
  const STORAGE_KEY = 'cookie-consent';

  function loadAnalytics() {
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

  function init() {
    const banner = document.getElementById('cookie-banner');
    if (!banner) return;

    const acceptBtn = document.getElementById('cookie-accept');
    const rejectBtn = document.getElementById('cookie-reject');
    const choice = localStorage.getItem(STORAGE_KEY);

    if (choice === 'accepted') {
      loadAnalytics();
      return; // no need to show the banner again
    }
    if (choice === 'rejected') {
      return; // respected — banner stays hidden, analytics stays off
    }

    // No choice made yet — show the banner.
    banner.hidden = false;

    acceptBtn.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, 'accepted');
      loadAnalytics();
      banner.hidden = true;
    });

    rejectBtn.addEventListener('click', () => {
      localStorage.setItem(STORAGE_KEY, 'rejected');
      banner.hidden = true;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
