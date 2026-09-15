(function () {
  'use strict';

  // The corner menu, standalone for the static pages (about/browse/privacy)
  // that don't load app.js. Mystery Animal and Report a problem have no
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

  // Marks whichever menu item links to this same page - by basename, since
  // hrefs are a mix of plain pages (about.html) and index.html query links
  // (./?mystery=1) that should never match here. aria-current does the
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

  // -- Nav search --------------------------------------------------------
  // The standalone pages have no search box of their own; this is a way
  // to reach any animal without a trip back to the home page first.
  // Reuses SearchCore (search-core.js) rather than the home page's own
  // copy of the same matching, so this file doesn't need app.js at all.
  const navSearch = el('navSearch'), navToggle = el('navSearchToggle'),
        navRow = el('navSearchRow'), navClose = el('navSearchClose'), navInput = el('navSearchInput'),
        navResults = el('navSearchResults'), navNoResult = el('navSearchNoResult');
  if (navSearch && navToggle && navRow && navClose && navInput && navResults && navNoResult && window.SearchCore) {
    let results = [];
    let cursor = -1;

    // The toggle button and the field swap places in the same slot in
    // the nav bar - never both visible at once - rather than the field
    // dropping into a second box underneath the nav.
    function setSearchOpen(open) {
      navToggle.hidden = open;
      navRow.hidden = !open;
      navToggle.setAttribute('aria-expanded', String(open));
      if (open) { navInput.focus(); navInput.select(); }
      else { results = []; cursor = -1; renderResults(); navInput.value = ''; navNoResult.hidden = true; }
    }

    function renderResults() {
      navResults.innerHTML = '';
      if (!results.length) {
        navResults.hidden = true;
        navInput.setAttribute('aria-expanded', 'false');
        return;
      }
      const typed = SearchCore.norm(navInput.value);
      results.forEach((entry, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === cursor));
        const em = document.createElement('span');
        em.className = 's-emoji';
        em.textContent = entry.a.e || '🐾';
        const nm = document.createElement('span');
        nm.textContent = entry.a.n;
        li.append(em, nm);
        const alias = (entry.a.a || []).find((x) => SearchCore.norm(x).startsWith(typed));
        if (alias && !SearchCore.norm(entry.a.n).startsWith(typed)) {
          const al = document.createElement('span');
          al.className = 's-alias';
          al.textContent = '· ' + alias;
          li.appendChild(al);
        }
        li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(entry); });
        navResults.appendChild(li);
      });
      navResults.hidden = false;
      navInput.setAttribute('aria-expanded', 'true');
    }

    function pick(entry) {
      location.href = './?a=' + entry.slug;
    }

    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      setSearchOpen(true);
    });

    navClose.addEventListener('click', (e) => {
      e.stopPropagation();
      setSearchOpen(false);
      navToggle.focus();
    });

    navInput.addEventListener('input', () => {
      results = SearchCore.search(navInput.value, 8);
      cursor = results.length ? 0 : -1;
      renderResults();
      if (navInput.value.trim() && !results.length) {
        navNoResult.hidden = false;
        navNoResult.textContent = 'No match for "' + navInput.value.trim() +
          '". It might not be in here yet — there are ' + SearchCore.count + ' so far.';
      } else {
        navNoResult.hidden = true;
      }
    });

    navInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setSearchOpen(false); navToggle.focus(); return; }
      if (!results.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % results.length; renderResults(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + results.length) % results.length; renderResults(); }
      else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.max(cursor, 0)]); }
    });

    document.addEventListener('click', (e) => {
      if (!navSearch.contains(e.target)) setSearchOpen(false);
    });
  }
})();
