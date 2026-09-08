(function () {
  'use strict';

  // The corner menu, standalone for the static pages (about/browse/privacy)
  // that don't load app.js. Mystery Animal, Stream Mode and Report a
  // problem have no dialog to open here, so those items are plain links
  // back to index.html with a query param app.js's routeFromURL() reads
  // on load (?mystery=1 already existed for sharing; ?stream=1 and
  // ?report=1 were added alongside this file). Theme and sound share the
  // same localStorage keys as app.js so a choice made here or there stays
  // in sync everywhere.

  const el = (id) => document.getElementById(id);
  const THEME_KEY = 'gma-theme';
  const SOUND_KEY = 'gma-mystery-sound';

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

  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; } })();
  const soundBtn = el('soundToggle');
  if (soundBtn) {
    function updateSoundToggle() {
      soundBtn.textContent = soundOn ? 'Sound on' : 'Sound off';
      soundBtn.setAttribute('aria-pressed', String(soundOn));
    }
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (err) {}
      updateSoundToggle();
    });
    updateSoundToggle();
  }

  const menu = el('menu'), menuBtn = el('menuBtn'), menuPanel = el('menuPanel');
  if (menu && menuBtn && menuPanel) {
    function setMenu(open) {
      menuPanel.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
    }
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
