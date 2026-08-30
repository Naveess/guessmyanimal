(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  // Transparent 1x1. An <img> with no src at all is a broken-image icon.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* -- Searching -----------------------------------------------------
     Typo tolerance matters more than cleverness here: people type this
     one-handed, mid-conversation, and "gorila" or "hipo" should still
     land. Prefix beats substring, and a name beats an alias, so the
     obvious answer sits at the top rather than an alphabetical one. */

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const slugify = (s) => norm(s).replace(/ /g, '-');

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

  function search(raw, limit) {
    const q = norm(raw);
    if (!q) return [];
    return INDEX
      .map((e) => ({ e, s: score(e, q) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s || x.e.a.n.length - y.e.a.n.length)
      .slice(0, limit || 8)
      .map((r) => r.e);
  }

  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  /* -- Quick answers -------------------------------------------------
     Green means yes, plain means no, amber is the honest middle, and red
     is spent on exactly one thing: this animal can hurt you. An earlier
     version painted every "yes" red, which made "Lays eggs? Yes" look
     like a warning and buried the one row that actually is one. */

  const GOOD = 'good', WARN = 'warn', BAD = 'bad', FLAT = '';

  function answers(a) {
    const yn = (b) => [b ? 'Yes' : 'No', b ? GOOD : FLAT];

    const diet =
      a.d === 'Carnivore'   ? ['Yes', GOOD] :
      a.d === 'Omnivore'    ? ['Omnivore', WARN] :
      a.d === 'Insectivore' ? ['Insects only', WARN] :
                              ['No, herbivore', FLAT];

    return [
      ['What is it?', a.c, FLAT],
      ['Carnivore?', diet[0], diet[1]],
      ['Dangerous?',
        a.dg === 'yes' ? 'Yes' : a.dg === 'some' ? 'Can be' : 'No',
        a.dg === 'yes' ? BAD : a.dg === 'some' ? WARN : FLAT],
      ['Awake when?',
        a.ac === 'night' ? 'Night' : a.ac === 'day' ? 'Daytime' : 'Day & night', FLAT],
      ['Hibernates?'].concat(yn(a.h)),
      ['Kept as a pet?',
        a.p === 'common' ? 'Commonly' : a.p === 'some' ? 'Sometimes' : 'No',
        a.p === 'common' ? GOOD : a.p === 'some' ? WARN : FLAT],
      ['Domesticated?'].concat(yn(a.dm)),
      ['Do people eat it?',
        a.et === 'yes' ? 'Yes' : a.et === 'some' ? 'In places' : 'No',
        a.et === 'yes' ? GOOD : a.et === 'some' ? WARN : FLAT],
    ];
  }

  function renderAnswers(a) {
    const box = el('answers');
    box.innerHTML = '';
    for (const [k, v, state] of answers(a)) {
      const row = document.createElement('div');
      row.className = 'row';
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'pill' + (state ? ' ' + state : '');
      vv.textContent = v;
      row.append(kk, vv);
      box.appendChild(row);
    }
  }

  /* -- At a glance ---------------------------------------------------
     The details that are nice to have but nobody scans for first, so
     they sit below the answers as loose chips rather than in the list. */

  function renderGlance(a) {
    const box = el('glance');
    box.innerHTML = '';

    const items = [
      ['🌍', 'Found in', a.r.join(', ')],
      ['🎨', 'Colours', a.co.map(cap).join(', ')],
      ['📏', 'Size', cap(a.sz)],
      // "Lives in Solitary" is not a sentence, so that one gets its own.
      a.so === 'Solitary' ? ['👥', null, 'Lives alone'] : ['👥', 'Lives in', a.so.toLowerCase()],
      ['⏳', 'Lives for', a.lf],
      ['🦵', 'Legs', a.lg === 0 ? 'None' : String(a.lg)],
    ];
    if (a.cv && a.cv !== 'None') items.push(['🧥', 'Covered in', a.cv]);
    if (a.fl) items.push(['🕊️', null, 'Can fly']);
    if (a.sw) items.push(['🌊', null, 'Can swim']);
    if (a.eg) items.push(['🥚', null, 'Lays eggs']);

    for (const [emoji, key, value] of items) {
      const c = document.createElement('div');
      c.className = 'gchip';
      const e = document.createElement('span');
      e.className = 'ge';
      e.setAttribute('aria-hidden', 'true');
      e.textContent = emoji;
      c.appendChild(e);
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
  }

  /* -- Wikipedia -----------------------------------------------------
     Two calls. The summary gives the lead photo and a one-line blurb.
     The media list gives the rest of the article's pictures in document
     order, which matters: asking the images API for them instead returns
     whatever is on the page in no order at all, and a Tiger comes back
     with a jaguar in it. Document order keeps the animal at the top.
     Both cached for the session, because during a game you flick back
     and forth between the same few animals. */

  const summaryCache = new Map();
  const mediaCache = new Map();

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

  // Range maps, IUCN status badges, anatomy diagrams, skeletons and
  // fossils are all in these articles and none of them are a picture of
  // the animal, which is the only thing anyone came here to look at.
  const JUNK_FILE = /(status[_ ]iucn|distribution|range[_ ]map|[_ ]range[_.]|locator|skeleton|skull|fossil|cladogram|phylogen|diagram|schematic|life[-_ ]?cycle|anatomy|_sem[_.]|micrograph|stamp|coat[_ ]of[_ ]arms|logo|icon|\.svg)/i;
  const JUNK_CAPTION = /^(a )?(diagram|map|distribution|range|skeleton|phylogen|cladogram|illustration|drawing|chart)/i;

  function fileOf(url) {
    const m = String(url || '').match(/\/([^/?]+?)(\?|$)/);
    return m ? decodeURIComponent(m[1]).replace(/^\d+px-/, '').toLowerCase() : '';
  }

  // Highest resolution the API actually offers for an image. Never build a
  // URL by hand: rewriting the thumbnail width to something Wikimedia has
  // not generated comes back as an error page, which the browser then
  // blocks outright and the picture silently never appears.
  function bestSrc(item) {
    const set = item.srcset || [];
    const best = set[set.length - 1] || set[0];
    return best && best.src ? best.src.replace(/^\/\//, 'https://') : null;
  }

  function loadMedia(a) {
    const title = wikiTitle(a);
    if (mediaCache.has(title)) return mediaCache.get(title);
    const p = fetch('https://en.wikipedia.org/api/rest_v1/page/media-list/' + encodeURIComponent(title))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j || !j.items) return { lead: null, shots: [] };
        const images = j.items.filter((i) => i.type === 'image' && i.showInGallery !== false);
        const leadItem = images.find((i) => i.leadImage);
        const shots = images
          .filter((i) => !i.leadImage)
          .filter((i) => !JUNK_FILE.test(i.title || ''))
          .filter((i) => !(i.caption && JUNK_CAPTION.test(i.caption.text || '')))
          .map((i) => {
            const src = bestSrc(i);
            return src ? { src, file: fileOf(src), caption: i.caption ? i.caption.text : '' } : null;
          })
          .filter(Boolean);
        return { lead: leadItem ? bestSrc(leadItem) : null, shots };
      })
      .catch(() => ({ lead: null, shots: [] }));  // rate limited or offline: just no extras
    mediaCache.set(title, p);
    return p;
  }

  function renderShot(slot, shot, name) {
    slot.innerHTML = '';
    if (!shot) return;
    const fig = document.createElement('figure');
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = name;
    // If it fails, take the whole figure out rather than leaving a grey box.
    img.onerror = () => { slot.innerHTML = ''; };
    img.src = shot.src;
    fig.appendChild(img);
    if (shot.caption) {
      const cp = document.createElement('figcaption');
      cp.textContent = shot.caption.length > 120
        ? shot.caption.slice(0, 117).trim() + '…'
        : shot.caption;
      fig.appendChild(cp);
    }
    slot.appendChild(fig);
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
    el('home').hidden = false;
    dock('home');
    el('q').value = '';
    results = [];
    renderSuggest();
    el('noresult').hidden = true;
    document.title = 'Guess My Animal — the animal cheat sheet';
    if (!opts || !opts.noPush) push(location.pathname);
    window.scrollTo(0, 0);
  }

  function push(url) {
    try { history.pushState(null, '', url); }
    catch (err) { /* file:// and some webviews refuse; harmless */ }
  }

  function show(entry, opts) {
    const a = entry.a;
    current = entry;

    document.body.className = 'view-animal';
    el('home').hidden = true;
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

    // Reset the pictures before the requests, or the previous animal's
    // photo sits there looking like this animal until the new one lands.
    const hero = el('hero');
    hero.classList.remove('has-photo');
    el('photoFallback').textContent = a.e || '🐾';
    el('photo').alt = '';
    el('photo').src = BLANK;
    el('photoBg').src = BLANK;
    el('shot2').innerHTML = '';
    el('shot3').innerHTML = '';

    let heroFile = '';

    // The summary answers first and carries a small thumbnail, so the card
    // fills straight away and the sharper lead image swaps in behind the
    // scenes when the media list lands a moment later.
    function setHero(src) {
      if (!src) return;
      heroFile = fileOf(src);
      const img = el('photo');
      img.onerror = () => { img.onerror = null; hero.classList.remove('has-photo'); };
      img.alt = a.n;
      img.src = src;
      el('photoBg').src = src;
      hero.classList.add('has-photo');
    }

    loadSummary(a).then((data) => {
      if (current !== entry) return;          // they typed something else
      if (data && data.thumbnail && data.thumbnail.source) setHero(data.thumbnail.source);
      if (data && data.extract) el('blurb').textContent = firstSentence(data.extract);
    });

    loadMedia(a).then((media) => {
      if (current !== entry) return;
      if (media.lead) setHero(media.lead);
      const usable = media.shots.filter((s) => s.file && s.file !== heroFile);
      renderShot(el('shot2'), usable[0], a.n);
      renderShot(el('shot3'), usable[1], a.n);
    });

    if (!opts || !opts.noPush) push('?a=' + entry.slug);
    document.title = a.n + ' — Guess My Animal';
    window.scrollTo(0, 0);
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
      li.addEventListener('mousedown', (e) => { e.preventDefault(); pick(entry); });
      ul.appendChild(li);
    });
    ul.hidden = false;
    el('q').setAttribute('aria-expanded', 'true');
  }

  function pick(entry) {
    el('q').value = '';
    el('q').blur();
    results = [];
    cursor = -1;
    renderSuggest();
    show(entry);
  }

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
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[Math.max(cursor, 0)]); }
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

  const STARTERS = ['Octopus', 'Sloth', 'Platypus', 'Axolotl', 'Hyena', 'Pangolin'];

  function renderStarters() {
    const box = el('starterChips');
    for (const name of STARTERS) {
      const entry = INDEX.find((x) => x.a.n === name);
      if (!entry) continue;
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

  el('random').addEventListener('click', rollDice);
  el('another').addEventListener('click', rollDice);
  el('back').addEventListener('click', () => goHome());

  el('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      el('copied').textContent = 'Link copied.';
    } catch (err) {
      el('copied').textContent = "Couldn't copy — the link is in the address bar.";
    }
  });

  /* -- Routing -------------------------------------------------------
     /?a=octopus opens straight on that animal, and the phone's back
     button steps back through what you looked up rather than leaving
     the site from the middle of a game. */

  function routeFromURL() {
    let wanted = null;
    try { wanted = new URL(location.href).searchParams.get('a'); }
    catch (err) { /* no URL API worth worrying about */ }
    if (wanted) {
      const entry = INDEX.find((x) => x.slug === slugify(wanted));
      if (entry) { show(entry, { noPush: true }); return; }
    }
    goHome({ noPush: true });
  }

  window.addEventListener('popstate', routeFromURL);

  /* -- Boot ---------------------------------------------------------- */

  el('count').textContent = ANIMALS.length + ' animals and counting';
  renderStarters();
  routeFromURL();
})();
