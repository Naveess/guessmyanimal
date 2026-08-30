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
    answers(a).forEach(([k, v, state], i) => {
      const row = document.createElement('div');
      row.className = 'row';
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
     set. The animal emoji stay - those are content, not iconography. */

  const ICONS = {
    globe: '<circle cx="12" cy="12" r="8.6"/><path d="M3.4 12h17.2"/><path d="M12 3.4c2.5 2.9 2.5 14.3 0 17.2M12 3.4c-2.5 2.9-2.5 14.3 0 17.2"/>',
    drop:  '<path d="M12 3.6c3.1 3.6 5.3 6.2 5.3 8.9a5.3 5.3 0 0 1-10.6 0c0-2.7 2.2-5.3 5.3-8.9Z"/>',
    ruler: '<path d="M3.4 12h17.2"/><path d="M6.4 8.6v6.8M17.6 8.6v6.8"/>',
    group: '<circle cx="9.2" cy="8.8" r="3.1"/><path d="M3.6 19a5.6 5.6 0 0 1 11.2 0"/><path d="M16.2 6.4a3 3 0 0 1 0 5.6M17.8 19a5.7 5.7 0 0 0-1.6-4"/>',
    clock: '<circle cx="12" cy="12" r="8.6"/><path d="M12 6.9v5.4l3.4 2"/>',
    leg:   '<path d="M8.2 3.8v6.4c0 1.4.5 2.2 1.6 3l4.3 3.1c1.1.8 1.7 1.6 1.7 3v.9"/><path d="M5.8 3.8h4.8M13.6 20.2h4.4"/>',
    coat:  '<path d="M3.6 9.2c2.4 0 2.4-2.9 4.8-2.9s2.4 2.9 4.8 2.9 2.4-2.9 4.8-2.9 2.4 2.9 3.4 2.9"/><path d="M3.6 15.6c2.4 0 2.4-2.9 4.8-2.9s2.4 2.9 4.8 2.9 2.4-2.9 4.8-2.9 2.4 2.9 3.4 2.9"/>',
    wing:  '<path d="M20.4 4.2c-9.3 0-15.6 4.8-15.6 11 0 2.6 1.5 4.2 3.8 4.2 5.6 0 10-5.9 11.8-15.2Z"/>',
    wave:  '<path d="M2.8 8.4c2.3 0 2.3 2.1 4.6 2.1s2.3-2.1 4.6-2.1 2.3 2.1 4.6 2.1 2.3-2.1 4.6-2.1"/><path d="M2.8 14.8c2.3 0 2.3 2.1 4.6 2.1s2.3-2.1 4.6-2.1 2.3 2.1 4.6 2.1 2.3-2.1 4.6-2.1"/>',
    egg:   '<path d="M12 3.4c3.2 0 5.6 5.1 5.6 9A5.6 5.6 0 0 1 12 20.6 5.6 5.6 0 0 1 6.4 12.4c0-3.9 2.4-9 5.6-9Z"/>',
  };

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

    const items = [
      ['globe', 'Found in', a.r.join(', ')],
      ['drop',  'Colours', a.co.map(cap).join(', ')],
      ['ruler', 'Size', cap(a.sz)],
      // "Lives in Solitary" is not a sentence, so that one gets its own.
      a.so === 'Solitary' ? ['group', null, 'Lives alone'] : ['group', 'Lives in', a.so.toLowerCase()],
      ['clock', 'Lives for', a.lf],
      ['leg',   'Legs', a.lg === 0 ? 'None' : String(a.lg)],
    ];
    if (a.cv && a.cv !== 'None') items.push(['coat', 'Covered in', a.cv]);
    if (a.fl) items.push(['wing', null, 'Can fly']);
    if (a.sw) items.push(['wave', null, 'Can swim']);
    if (a.eg) items.push(['egg',  null, 'Lays eggs']);

    items.forEach(([ic, key, value], i) => {
      const c = document.createElement('div');
      c.className = 'gchip';
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
    });
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
    if (shotWatcher) shotWatcher.observe(fig);
    if (shot.caption) {
      const cp = document.createElement('figcaption');
      cp.textContent = shot.caption.length > 120
        ? shot.caption.slice(0, 117).trim() + '…'
        : shot.caption;
      fig.appendChild(cp);
    }
    slot.appendChild(fig);
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

  /* The extra photos are the only thing that animates on scroll, and
     they reuse the hero's arrival rather than a generic section fade -
     a picture being dealt is the same idea as the card being dealt. */
  const shotWatcher = ('IntersectionObserver' in window)
    ? new IntersectionObserver((entries, obs) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          play(e.target, 'anim-deal', 0);
          obs.unobserve(e.target);
        }
      }, { rootMargin: '0px 0px -12% 0px' })
    : null;

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

  el('random').addEventListener('click', (e) => {
    const b = e.currentTarget;
    b.classList.add('rolling');
    setTimeout(() => b.classList.remove('rolling'), 400);
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
    e.stopPropagation();
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
    if (open) { results = []; renderSuggest(); setShare(false); }   // one panel at a time
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

  /* -- Reporting a problem -------------------------------------------
     A native <dialog>, so focus trapping, Escape and the backdrop come
     from the browser instead of being rebuilt badly. The animal being
     looked at is attached automatically, because "the photo is wrong"
     is useless without knowing which photo. */

  const dlg = el('reportDlg');
  let openedAt = 0;

  function openReport() {
    setMenu(false);
    const status = el('reportStatus');
    status.textContent = '';
    status.className = 'dlg-status';
    el('reportMsg').value = '';
    el('reportHp').value = '';
    el('reportSend').disabled = false;
    el('reportCtx').textContent = current ? 'About ' + current.a.n + '.' : '';
    // Guess the likely complaint from where they were: on an animal it is
    // usually the picture, from the splash it is usually a missing animal.
    const want = current ? 'photo' : 'missing';
    const radio = dlg.querySelector('input[name="kind"][value="' + want + '"]');
    if (radio) radio.checked = true;
    openedAt = Date.now();
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
  }

  for (const b of document.querySelectorAll('[data-report]')) {
    b.addEventListener('click', openReport);
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
      const res = await fetch('api/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          animal: current ? current.a.n : '',
          kind: picked ? picked.value : 'other',
          message: message,
          dwell: Date.now() - openedAt,
          website: el('reportHp').value,
        }),
      });
      if (!res.ok) throw new Error(String(res.status));
      status.textContent = 'Thank you, that is logged.';
      status.className = 'dlg-status ok';
      setTimeout(() => { if (dlg.open) dlg.close(); }, 1100);
    } catch (err) {
      status.textContent = 'That did not send. Please try again in a moment.';
      status.className = 'dlg-status err';
      el('reportSend').disabled = false;
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

  applyTheme(readTheme());
  el('count').textContent = ANIMALS.length + ' animals and counting';
  renderStarters();
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
