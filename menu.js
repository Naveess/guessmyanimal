(function () {
  'use strict';

  // The menu, theme and sound wiring for the standalone pages
  // (about/browse/privacy/streamer) that don't load app.js. The bar's
  // Search lives in navsearch.js, shared with index.html. Mystery Animal and Report a problem have no
  // dialog to open here, so those items are plain links back to
  // index.html with a query param app.js's routeFromURL() reads on load
  // (?mystery=1 already existed for sharing; ?report=1 was added
  // alongside this file). Theme and sound share the same localStorage
  // keys as app.js so a choice made here or there stays in sync
  // everywhere.

  const el = (id) => document.getElementById(id);
  const THEME_KEY = 'gma-theme';

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  function syncThemeColour() {
    if (!themeMeta) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) themeMeta.setAttribute('content', bg);
  }
  function readTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'dark' || v === 'light' ? v : 'system';
    } catch (err) { return 'system'; }
  }
  function applyTheme(choice) {
    if (choice === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', choice);
    try {
      if (choice === 'system') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, choice);
    } catch (err) { /* private mode: it just will not persist */ }
    for (const b of document.querySelectorAll('[data-theme-set]')) {
      b.setAttribute('aria-pressed', String(b.dataset.themeSet === choice));
    }
    syncThemeColour();
  }
  for (const b of document.querySelectorAll('[data-theme-set]')) {
    b.addEventListener('click', () => applyTheme(b.dataset.themeSet));
  }
  applyTheme(readTheme());

  // Reads/writes through sfx.js's own copy of this preference (loaded
  // before this file - see the <script> order) rather than keeping a
  // second one here that could drift from it.
  const soundBtn = el('soundToggle');
  if (soundBtn && window.GMA_SFX) {
    function updateSoundToggle() {
      const on = GMA_SFX.isSoundOn();
      soundBtn.setAttribute('aria-pressed', String(on));
      soundBtn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
    }
    soundBtn.addEventListener('click', () => {
      GMA_SFX.setSoundOn(!GMA_SFX.isSoundOn());
      updateSoundToggle();
      // Turning it on demonstrates itself; turning it off has to be
      // silent, same reasoning as index.html's own toggle.
      GMA_SFX.sfx('tap');
    });
    updateSoundToggle();
  }

  // Marks whichever menu item links to this same page - by last path
  // segment, since hrefs are a mix of plain pages (/about) and index.html
  // query links (/?mystery=1) that should never match here. aria-current does the
  // announcing (a screen reader gets "current page" for free); the CSS
  // hook is the same attribute, not a class only sighted users would see.
  const herePage = location.pathname.split('/').pop() || 'index.html';
  for (const a of document.querySelectorAll('.menu-item[href]')) {
    if (a.getAttribute('href').split('/').pop() === herePage) a.setAttribute('aria-current', 'page');
  }

  const menu = el('menu'), menuBtn = el('menuBtn'), menuPanel = el('menuPanel');
  if (menu && menuBtn && menuPanel) {
    function setMenu(open) {
      menuPanel.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      // One panel at a time - see navsearch.js for the other half.
      if (open) document.dispatchEvent(new CustomEvent('gma:menu-open'));
    }
    document.addEventListener('gma:search-open', () => setMenu(false));
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setMenu(menuPanel.hidden);
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !menuPanel.hidden) { setMenu(false); menuBtn.focus(); }
    });
  }
})();
