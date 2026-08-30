(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  /* -- Searching -----------------------------------------------------
     Typo tolerance matters more than cleverness here: people type this
     one-handed, mid-conversation, and "gorila" or "hipo" should still
     land. Prefix beats substring, and a name beats an alias, so the
     obvious answer sits at the top rather than an alphabetical one. */

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  const INDEX = ANIMALS.map((a, i) => ({
    a,
    i,
    slug: norm(a.n).replace(/ /g, '-'),
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

  /* -- Turning data into answers -------------------------------------
     Every tile says the answer in words. Colour is layered on top for
     the two that carry a warning, never used as the only signal. */

  /* Green means yes, plain means no, and coral is spent on exactly one
     thing: this animal can hurt you. The first version painted every
     "yes" coral, which made "Lays eggs? Yes" and "Can it swim? Yes"
     look like warnings and buried the one tile that is actually a
     warning. Amber sits in between for "can be". */
  const YES = 'yes', PLAIN = '', DANGER = 'danger', MAYBE = 'maybe';

  function tiles(a) {
    return [
      ['Class', a.c, PLAIN],
      ['Diet', a.d, PLAIN],
      ['Dangerous?',
        a.dg === 'yes' ? 'Yes' : a.dg === 'some' ? 'Can be' : 'No',
        a.dg === 'yes' ? DANGER : a.dg === 'some' ? MAYBE : PLAIN],
      ['Active',
        a.ac === 'night' ? 'Night' : a.ac === 'day' ? 'Daytime' : 'Day & night', PLAIN],
      ['Hibernates?', a.h ? 'Yes' : 'No', a.h ? YES : PLAIN],
      ['Kept as a pet?',
        a.p === 'common' ? 'Commonly' : a.p === 'some' ? 'Sometimes' : 'No',
        a.p === 'common' ? YES : a.p === 'some' ? MAYBE : PLAIN],
      ['Domesticated?', a.dm ? 'Yes' : 'No', a.dm ? YES : PLAIN],
      ['Do people eat it?',
        a.et === 'yes' ? 'Yes' : a.et === 'some' ? 'In places' : 'No',
        a.et === 'yes' ? YES : a.et === 'some' ? MAYBE : PLAIN],
      ['Covering', a.cv, PLAIN],
      ['Legs', a.lg === 0 ? 'None' : String(a.lg), PLAIN],
      ['Can it fly?', a.fl ? 'Yes' : 'No', a.fl ? YES : PLAIN],
      ['Can it swim?', a.sw ? 'Yes' : 'No', a.sw ? YES : PLAIN],
      ['Lays eggs?', a.eg ? 'Yes' : 'No', a.eg ? YES : PLAIN],
      ['Size', cap(a.sz), PLAIN],
      ['Lives', a.so, PLAIN],
      ['Lifespan', a.lf, PLAIN],
    ];
  }

  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  function renderTiles(a) {
    const box = el('answers');
    box.innerHTML = '';
    for (const [k, v, state] of tiles(a)) {
      const d = document.createElement('div');
      d.className = 'tile' + (state ? ' ' + state : '');
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'v';
      vv.textContent = v;
      d.append(kk, vv);
      box.appendChild(d);
    }
    // The two long ones span the row rather than wrapping to three lines.
    for (const [k, v] of [['Found in', a.r.join(', ')], ['Colours', a.co.map(cap).join(', ')]]) {
      const d = document.createElement('div');
      d.className = 'tile wide';
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'v';
      vv.textContent = v;
      d.append(kk, vv);
      box.appendChild(d);
    }
  }

  /* -- Wikipedia -----------------------------------------------------
     Photo and a one-line summary. Free, no key, CORS-open. Cached in
     memory for the session because during a game you flick back and
     forth between the same few animals. */

  const wikiCache = new Map();

  async function loadWiki(a) {
    const title = a.w || a.n.replace(/ /g, '_');
    if (wikiCache.has(title)) return wikiCache.get(title);
    const p = fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    wikiCache.set(title, p);
    return p;
  }

  /* -- Showing an animal --------------------------------------------- */

  let current = null;

  function show(entry, opts) {
    const a = entry.a;
    current = entry;

    el('starters').hidden = true;
    el('noresult').hidden = true;
    el('sheet').hidden = false;
    el('copied').textContent = '';

    el('name').textContent = a.n;
    el('emoji').textContent = a.e || '';
    el('blurb').textContent = '';
    el('fact').textContent = a.f;
    el('wiki').href = 'https://en.wikipedia.org/wiki/' + encodeURIComponent(a.w || a.n.replace(/ /g, '_'));
    renderTiles(a);

    // Reset the photo before the request, or the previous animal's picture
    // sits there looking like this animal until the new one arrives.
    const wrap = document.querySelector('.photo-wrap');
    wrap.classList.remove('has-photo');
    el('photoFallback').textContent = a.e || '🐾';
    el('photo').alt = '';

    loadWiki(a).then((data) => {
      if (current !== entry) return;          // they typed something else
      if (data && data.thumbnail && data.thumbnail.source) {
        const small = data.thumbnail.source;
        // Wikimedia only serves widths it can produce, and refuses to
        // upscale: asking for 640px of an image whose original is 500px
        // wide returns a 400 and a blank box. Clamp to what exists.
        const originalWidth = (data.originalimage && data.originalimage.width) || 0;
        const want = Math.min(640, originalWidth);
        const big = want >= 320 ? small.replace(/\/\d+px-/, '/' + want + 'px-') : small;

        const img = el('photo');
        // If the larger crop fails for any reason, drop back to the size the
        // API actually handed us before giving up and showing the emoji.
        img.onerror = () => {
          if (img.src !== small) { img.src = small; return; }
          img.onerror = null;
          wrap.classList.remove('has-photo');
        };
        img.alt = a.n;
        img.src = big;
        wrap.classList.add('has-photo');
      }
      if (data && data.extract) {
        el('blurb').textContent = firstSentence(data.extract);
      }
    });

    const slug = entry.slug;
    if (!opts || !opts.silent) {
      try {
        const url = new URL(location.href);
        url.searchParams.set('a', slug);
        history.replaceState(null, '', url);
      } catch (err) { /* file:// and some webviews refuse; harmless */ }
    }
    document.title = a.n + ' — Guess My Animal';
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    if (!e.target.closest('.searchbar')) { results = []; renderSuggest(); }
  });

  /* -- Starters, dice, copy ------------------------------------------ */

  const STARTERS = ['Octopus', 'Sloth', 'Platypus', 'Axolotl', 'Hyena', 'Pangolin', 'Mosquito', 'Seahorse'];

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

  el('random').addEventListener('click', () => {
    let next = INDEX[Math.floor(Math.random() * INDEX.length)];
    if (current && INDEX.length > 1) {
      while (next === current) next = INDEX[Math.floor(Math.random() * INDEX.length)];
    }
    pick(next);
  });

  el('copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      el('copied').textContent = 'Link copied.';
    } catch (err) {
      el('copied').textContent = "Couldn't copy — the link is in the address bar.";
    }
  });

  /* -- Boot ---------------------------------------------------------- */

  el('count').textContent = ANIMALS.length + ' animals and counting.';
  renderStarters();

  // Deep link: /?a=octopus opens straight on that animal.
  try {
    const wanted = new URL(location.href).searchParams.get('a');
    if (wanted) {
      const entry = INDEX.find((x) => x.slug === norm(wanted).replace(/ /g, '-'));
      if (entry) show(entry, { silent: true });
    }
  } catch (err) { /* no URL API worth worrying about */ }
})();
