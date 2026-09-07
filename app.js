(function () {
  'use strict';

  const el = (id) => document.getElementById(id);

  // Transparent 1x1. An <img> with no src at all is a broken-image icon.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  /* -- Sound ---------------------------------------------------------
     Synthesised, not sampled: five short envelopes off one oscillator
     voice weigh nothing, need no request, work offline like the rest of
     the site, and can't arrive half-loaded at the moment they're meant
     to land. It also keeps them a family - one timbre bent into five
     shapes - rather than five stock clips that merely coexist.

     Off is remembered; on is the default, since a site that goes quiet
     by default has to be discovered to be heard. The toggle sits in the
     menu with everything else adjustable here. */
  const SOUND_KEY = 'gma-mystery-sound';
  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) { return true; } })();
  let audioCtx = null;

  // Built lazily and only ever from inside a gesture handler - a context
  // created before any gesture starts life suspended, and browsers are
  // right to do that.
  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) { try { audioCtx = new AC(); } catch (e) { return null; } }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // One voice. Exponential ramps rather than linear ones because a
  // linear fade to zero on a sine reads as a click at the tail.
  function tone(c, freq, startAt, dur, peak, type) {
    const t0 = c.currentTime + startAt;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // Deliberately quiet (peaks well under 0.1) - this plays over whatever
  // else is going on, and on a stream it sits under a voice. `tap` is
  // the quietest of the lot because it is the one that fires all day.
  const SOUNDS = {
    tap: (c) => tone(c, 520, 0, 0.07, 0.04),
    hint: (c) => { tone(c, 587.33, 0, 0.1, 0.06); tone(c, 880, 0.055, 0.13, 0.045); },
    wrong: (c) => tone(c, 196, 0, 0.17, 0.075, 'triangle'),
    win: (c) => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, f, i * 0.075, 0.2, 0.06)),
    lose: (c) => { tone(c, 329.63, 0, 0.2, 0.06, 'triangle'); tone(c, 220, 0.13, 0.34, 0.055, 'triangle'); },
  };

  // Named sfx, not play: app.js already has a play(node, cls, delay)
  // animation-restart helper below, and a second function play in the
  // same scope silently replaces the first.
  function sfx(name) {
    if (!soundOn || !SOUNDS[name]) return;
    const c = audio();
    if (!c) return;
    try { SOUNDS[name](c); } catch (e) {}
  }

  // One delegated listener rather than a call in every handler: every
  // control on the site is a <button> or a real link, so this covers the
  // lot - including anything added later - and can't drift out of sync
  // with the markup. Anything that owns a more specific sound opts out
  // with data-sfx="off" and plays its own, so nothing ever doubles up.
  document.addEventListener('click', (e) => {
    const hit = e.target.closest('button, a[href], [role="button"]');
    if (!hit || hit.closest('[data-sfx="off"]')) return;
    sfx('tap');
  });

  function updateSoundToggle() {
    const btn = el('soundToggle');
    if (!btn) return;
    btn.textContent = soundOn ? 'Sound on' : 'Sound off';
    btn.setAttribute('aria-pressed', String(soundOn));
  }

  el('soundToggle').addEventListener('click', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch (err) {}
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
        box.appendChild(gap);
      }
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
    box.appendChild(gap);
    behaviour.forEach(([ic, key, value]) => renderChip(ic, key, value, i++));
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
  const JUNK_CAPTION = /^(a )?(artist'?s |life )?(diagram|map|distribution|range|skeleton|phylogen|cladogram|illustration|drawing|chart|restoration|reconstruction)/i;

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
    el('mysteryview').hidden = true;
    el('home').hidden = false;
    dock('home');
    el('q').value = '';
    results = [];
    renderSuggest();
    el('noresult').hidden = true;
    renderQuickPicks();
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
    recordRecent(entry);
    broadcastToStream(entry);

    document.body.className = 'view-animal';
    el('home').hidden = true;
    el('mysteryview').hidden = true;
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
    hero.classList.add('is-loading');
    el('photoFallbackEmoji').textContent = a.e || '🐾';
    el('photoFallbackNote').textContent = '';
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
      hero.classList.remove('is-loading');
    }

    const summaryReq = loadSummary(a).then((data) => {
      if (current !== entry) return;          // they typed something else
      if (data && data.thumbnail && data.thumbnail.source) setHero(data.thumbnail.source);
      if (data && data.extract) el('blurb').textContent = firstSentence(data.extract);
    });

    const mediaReq = loadMedia(a).then((media) => {
      if (current !== entry) return;
      if (media.lead) setHero(media.lead);
      const usable = media.shots.filter((s) => s.file && s.file !== heroFile);
      renderShot(el('shot2'), usable[0], a.n);
      renderShot(el('shot3'), usable[1], a.n);
    });

    // Neither request found a photo: stop pulsing and let the emoji settle
    // as the true resting state, not a still-loading one - and say so, for
    // anyone who can't tell "resting" from "loading" by the animation
    // alone (a glance, or prefers-reduced-motion).
    Promise.allSettled([summaryReq, mediaReq]).then(() => {
      if (current !== entry) return;
      hero.classList.remove('is-loading');
      if (!hero.classList.contains('has-photo')) {
        el('photoFallbackNote').textContent = 'No photo on file';
      }
    });

    if (!opts || !opts.noPush) push('?a=' + entry.slug);
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
    if (open) { results = []; renderSuggest(); setShare(false); }   // one panel at a time
  }

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

  /* -- Stream Mode -----------------------------------------------------
     An OBS Browser Source is a fully separate browser process from
     whatever's actually being used to look animals up, so there's no
     localStorage or BroadcastChannel that reaches it - the two sides
     only meet through /api/stream (see schema.sql for the fuller
     version of this). The key lives in localStorage on THIS side only;
     it travels to the overlay as a URL parameter, once, when it's
     copied into OBS. */

  const STREAM_KEY = 'gma-stream-key';
  const STREAM_ON = 'gma-stream-on';

  function randomKey() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function getStreamKey() {
    let k = null;
    try { k = localStorage.getItem(STREAM_KEY); } catch (err) { /* private mode */ }
    if (!k) {
      k = randomKey();
      try { localStorage.setItem(STREAM_KEY, k); } catch (err) { /* still usable this session */ }
    }
    return k;
  }

  function isStreaming() {
    try { return localStorage.getItem(STREAM_ON) === '1'; } catch (err) { return false; }
  }

  function setStreaming(on) {
    try { localStorage.setItem(STREAM_ON, on ? '1' : '0'); } catch (err) { /* not persisted, still works this tab */ }
  }

  function broadcastToStream(entry) {
    if (!isStreaming()) return;
    fetch('api/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: getStreamKey(), slug: entry.slug }),
    }).catch(() => {});
  }

  const streamDlg = el('streamDlg');

  function openStream() {
    setMenu(false);
    // First time: broadcasting defaults on, since opening this panel is
    // the whole ask. A returning visitor keeps whatever they last chose.
    const firstTime = !(function () { try { return !!localStorage.getItem(STREAM_KEY); } catch (err) { return false; } })();
    const key = getStreamKey();
    if (firstTime) setStreaming(true);

    // The clean URL, not stream.html directly - Cloudflare Pages
    // 308-redirects the .html form, and there's no reason to make OBS
    // (or the preview iframe below) take that extra hop every load.
    const url = location.origin + '/stream?key=' + key;
    el('streamUrl').value = url;
    el('streamPreview').src = url;
    el('streamCopyStatus').textContent = '';
    updateStreamToggleUI();

    // .show(), not .showModal(): a modal dialog makes the rest of the
    // page inert, including the real search box the live preview asks
    // you to type into. This one floats instead - deliberately not
    // dismissed by clicking the page behind it, since using the page
    // behind it is the point.
    if (typeof streamDlg.show === 'function') streamDlg.show();
    else streamDlg.setAttribute('open', '');
  }

  function updateStreamToggleUI() {
    const on = isStreaming();
    const btn = el('streamToggle');
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'On' : 'Off';
  }

  el('streamOpen').addEventListener('click', openStream);
  el('streamClose').addEventListener('click', () => streamDlg.close());
  el('streamToggle').addEventListener('click', () => {
    setStreaming(!isStreaming());
    updateStreamToggleUI();
  });
  el('streamCopy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(el('streamUrl').value);
      el('streamCopyStatus').textContent = 'Copied.';
    } catch (err) {
      el('streamUrl').select();
      el('streamCopyStatus').textContent = "Couldn't copy — selected it instead, copy with Ctrl/Cmd+C.";
    }
  });
  // Escape-to-close is native to showModal(), not to show() - this
  // dialog uses the latter on purpose (see openStream), so it needs its
  // own handler, same pattern the share panel already uses for its own
  // non-native dismiss behaviour.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && streamDlg.open) { streamDlg.close(); el('streamOpen').focus(); }
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

    const wanted = url.searchParams.get('a');
    if (wanted) {
      const entry = INDEX.find((x) => x.slug === slugify(wanted));
      if (entry) { show(entry, { noPush: true }); return; }
    }
    goHome({ noPush: true });
  }

  window.addEventListener('popstate', routeFromURL);

  // Deliberately small: the things mystery.js (a separate view that
  // still needs to feel like part of the same app) needs back from the
  // routing/view state this file owns.
  window.GMA = { goHome, push, setMenu, loadSummary, dock, openReport, sfx };

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
