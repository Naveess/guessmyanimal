(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  // Transparent 1x1. An <img> with no src at all is a broken-image icon.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* -- Sound -----------------------------------------------------------
     The engine itself (tones, the delegated tap listener) moved to
     sfx.js so every page gets it, not just this one - see that file.
     Named sfx, not play: below has its own play(node, cls, delay)
     animation-restart helper, and a second function play in the same
     scope would silently replace the first. */
  function sfx(name) {
    if (window.GMA_SFX) GMA_SFX.sfx(name);
  }

  function updateSoundToggle() {
    const btn = el('soundToggle');
    if (!btn || !window.GMA_SFX) return;
    const on = GMA_SFX.isSoundOn();
    btn.setAttribute('aria-pressed', String(on));
    btn.setAttribute('aria-label', on ? 'Sound on' : 'Sound off');
  }

  el('soundToggle').addEventListener('click', () => {
    if (!window.GMA_SFX) return;
    GMA_SFX.setSoundOn(!GMA_SFX.isSoundOn());
    updateSoundToggle();
    // Turning it on demonstrates itself; turning it off has to be silent
    // or the setting argues with the click that just set it.
    sfx('tap');
  });
  updateSoundToggle();

  /* -- Searching -----------------------------------------------------
     Typo tolerance matters more than cleverness here: people type this
     one-handed, mid-conversation, and "gorila" or "hipo" should still
     land. Prefix beats substring, and a name beats an alias, so the
     obvious answer sits at the top rather than an alphabetical one. */

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  // Hyphens become spaces first, or the normaliser strips them and
  // "snow-leopard" from a shared URL turns into "snowleopard", which
  // matches no entry. That silently broke the link for every animal
  // with a two-word name.
  const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

  const INDEX = ANIMALS.map((a, i) => ({
    a,
    i,
    slug: slugify(a.n),
    hay: [norm(a.n)].concat((a.a || []).map(norm)),
  }));

  function score(entry, q) {
    let best = 0;
    for (let k = 0; k < entry.hay.length; k++) {
      const h = entry.hay[k];
      const isName = k === 0;
      if (h === q) best = Math.max(best, isName ? 100 : 90);
      else if (h.startsWith(q)) best = Math.max(best, isName ? 80 : 70);
      else if (h.includes(q)) best = Math.max(best, isName ? 55 : 45);
      // One missing or swapped letter: "gorila", "penguine", "hipo".
      else if (q.length >= 4 && near(h, q)) best = Math.max(best, 30);
    }
    return best;
  }

  // Cheap edit-distance check, capped at one edit. Good enough for typing
  // an animal name and far smaller than a real Levenshtein implementation.
  function near(h, q) {
    if (Math.abs(h.length - q.length) > 1) return false;
    let i = 0, j = 0, edits = 0;
    while (i < h.length && j < q.length) {
      if (h[i] === q[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (h.length > q.length) i++;
      else if (h.length < q.length) j++;
      else { i++; j++; }
    }
    return edits + (h.length - i) + (q.length - j) <= 1;
  }

  /* Every name in the data is singular, and people type plurals. The
     fuzzy matcher caps at one edit, so "bats" found "bat" by luck while
     "wolves", "foxes", "geese" and "octopuses" found nothing at all. */

  const IRREGULAR = {
    mice: 'mouse', geese: 'goose', feet: 'foot', teeth: 'tooth',
    children: 'child', men: 'man', women: 'woman', oxen: 'ox',
    lice: 'louse', people: 'person', wolves: 'wolf', calves: 'calf',
    halves: 'half', leaves: 'leaf', knives: 'knife', lives: 'life',
    elves: 'elf', loaves: 'loaf', thieves: 'thief', dwarves: 'dwarf',
  };

  function singular(q) {
    if (IRREGULAR[q]) return IRREGULAR[q];
    if (/[^aeiou]ies$/.test(q)) return q.slice(0, -3) + 'y';        // puppies
    if (/ves$/.test(q)) return q.slice(0, -3) + 'f';                // hooves
    if (/(ses|xes|zes|ches|shes)$/.test(q)) return q.slice(0, -2);  // foxes, octopuses
    if (/oes$/.test(q)) return q.slice(0, -2);                      // mosquitoes
    if (/[^s]s$/.test(q)) return q.slice(0, -1);                    // bats
    return null;                                                     // bass, fish, sheep
  }

  function search(raw, limit) {
    const q = norm(raw);
    if (!q) return [];

    // The literal query always outranks the singularised one, so typing an
    // animal whose real name ends in "s" still beats a stemmed guess.
    const forms = [q];
    const one = singular(q);
    if (one && one.length >= 3 && one !== q) forms.push(one);

    return INDEX
      .map((e) => ({ e, s: Math.max.apply(null, forms.map((f, i) => score(e, f) - (i ? 1 : 0))) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s || x.e.a.n.length - y.e.a.n.length)
      .slice(0, limit || 8)
      .map((r) => r.e);
  }

  // What Quick Answers and At a Glance actually contain lives in
  // render-data.js now, shared with tools/build-seo.js so the page
  // baked server-side for a crawler can never drift from what this
  // renders client-side - one function deciding the content, not two.
  const { answers, glanceGroups, cap, ICONS } = RenderData;

  function renderAnswers(a) {
    const box = el('answers');
    box.innerHTML = '';
    const rows = answers(a);
    rows.forEach(([k, v, state], i) => {
      // A breathing gap after the identity/risk cluster, before the
      // behaviour cluster - eight identical rows read as one wall of
      // text otherwise, and the first four are the ones worth reaching
      // for fastest.
      if (i === 4) {
        const gap = document.createElement('div');
        gap.className = 'ans-gap';
        gap.setAttribute('role', 'presentation');
        box.appendChild(gap);
      }
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'listitem');
      row.style.setProperty('--i', i);
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'pill' + (state ? ' ' + state : '');
      vv.textContent = v;
      row.append(kk, vv);
      box.appendChild(row);
    });
  }

  /* -- Icons ---------------------------------------------------------
     Drawn, not emoji. Emoji render differently on every platform, carry
     their own colour, and cannot be tinted to match the text they sit
     beside. One 24px grid, one stroke weight, so the chips read as a
     set. The animal emoji stay - those are content, not iconography.
     The path data itself lives in render-data.js now, shared with the
     server-side bake. */

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '1.75');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  /* -- At a glance ---------------------------------------------------
     The details that are nice to have but nobody scans for first, so
     they sit below the answers as loose chips rather than in the list. */

  function renderGlance(a) {
    const box = el('glance');
    box.innerHTML = '';

    const { appearance, behaviour } = glanceGroups(a);

    function renderChip(ic, key, value, i) {
      const c = document.createElement('div');
      c.className = 'gchip';
      c.setAttribute('role', 'listitem');
      c.style.setProperty('--i', i);
      c.appendChild(icon(ic));
      if (key) {
        const k = document.createElement('span');
        k.className = 'gk';
        k.textContent = key;
        c.appendChild(k);
      }
      const v = document.createElement('b');
      v.textContent = value;
      c.appendChild(v);
      box.appendChild(c);
    }

    let i = 0;
    appearance.forEach(([ic, key, value]) => renderChip(ic, key, value, i++));
    const gap = document.createElement('div');
    gap.className = 'glance-gap';
    gap.setAttribute('role', 'presentation');
    box.appendChild(gap);
    behaviour.forEach(([ic, key, value]) => renderChip(ic, key, value, i++));
  }

  // Real <a href> elements so a crawler can follow them and a middle-click
  // opens a new tab, same reasoning as every other link on this page.
  // preventDefault only stops the full-page navigation; it never stops
  // the click from bubbling, so the document-level sound listener still
  // fires on these without a call here needing to repeat it.
  function renderRelated(a) {
    const box = el('related');
    box.innerHTML = '';
    const rel = window.Related ? Related.relatedFor(a, ANIMALS) : [];
    for (const b of rel) {
      const slug = slugify(b.n);
      const link = document.createElement('a');
      link.className = 'related-item';
      link.href = '/animals/' + slug;
      const em = document.createElement('span');
      em.className = 'r-emoji';
      em.setAttribute('aria-hidden', 'true');
      em.textContent = b.e || '🐾';
      const nm = document.createElement('span');
      nm.textContent = b.n;
      link.append(em, nm);
      link.addEventListener('click', (e) => {
        e.preventDefault();
        show({ a: b, slug: slug });
      });
      box.appendChild(link);
    }
  }

  /* -- Wikipedia + Commons -------------------------------------------
     The summary gives the one-line blurb and names the article's lead
     image; Commons then gives that image's author, licence and a sized
     rendition (photo-credit.js), because the licence requires the credit
     wherever the photo is shown. Only that one photo is used - the rest
     of an article's pictures (the old media-list gallery) were unvetted,
     and a Lion page once dealt a leopard. Both cached for the session,
     since during a game you flick back and forth between the same few
     animals. */

  const summaryCache = new Map();
  const photoCache = new Map();

  function wikiTitle(a) { return a.w || a.n.replace(/ /g, '_'); }

  function loadSummary(a) {
    const title = wikiTitle(a);
    if (summaryCache.has(title)) return summaryCache.get(title);
    const p = fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    summaryCache.set(title, p);
    return p;
  }

  // The licensed photo for an animal, or null (no Commons file, a
  // non-free one, offline). Resolves to { src, width, height, credit... }.
  function loadPhoto(a) {
    const title = wikiTitle(a);
    if (photoCache.has(title)) return photoCache.get(title);
    const p = loadSummary(a).then((data) => {
      const img = data && (data.originalimage || data.thumbnail);
      const file = img && window.PhotoCredit && PhotoCredit.fileTitleFromUrl(img.source);
      if (!file) return null;
      return fetch(PhotoCredit.apiUrl(file))
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => PhotoCredit.fromApi(j));
    }).catch(() => null);
    photoCache.set(title, p);
    return p;
  }

  /* -- Motion --------------------------------------------------------
     One authored moment: the card arriving. Everything below it follows
     in a short, capped sequence, and that is the whole page-level story.
     Nothing here hides content - the CSS animations run off a resting
     state that is already visible, so if this never executes the page is
     simply static rather than blank. */

  function play(node, cls, delay) {
    if (!node) return;
    node.classList.remove('anim-rise', 'anim-deal');
    void node.offsetWidth;                     // restart, not resume
    node.style.animationDelay = (delay || 0) + 'ms';
    node.classList.add(cls);
  }

  function stagger(node, base) {
    if (!node) return;
    node.classList.remove('stagger');
    void node.offsetWidth;
    node.style.setProperty('--base', base + 'ms');
    node.classList.add('stagger');
  }

  /* The splash paw can be stamped again by tapping it. The fall, the
     squash, the ring, the dust and the letters it throws are all
     declared in CSS and play by themselves on load, so this only has
     to take those animations away and hand them straight back - one
     frame without them restarts every one of them together, still in
     step. Nothing here is needed for the stamp to play the first
     time; with this file gone the splash still lands correctly. */
  const markStage = el('markStage');
  if (markStage) {
    markStage.addEventListener('click', () => {
      const box = markStage.closest('.home-in');
      if (!box) return;
      box.classList.add('restamp');
      void box.offsetWidth;                    // restart, not resume
      box.classList.remove('restamp');
      sfx('tap');
    });
  }

  // Kept short on purpose. This is a screen you came to read, not a
  // title sequence, so everything has landed inside a second.
  function playEntrance() {
    play(el('hero'), 'anim-deal', 0);
    play(el('blurb'), 'anim-rise', 110);
    const labels = document.querySelectorAll('.feed .label');
    play(labels[0], 'anim-rise', 165);
    stagger(el('answers'), 200);
    play(labels[1], 'anim-rise', 300);
    stagger(el('glance'), 330);
    play(labels[2], 'anim-rise', 390);
    play(document.querySelector('.factcard'), 'anim-rise', 420);
  }

  /* -- Views ---------------------------------------------------------
     One search unit, moved between the hero and the top bar, so there is
     only ever one input and one set of handlers to keep in step. */

  let current = null;

  function dock(where) {
    const unit = el('searchunit');
    const target = el(where === 'top' ? 'dockTop' : 'dockHome');
    if (unit.parentNode !== target) target.appendChild(unit);
  }

  function goHome(opts) {
    current = null;
    document.body.className = 'view-home';
    el('animalview').hidden = true;
    el('mysteryview').hidden = true;
    el('partyview').hidden = true;
    el('home').hidden = false;
    dock('home');
    el('q').value = '';
    results = [];
    renderSuggest();
    el('noresult').hidden = true;
    renderQuickPicks();
    document.title = 'Guess My Animal — the animal cheat sheet';
    if (!opts || !opts.noPush) push('/');
    syncThemeColour();
    window.scrollTo(0, 0);
  }

  function push(url) {
    try { history.pushState(null, '', url); }
    catch (err) { /* file:// and some webviews refuse; harmless */ }
  }

  function show(entry, opts) {
    const a = entry.a;
    current = entry;
    recordRecent(entry);

    document.body.className = 'view-animal';
    el('home').hidden = true;
    el('mysteryview').hidden = true;
    el('partyview').hidden = true;
    el('animalview').hidden = false;
    dock('top');
    el('copied').textContent = '';
    el('noresult').hidden = true;

    el('name').textContent = a.n;
    el('emoji').textContent = a.e || '';
    el('kicker').textContent = a.c + ' · ' + a.r[0];
    el('blurb').textContent = '';
    el('fact').textContent = a.f;
    el('wiki').href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(wikiTitle(a));
    renderAnswers(a);
    renderGlance(a);
    renderRelated(a);

    const hero = el('hero');
    const photo = el('photo');

    // The blurb is Wikipedia's own words, so it says so - a link to the
    // article it's quoted from, not an unattributed sentence.
    el('blurb').textContent = '';
    loadSummary(a).then((data) => {
      if (current !== entry || !data || !data.extract) return;
      const src = document.createElement('a');
      src.className = 'blurb-src';
      src.href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(wikiTitle(a));
      src.target = '_blank';
      src.rel = 'noopener';
      src.textContent = 'Wikipedia';
      el('blurb').append(firstSentence(data.extract) + ' ', '(', src, ')');
    });

    // First load of a server-rendered page: the photo and its credit are
    // already in the HTML (functions/_shared/animal-page.js, from
    // tools/photos.json) - keep them rather than blanking the card and
    // asking again. Consumed once; every later navigation looks up live.
    if (photo.dataset.ssr === entry.slug) {
      delete photo.dataset.ssr;
    } else {
      // Reset before the request, or the previous animal's photo sits
      // there looking like this animal until the new one lands.
      hero.classList.remove('has-photo');
      hero.classList.add('is-loading');
      el('photoFallbackEmoji').textContent = a.e || '🐾';
      el('photoFallbackNote').textContent = '';
      el('photoCredit').innerHTML = '';
      photo.alt = '';
      photo.src = BLANK;
      el('photoBg').src = BLANK;

      loadPhoto(a).then((p) => {
        if (current !== entry) return;          // they typed something else
        hero.classList.remove('is-loading');
        if (!p) {
          // The emoji is the true resting state, not a still-loading one -
          // and it says so, for anyone who can't tell resting from loading
          // by the animation alone (a glance, or prefers-reduced-motion).
          el('photoFallbackNote').textContent = 'No photo on file';
          return;
        }
        photo.onerror = () => { photo.onerror = null; hero.classList.remove('has-photo'); };
        photo.alt = a.n;
        photo.src = p.src;
        el('photoBg').src = p.src;
        el('photoCredit').innerHTML = PhotoCredit.creditHtml(p);
        hero.classList.add('has-photo');
      });
    }

    if (!opts || !opts.noPush) push('/animals/' + entry.slug);
    // Matches the title functions/index.js bakes server-side for this
    // same animal (tools/build-seo.js), so the tab title doesn't visibly
    // change out from under someone the moment JS finishes loading.
    document.title = a.n + ' — is it dangerous? | Guess My Animal';
    window.scrollTo(0, 0);
    syncThemeColour();
    playEntrance();
  }

  function firstSentence(text) {
    const m = String(text).match(/^.*?[.!?](\s|$)/);
    const s = (m ? m[0] : text).trim();
    return s.length > 190 ? s.slice(0, 187).trim() + '…' : s;
  }

  /* -- Suggestions --------------------------------------------------- */

  let results = [];
  let cursor = -1;

  function renderSuggest() {
    const ul = el('suggest');
    ul.innerHTML = '';
    if (!results.length) {
      ul.hidden = true;
      el('q').setAttribute('aria-expanded', 'false');
      return;
    }
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
      // Show why a search for "puma" matched "Cougar".
      const typed = norm(el('q').value);
      const alias = (entry.a.a || []).find((x) => norm(x).startsWith(typed));
      if (alias && !norm(entry.a.n).startsWith(typed)) {
        const al = document.createElement('span');
        al.className = 's-alias';
        al.textContent = '· ' + alias;
        li.appendChild(al);
      }
      li.addEventListener('mousedown', (e) => { e.preventDefault(); sfx('tap'); pick(entry); });
      ul.appendChild(li);
    });
    ul.hidden = false;
    el('q').setAttribute('aria-expanded', 'true');
  }

  function pick(entry) {
    // Deliberately silent. Two of its four callers (the dice, a starter
    // chip) are real buttons the delegated listener has already sounded,
    // so a call here would double them up; the other two sound
    // themselves, below, because the listener can't reach them.
    // Left in, not cleared: it's the confirmation of what got picked, and
    // selecting on next focus (below) means the next lookup still starts
    // with a single keystroke rather than a delete-then-type.
    el('q').value = entry.a.n;
    el('q').blur();
    results = [];
    cursor = -1;
    renderSuggest();
    show(entry);
  }

  el('q').addEventListener('focus', () => el('q').select());

  el('q').addEventListener('input', () => {
    results = search(el('q').value, 8);
    cursor = results.length ? 0 : -1;
    renderSuggest();
    if (el('q').value.trim() && !results.length) {
      el('noresult').hidden = false;
      el('noresult').textContent = 'No match for "' + el('q').value.trim() +
        '". It might not be in here yet — there are ' + ANIMALS.length + ' so far.';
    } else {
      el('noresult').hidden = true;
    }
  });

  el('q').addEventListener('keydown', (e) => {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = (cursor + 1) % results.length; renderSuggest(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = (cursor - 1 + results.length) % results.length; renderSuggest(); }
    else if (e.key === 'Enter') { e.preventDefault(); sfx('tap'); pick(results[Math.max(cursor, 0)]); }
    else if (e.key === 'Escape') { results = []; renderSuggest(); }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.searchunit')) {
      results = [];
      renderSuggest();
      el('noresult').hidden = true;
    }
  });

  /* -- Starters, dice, back, copy ------------------------------------ */

  const STARTERS = ['Octopus', 'Platypus', 'Axolotl', 'Pangolin'];

  // Whoever picked the animal knows it; it's everyone else who reaches for
  // this. During one game the same handful of animals come back up as the
  // questions narrow down, so the second time is a tap, not a re-type.
  const RECENT_KEY = 'gma-recent';
  const MAX_RECENT = 4;

  function readRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return raw
        .map((name) => INDEX.find((x) => x.a.n === name))
        .filter(Boolean)
        .slice(0, MAX_RECENT);
    } catch (err) { return []; }
  }

  function recordRecent(entry) {
    try {
      const names = readRecent().map((x) => x.a.n).filter((n) => n !== entry.a.n);
      names.unshift(entry.a.n);
      localStorage.setItem(RECENT_KEY, JSON.stringify(names.slice(0, MAX_RECENT)));
    } catch (err) { /* private mode or storage full - the chips just don't persist */ }
  }

  function renderQuickPicks() {
    const box = el('starterChips');
    box.innerHTML = '';
    const recent = readRecent();
    const list = recent.length ? recent : STARTERS.map((name) => INDEX.find((x) => x.a.n === name)).filter(Boolean);
    el('startersLabel').textContent = recent.length ? 'jump back in' : 'or try one of these';
    for (const entry of list) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = (entry.a.e || '') + ' ' + entry.a.n;
      b.addEventListener('click', () => pick(entry));
      box.appendChild(b);
    }
  }

  function rollDice() {
    let next = INDEX[Math.floor(Math.random() * INDEX.length)];
    if (current && INDEX.length > 1) {
      while (next === current) next = INDEX[Math.floor(Math.random() * INDEX.length)];
    }
    pick(next);
  }

  // animationend cleans up the class itself rather than a setTimeout tied
  // to the CSS duration, so the two can never drift out of sync. The
  // reflow-forcing remove/re-add lets a mashed dice button restart the
  // roll every time instead of only animating on the first of a burst.
  const diceBtn = el('random');
  diceBtn.addEventListener('animationend', () => diceBtn.classList.remove('rolling'));
  diceBtn.addEventListener('click', () => {
    diceBtn.classList.remove('rolling');
    void diceBtn.offsetWidth;
    diceBtn.classList.add('rolling');
    rollDice();
  });
  el('another').addEventListener('click', rollDice);
  el('back').addEventListener('click', () => goHome());

  /* -- Sharing -------------------------------------------------------
     The whole point of this site is telling someone about it, and a bare
     "copy link" is the weakest possible version of that. */

  const share = el('share'), shareBtn = el('shareBtn'), sharePanel = el('sharePanel');

  function shareText() {
    return current
      ? current.a.n + ' on Guess My Animal, the cheat sheet for the animal guessing game.'
      : 'Guess My Animal, the cheat sheet for the animal guessing game.';
  }

  function setShare(open) {
    sharePanel.hidden = !open;
    shareBtn.setAttribute('aria-expanded', String(open));
    if (!open) return;
    const url = location.href;
    const text = shareText();
    el('shareWa').href = 'https://wa.me/?text=' + encodeURIComponent(text + ' ' + url);
    el('shareX').href = 'https://twitter.com/intent/tweet?text=' +
      encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    el('shareFb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  }

  // A touch device gets the real share sheet, which already reaches
  // WhatsApp and everything else. A desktop gets the panel instead:
  // navigator.share is often missing there, and on Windows it has a habit
  // of dropping the url field and sharing the text on its own.
  const canShareNatively = () =>
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  shareBtn.addEventListener('click', async (e) => {
    e.stopPropagation();   // same reason as the menu button: sounds itself
    sfx('tap');
    if (canShareNatively()) {
      try {
        await navigator.share({ title: 'Guess My Animal', text: shareText(), url: location.href });
      } catch (err) { /* dismissed, which is not an error */ }
      return;
    }
    setShare(sharePanel.hidden);
  });

  el('shareCopy').addEventListener('click', async () => {
    setShare(false);
    try {
      await navigator.clipboard.writeText(location.href);
      el('copied').textContent = 'Link copied.';
    } catch (err) {
      el('copied').textContent = "Couldn't copy — the link is in the address bar.";
    }
  });

  for (const a of [el('shareWa'), el('shareX'), el('shareFb')]) {
    a.addEventListener('click', () => setShare(false));
  }
  document.addEventListener('click', (e) => {
    if (!share.contains(e.target)) setShare(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !sharePanel.hidden) { setShare(false); shareBtn.focus(); }
  });

  /* -- Appearance ----------------------------------------------------
     Three states, not two. "Follow the system" is the right default and
     dropping it would be a downgrade for anyone who set it once. The
     saved choice is applied by a tiny inline script in the head, before
     the stylesheet paints, so dark never flashes light first. */

  const THEME_KEY = 'gma-theme';
  const themeMeta = document.querySelector('meta[name="theme-color"]');

  function readTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY);
      return v === 'dark' || v === 'light' ? v : 'system';
    } catch (err) { return 'system'; }
  }

  // Browser chrome should match whichever surface is actually on screen,
  // and the splash and the feed are different colours.
  function syncThemeColour() {
    if (!themeMeta) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    if (bg) themeMeta.setAttribute('content', bg);
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

  /* -- Menu ---------------------------------------------------------- */

  const menu = el('menu'), menuBtn = el('menuBtn'), menuPanel = el('menuPanel');

  function setMenu(open) {
    menuPanel.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) {   // one panel at a time
      results = []; renderSuggest(); setShare(false);
      document.dispatchEvent(new CustomEvent('gma:menu-open'));   // see navsearch.js
    }
  }
  document.addEventListener('gma:search-open', () => setMenu(false));

  menuBtn.addEventListener('click', (e) => {
    // stopPropagation here keeps the click-outside-to-close handler below
    // from immediately undoing this one - which also puts it out of reach
    // of the delegated sound listener, so it sounds itself.
    e.stopPropagation();
    sfx('tap');
    setMenu(menuPanel.hidden);
  });
  document.addEventListener('click', (e) => {
    if (!menu.contains(e.target)) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menuPanel.hidden) { setMenu(false); menuBtn.focus(); }
  });

  /* -- Reporting a problem -------------------------------------------
     A native <dialog>, so focus trapping, Escape and the backdrop come
     from the browser instead of being rebuilt badly. The animal being
     looked at is attached automatically, because "the photo is wrong"
     is useless without knowing which photo. */

  const dlg = el('reportDlg');
  let openedAt = 0;
  let reportAnimal = '';

  // opts lets a caller outside this view (mystery.js, for its own report
  // trigger) override what gets attached and shown, since `current` only
  // ever tracks the animal-page's own state. Plain [data-report] buttons
  // call this with no args and keep the original current-based behaviour.
  function openReport(opts) {
    setMenu(false);
    const status = el('reportStatus');
    status.textContent = '';
    status.className = 'dlg-status';
    el('reportMsg').value = '';
    el('reportHp').value = '';
    el('reportSend').disabled = false;
    reportAnimal = opts && opts.animal !== undefined ? opts.animal : (current ? current.a.n : '');
    el('reportCtx').textContent = opts && opts.label !== undefined
      ? opts.label
      : (current ? 'About ' + current.a.n + '.' : '');
    // Guess the likely complaint from where they were: on an animal it is
    // usually the picture, from the splash it is usually a missing animal.
    const want = (opts && opts.wantKind) || (current ? 'photo' : 'missing');
    const radio = dlg.querySelector('input[name="kind"][value="' + want + '"]');
    if (radio) radio.checked = true;
    openedAt = Date.now();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  for (const b of document.querySelectorAll('[data-report]')) {
    b.addEventListener('click', openReport);
  }
  // The site footer is shared by every view, so its Report can't just be
  // [data-report]: inside Mystery it has to hand off to Mystery's own
  // report button, which attaches the round's animal without showing it.
  const footerReport = el('footerReport');
  if (footerReport) {
    footerReport.addEventListener('click', () => {
      const mysteryReport = el('mysteryReport');
      if (!el('mysteryview').hidden && mysteryReport) mysteryReport.click();
      else openReport();
    });
  }
  el('reportCancel').addEventListener('click', () => dlg.close());

  el('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = el('reportStatus');
    const message = el('reportMsg').value.trim();

    if (message.length < 3) {
      status.textContent = 'Please say a little more about what is wrong.';
      status.className = 'dlg-status err';
      el('reportMsg').focus();
      return;
    }

    el('reportSend').disabled = true;
    status.textContent = 'Sending…';
    status.className = 'dlg-status';

    const picked = dlg.querySelector('input[name="kind"]:checked');
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          animal: reportAnimal,
          kind: picked ? picked.value : 'other',
          message: message,
          dwell: Date.now() - openedAt,
          website: el('reportHp').value,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      status.textContent = 'Thanks — we\'ll take a look.';
      status.className = 'dlg-status ok';
      setTimeout(() => { if (dlg.open) dlg.close(); }, 1100);
    } catch (err) {
      status.textContent = "That did not send — what you wrote is still here, try again in a moment.";
      status.className = 'dlg-status err';
      el('reportSend').disabled = false;
    }
  });

  /* -- Routing -------------------------------------------------------
     /?a=octopus opens straight on that animal, and the phone's back
     button steps back through what you looked up rather than leaving
     the site from the middle of a game. */

  function routeFromURL() {
    let url;
    try { url = new URL(location.href); }
    catch (err) { goHome({ noPush: true }); return; }

    if (url.searchParams.get('mystery')) {
      if (typeof window.openMystery === 'function') { window.openMystery({ noPush: true }); return; }
      // mystery.js loads before app.js, so this only fires if it failed
      // to load at all - fall through to home rather than show nothing.
    }

    // ?party=CODE is what a party's QR code and join link point at, so a
    // real room code opens the player view directly - whoever followed
    // it is joining a party someone else is already running. Anything
    // else (?party=1, the static pages' menu entry) opens the host
    // controls instead.
    const partyCode = url.searchParams.get('party');
    if (partyCode) {
      if (/^[A-Za-z0-9]{4,6}$/.test(partyCode) && typeof window.openPartyPlayer === 'function') {
        window.openPartyPlayer(partyCode, { noPush: true });
        return;
      }
      if (typeof window.openPartyHost === 'function') { window.openPartyHost(); return; }
    }

    // ?report=1 is the corner menu's own entry point from the static
    // pages (about/browse/privacy), which have no menu or report
    // dialog of their own to open directly - see menu.js.
    if (url.searchParams.get('report')) { openReport(); return; }

    // /animals/<slug> is the real address. The old /?a=<slug> still works
    // here too, even though the server 301s it: the service worker's
    // offline fallback serves the cached shell for *any* navigation,
    // so an old link opened offline arrives with the query intact - it's
    // quietly rewritten to the real address rather than left on it.
    const path = url.pathname.match(/^\/animals\/([^/]+)\/?$/);
    const legacy = url.searchParams.get('a');
    const wanted = path ? decodeURIComponent(path[1]) : legacy;
    if (wanted) {
      const entry = INDEX.find((x) => x.slug === slugify(wanted));
      if (entry) {
        show(entry, { noPush: true });
        if (legacy || path[1] !== entry.slug) {
          try { history.replaceState(null, '', '/animals/' + entry.slug); } catch (err) { /* harmless */ }
        }
        return;
      }
    }
    goHome({ noPush: true });
  }

  window.addEventListener('popstate', routeFromURL);

  // Deliberately small: the things mystery.js (a separate view that
  // still needs to feel like part of the same app) needs back from the
  // routing/view state this file owns.
  // The site bar's Search (navsearch.js) opens an animal through this
  // rather than a page load, the same in-place show() the home search
  // uses. Returns false so the caller falls back to a real navigation for
  // an unknown slug, or from inside Mystery/Party - those views own
  // timers and a poll loop that only their own back buttons tear down,
  // and a full page load is the one exit guaranteed to stop them.
  function openSlug(slug) {
    if (!el('mysteryview').hidden || !el('partyview').hidden) return false;
    const entry = INDEX.find((x) => x.slug === slug);
    if (!entry) return false;
    show(entry);
    return true;
  }

  window.GMA = { goHome, push, setMenu, loadSummary, dock, openReport, sfx, openSlug };

  /* -- Boot ---------------------------------------------------------- */

  applyTheme(readTheme());
  el('count').textContent = ANIMALS.length + ' animals and counting';
  renderQuickPicks();
  routeFromURL();

  // The about page links here with ?report=1. Drop the parameter once the
  // dialog is up so a refresh does not reopen it.
  try {
    const url = new URL(location.href);
    if (url.searchParams.get('report')) {
      url.searchParams.delete('report');
      history.replaceState(null, '', url.pathname + url.search);
      openReport();
    }
  } catch (err) { /* no URL API worth worrying about */ }
})();
