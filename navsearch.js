(function () {
  'use strict';

  /* The site bar's Search, on every page (index.html included).
   *
   * A toggle that never moves, plus a popover anchored under the bar -
   * the nav itself never changes size or position when this opens (the
   * old in-place version swapped the button for a 240px field inside the
   * pill, which is what made it balloon). Matching is SearchCore's
   * (search-core.js), so this needs neither app.js nor menu.js.
   *
   * Picking an animal: inside index.html, app.js exposes GMA.openSlug and
   * the lookup opens in place; everywhere else it's a normal navigation.
   *
   * Talks to whichever file owns the hamburger (app.js on index, menu.js
   * elsewhere) through two document events rather than a shared global,
   * so only one of the two panels is ever open: 'gma:menu-open' (the
   * menu opened, so close this) and 'gma:search-open' (this opened, so
   * close the menu).
   */

  const el = (id) => document.getElementById(id);
  const wrap = el('navSearch'), toggle = el('navSearchToggle'), pop = el('navSearchPop'),
        input = el('navSearchInput'), list = el('navSearchResults'),
        noResult = el('navSearchNoResult'), closeBtn = el('navSearchClose');
  if (!wrap || !toggle || !pop || !input || !list || !noResult || !closeBtn || !window.SearchCore) return;

  let results = [];
  let cursor = -1;

  function isOpen() { return !pop.hidden; }

  function setOpen(open, opts) {
    if (open === isOpen()) return;
    pop.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      document.dispatchEvent(new CustomEvent('gma:search-open'));
      input.focus();
      input.select();
    } else {
      input.value = '';
      results = []; cursor = -1;
      render();
      noResult.hidden = true;
      if (opts && opts.refocus) toggle.focus();
    }
  }

  function render() {
    list.innerHTML = '';
    if (!results.length) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      return;
    }
    const typed = SearchCore.norm(input.value);
    results.forEach((entry, i) => {
      const li = document.createElement('li');
      li.id = 'navSearchOpt' + i;
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(i === cursor));
      const em = document.createElement('span');
      em.className = 's-emoji';
      em.setAttribute('aria-hidden', 'true');
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
      // mousedown, not click: a click would blur the input first, and
      // the focusout handler below would close the popover under it.
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(entry); });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (cursor >= 0) {
      input.setAttribute('aria-activedescendant', 'navSearchOpt' + cursor);
      const cur = list.children[cursor];
      if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    } else {
      input.removeAttribute('aria-activedescendant');
    }
  }

  function pick(entry) {
    setOpen(false);
    if (window.GMA && typeof GMA.openSlug === 'function' && GMA.openSlug(entry.slug)) return;
    location.href = '/animals/' + entry.slug;
  }

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen(), { refocus: true });
  });
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(false, { refocus: true });
  });

  input.addEventListener('input', () => {
    results = SearchCore.search(input.value, 8);
    cursor = results.length ? 0 : -1;
    render();
    const typed = input.value.trim();
    if (typed && !results.length) {
      noResult.hidden = false;
      noResult.textContent = 'No match for "' + typed +
        '". It might not be in here yet — there are ' + SearchCore.count + ' so far.';
    } else {
      noResult.hidden = true;
    }
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false, { refocus: true }); return; }
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % results.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + results.length) % results.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.max(cursor, 0)]); }
  });

  // Tabbing out of the popover (past the close button, or shift-tab
  // back past the field) closes it - a popover that stays open behind
  // focus is a trap for the eye, not the keyboard, but still a trap.
  pop.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !wrap.contains(e.relatedTarget)) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !wrap.contains(e.target)) setOpen(false);
  });
  document.addEventListener('gma:menu-open', () => setOpen(false));
  // In-page "search for it" links (the /explore hub's) open this instead
  // of following their href, which is the homepage search as a fallback.
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-open-search]');
    if (!link) return;
    e.preventDefault();
    setOpen(true);
  });
})();

(function () {
  'use strict';

  /* The desktop pill's "Game modes" dropdown (markup in tools/chrome.js).
   * Here rather than in app.js/menu.js because this file is the one bar
   * script every page loads. On phones the toggle is display:none and
   * the three items always show inside the hamburger panel, so none of
   * this ever runs there. Opening it closes Search, and Search opening
   * closes it, through the same 'gma:menu-open' / 'gma:search-open'
   * events as the hamburger.
   */

  const group = document.getElementById('modesGroup');
  const toggle = document.getElementById('modesToggle');
  if (!group || !toggle) return;

  function isOpen() { return group.classList.contains('is-open'); }
  function setOpen(open, opts) {
    if (open === isOpen()) return;
    group.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (open) document.dispatchEvent(new CustomEvent('gma:menu-open'));
    else if (opts && opts.refocus) toggle.focus();
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  // Picking a mode (a link, or on index.html a button that opens the
  // view in place) is done with the list.
  group.addEventListener('click', (e) => {
    if (e.target.closest('#modesList .menu-item')) setOpen(false);
  });
  group.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); setOpen(false, { refocus: true }); }
  });
  group.addEventListener('focusout', (e) => {
    if (e.relatedTarget && !group.contains(e.relatedTarget)) setOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (isOpen() && !group.contains(e.target)) setOpen(false);
  });
  document.addEventListener('gma:search-open', () => setOpen(false));
})();
