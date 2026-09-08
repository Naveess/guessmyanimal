(function () {
  'use strict';

  const el = (id) => document.getElementById(id);
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Same one-letter/one-swap tolerance the main search already gives -
  // "gorila" or "hipo" - a guess shouldn't fail on a typo when the site
  // itself would have found the animal fine.
  function near(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    if (a.length === b.length) {
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
      return diff <= 1;
    }
    const [s, l] = a.length < b.length ? [a, b] : [b, a];
    let i = 0, j = 0, skipped = false;
    while (i < s.length && j < l.length) {
      if (s[i] === l[j]) { i++; j++; continue; }
      if (skipped) return false;
      skipped = true; j++;
    }
    return true;
  }

  function matches(guess, a) {
    const g = norm(guess);
    if (!g) return false;
    const names = [norm(a.n)].concat((a.a || []).map(norm));
    return names.some((n) => n === g || (g.length >= 4 && near(n, g)));
  }

  const DIET_HINT = {
    Carnivore: 'It only eats meat.',
    Omnivore: 'It eats both plants and meat.',
    Herbivore: "It's a herbivore — plants only.",
    Insectivore: 'It mostly eats insects.',
  };
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

  // skipCategory drops the "It's a mammal" hint when a filter chip
  // already told the player the category - a single-category chip
  // makes that hint a pure freebie, so the round runs one hint short
  // instead of shipping it.
  // r[0] values are Title Case for display elsewhere (chips, filters),
  // but a few read as proper nouns they aren't once dropped into "Found
  // in ___." - "Found in Worldwide.", "Found in Oceans.", "Found in
  // Arctic." are backwards grammar, not just odd capitalisation, so each
  // gets its own phrasing rather than a lowercase patch that'd still read
  // wrong. Checked against every r[0] value in animals.js: continents,
  // countries and named landmasses (Africa, Asia, Australia, Europe,
  // North/South/Central America, Madagascar, New Zealand) take no
  // article and read fine through the generic fallback below - only
  // these five are genuine exceptions.
  const REGION_HINT = {
    Worldwide: "It's found worldwide.",
    Oceans: 'Found in the oceans.',
    Rivers: 'Found in rivers.',
    Americas: 'Found in the Americas.',
    Arctic: 'Found in the Arctic.',
    Antarctic: 'Found in the Antarctic.',
  };
  function regionHint(r) {
    return REGION_HINT[r] || ('Found in ' + r + '.');
  }

  function hintsFor(a, skipCategory) {
    const list = [
      "It's a " + a.c.toLowerCase() + '.',
      regionHint(a.r[0]),
      DIET_HINT[a.d] || '',
      cap(a.sz) + ' in size.',
      a.f,
    ];
    return skipCategory ? list.slice(1) : list;
  }

  /* -- Category filter (Endless only) -------------------------------
     Raw categories run 15 deep and several hold only 1-3 animals, too
     granular for a chip row - bucketed into six practical groups
     instead. "sea"/"bugs" bundle several real categories together, so
     the category hint stays informative there; "mammals"/"birds" map
     to exactly one real category, so the hint would just restate the
     chip (handled via skipCategory above). */
  const CATEGORY_BUCKETS = [
    { key: 'all', label: 'All', cats: null },
    { key: 'mammals', label: 'Mammals', cats: ['Mammal'] },
    { key: 'birds', label: 'Birds', cats: ['Bird'] },
    { key: 'reptiles', label: 'Reptiles & Amphibians', cats: ['Reptile', 'Amphibian'] },
    { key: 'sea', label: 'Fish & Sea Life', cats: ['Fish', 'Mollusc', 'Cnidarian', 'Crustacean', 'Echinoderm', 'Sponge'] },
    { key: 'bugs', label: 'Bugs & Crawlers', cats: ['Insect', 'Arachnid', 'Annelid', 'Myriapod', 'Tardigrade'] },
  ];

  function bucketOf(key) {
    return CATEGORY_BUCKETS.find((b) => b.key === key) || CATEGORY_BUCKETS[0];
  }

  function poolFor(key) {
    const bucket = bucketOf(key);
    if (!bucket.cats) return ANIMALS;
    const pool = ANIMALS.filter((a) => bucket.cats.includes(a.c));
    return pool.length ? pool : ANIMALS;
  }

  /* -- Score, streaks & persisted state -------------------------------
     Local only, no accounts - the same standing choice the rest of the
     site already makes for theme and recents. Score per round rewards
     guessing early and fast: up to 100 for the first hint, down to a
     10-point floor by the last, plus a small speed bonus. Two separate
     streaks are tracked - Endless is a same-session hot streak,
     Wordle-style; Daily is consecutive *days* played correctly, which
     is a different thing and would be misleading if conflated with the
     other. Score is the one number shared across both modes. */

  const BEST_KEY = 'gma-mystery-best';
  const SCORE_KEY = 'gma-mystery-score';
  const MODE_KEY = 'gma-mystery-mode';
  const FILTER_KEY = 'gma-mystery-filter';
  const DAILY_STREAK_KEY = 'gma-mystery-daily-streak';
  const DAILY_BEST_KEY = 'gma-mystery-daily-best';
  const DAILY_DATE_KEY = 'gma-mystery-daily-date';       // last date a daily was resolved (win or loss)
  const DAILY_RESULT_KEY = 'gma-mystery-daily-result';   // today's result, once resolved
  const DAILY_INTRO_KEY = 'gma-mystery-daily-intro-seen'; // shown once, before a first Daily round ever finishes

  function getNum(key) { try { return Number(localStorage.getItem(key)) || 0; } catch (e) { return 0; } }
  function setNum(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }
  function getStr(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
  function setStr(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }

  const getBest = () => getNum(BEST_KEY);
  const setBest = (v) => setNum(BEST_KEY, v);
  const getScore = () => getNum(SCORE_KEY);
  const setScore = (v) => setNum(SCORE_KEY, v);
  const getDailyStreak = () => getNum(DAILY_STREAK_KEY);
  const setDailyStreak = (v) => setNum(DAILY_STREAK_KEY, v);
  const getDailyBest = () => getNum(DAILY_BEST_KEY);
  const setDailyBest = (v) => setNum(DAILY_BEST_KEY, v);
  const getDailyDate = () => getStr(DAILY_DATE_KEY, '');
  const setDailyDate = (v) => setStr(DAILY_DATE_KEY, v);
  const getModeStore = () => getStr(MODE_KEY, 'daily');
  const setModeStore = (v) => setStr(MODE_KEY, v);
  const getFilterStore = () => getStr(FILTER_KEY, 'all');
  const setFilterStore = (v) => setStr(FILTER_KEY, v);
  const dailyIntroSeen = () => !!getStr(DAILY_INTRO_KEY, '');
  const setDailyIntroSeen = () => setStr(DAILY_INTRO_KEY, '1');

  function getDailyResult() {
    try { return JSON.parse(localStorage.getItem(DAILY_RESULT_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setDailyResult(v) {
    try { localStorage.setItem(DAILY_RESULT_KEY, JSON.stringify(v)); } catch (e) {}
  }

  // Every day ever replayed through the archive, keyed by date - separate
  // from DAILY_RESULT_KEY (today's puzzle only) on purpose. Winning an
  // archived day still earns real score, but never touches the day
  // streak: that's specifically about consecutive *today*s, and
  // retroactively patching it from the archive would undermine the one
  // thing that makes it worth keeping unbroken.
  const DAILY_ARCHIVE_KEY = 'gma-mystery-daily-archive';
  function getArchive() {
    try { return JSON.parse(localStorage.getItem(DAILY_ARCHIVE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function setArchiveEntry(date, result) {
    try {
      const all = getArchive();
      all[date] = result;
      localStorage.setItem(DAILY_ARCHIVE_KEY, JSON.stringify(all));
    } catch (e) {}
  }

  let streak = 0;                 // endless, session-only
  let lifetimeScore = getScore(); // shared across both modes
  let filter = getFilterStore();
  let mode = getModeStore();

  // The sound engine and the preference behind it live in app.js, which
  // owns everything site-wide; this view only ever asks for a named
  // sound. Guarded the same way loadSummary is below - app.js loads
  // after this file, so the reference is resolved at call time, never at
  // parse time.
  function sfx(name) {
    if (window.GMA && typeof GMA.sfx === 'function') GMA.sfx(name);
  }

  function pointsForHints(hintsShown) {
    return Math.max(100 - (hintsShown - 1) * 20, 10);
  }
  // Widened from the original 8s/20s: those windows rewarded reflexes,
  // not knowledge, and made the bonus mathematically unreachable the
  // moment this became something worth playing with an audience - chat
  // needs time to read a hint and argue about it before anyone answers.
  // 20s/45s still separates "knew it cold" from "worked it out," but no
  // longer requires a twitch-fast solo player to collect either tier.
  function timeBonus(elapsedMs) {
    if (elapsedMs < 20000) return 15;
    if (elapsedMs < 45000) return 5;
    return 0;
  }

  /* -- Daily puzzle: date -> animal, with no server round trip -------
     A stable hash of the player's local date indexes straight into the
     existing ANIMALS array, so every visitor on the same day lands on
     the same animal for free. Editing animals.js later shifts which
     animal falls on which future date, which is fine - nobody notices
     a puzzle number's animal changing before it's ever been played. */

  function pad2(n) { return n < 10 ? '0' + n : String(n); }
  function dateStr(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return dateStr(new Date()); }
  function addDays(ds, delta) {
    const [y, m, d] = ds.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + delta);
    return dateStr(dt);
  }
  function hashStr(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h >>> 0;
  }
  const DAILY_EPOCH = '2026-09-04'; // puzzle #1
  function dailyNumber(ds) {
    const [y1, m1, d1] = DAILY_EPOCH.split('-').map(Number);
    const [y2, m2, d2] = ds.split('-').map(Number);
    const days = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
    return days + 1;
  }
  // Generalised so a past day's puzzle can be recomputed on demand for
  // the archive below - it's the same pure function of the date either
  // way, just not always today's date.
  function pickDailyFor(ds) {
    return ANIMALS[hashStr(ds) % ANIMALS.length];
  }
  function pickDaily() {
    return pickDailyFor(todayStr());
  }

  /* -- Round state --------------------------------------------------- */

  let target = null;       // the current animal object (from ANIMALS)
  let hints = [];
  let shown = 0;            // hints currently visible, at least 1
  let resolved = false;     // round already won/given up
  let roundMode = mode;     // which mode the *current* round/state belongs to
  let archiveDate = null;  // set while roundMode is 'daily' but the round is a past day, not today
  let roundStart = 0;

  // Endless: avoid repeating anything from recent memory, not just the
  // single last pick - a filtered pool (say, 25 Australian animals) can
  // hand back the same animal within a handful of rounds otherwise, which
  // reads as broken rather than random. The window shrinks to fit small
  // pools so it can never lock up waiting for a name that isn't there.
  let recentNames = [];
  function pickEndless() {
    const pool = poolFor(filter);
    const windowSize = Math.min(12, pool.length - 1);
    let a;
    do { a = pool[Math.floor(Math.random() * pool.length)]; }
    while (windowSize > 0 && recentNames.includes(a.n));
    recentNames.push(a.n);
    if (recentNames.length > windowSize) recentNames.shift();
    return a;
  }

  // Same placeholder the animal page uses to reset its own #photo/#photoBg
  // between animals - a transparent 1x1, never an empty src, so a stale
  // or half-loaded image never flashes between rounds.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  // A CSS `filter: blur()` never actually hides anything - the browser
  // still downloads the full, sharp image, so anyone who opens devtools
  // (Elements, to read the real <img src>, or Network, to see the
  // response) gets the answer regardless of what's painted on screen.
  // The only real fix is to never let the round-in-progress request the
  // full image at all: each step below is a genuinely tiny Wikimedia
  // thumbnail, fetched straight from Wikimedia's own thumbnailing
  // service. Direct (hotlinked) requests like this one are only served
  // for a fixed list of "standard" widths - anything else 400s, per
  // https://w.wiki/GHai ("Current standard sizes in Wikimedia
  // production: 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920, 3840").
  // Stretched back up to card size with `image-rendering: pixelated` in
  // style.css, so the actual bytes on the wire are as blocky as what's
  // on screen. 0 is a sentinel for "use the real, full-size source" -
  // only reachable once resolved, or on the last hint of a full round,
  // matching the old blur curve's final step landing on fully sharp.
  const PIXEL_WIDTH_STEPS = [20, 40, 60, 120, 0];

  // The summary API's thumbnail URL always ends .../<width>px-<file>;
  // swapping that number for another size on the standard list above is
  // the supported way to ask Wikimedia's own thumbnailer for a different
  // rendition of the same file. Returns null if the URL doesn't look
  // like that shape, so a caller can fall back to showing no photo
  // rather than risk serving the real one.
  function thumbAtWidth(src, width) {
    const m = /^(.*\/)(\d+)px-([^/]+)$/.exec(src);
    return m ? m[1] + width + 'px-' + m[3] : null;
  }

  let photoFullSrc = null; // the real thumbnail URL, once fetched

  function setPhotoSrc(src) {
    const img = el('mysteryPhotoImg');
    const hero = el('mysteryHero');
    img.onerror = () => hero.classList.remove('has-photo');
    img.onload = () => { hero.classList.add('has-photo'); pulse(img); };
    img.src = src;
    el('mysteryPhotoBg').src = src;
  }

  function applyPixelation() {
    if (!photoFullSrc) return;
    if (resolved) { setPhotoSrc(photoFullSrc); return; }
    const idx = Math.min(Math.max(shown - 1, 0), PIXEL_WIDTH_STEPS.length - 1);
    const step = PIXEL_WIDTH_STEPS[idx];
    const tiny = step === 0 ? photoFullSrc : thumbAtWidth(photoFullSrc, step);
    // No match for the expected Wikimedia URL shape: skip the photo
    // entirely rather than gamble on it secretly being the full image.
    if (!tiny) { el('mysteryHero').classList.remove('has-photo'); return; }
    setPhotoSrc(tiny);
  }

  // Mirrors app.js's own hero reset in show(): wipe back to the loading
  // state before the new round's fetch goes out, or the previous
  // animal's photo (and pixelation level) would sit there briefly looking
  // like this round's answer.
  function resetHero() {
    const hero = el('mysteryHero');
    hero.classList.remove('has-photo', 'revealed');
    hero.classList.add('is-loading');
    photoFullSrc = null;
    const img = el('mysteryPhotoImg');
    img.onerror = null;
    img.onload = null;
    img.alt = '';
    img.src = BLANK;
    el('mysteryPhotoBg').src = BLANK;
    el('mysteryPhotoName').textContent = '';
    el('mysteryPhotoEmoji').textContent = '';
    el('mysteryPhotoSub').textContent = '';
  }

  // The one authored entrance moment the rest of the site spends on the
  // Photo Card arriving - reused here rather than inventing a second one,
  // via the same "remove, reflow, re-add" restart trick #mysteryResult
  // already uses below.
  function dealHero() {
    const hero = el('mysteryHero');
    hero.classList.remove('anim-deal');
    void hero.offsetWidth;
    hero.classList.add('anim-deal');
  }

  // Same restart trick, generalised: a small physical acknowledgment
  // (see .anim-pulse in style.css) for a button that just took on a real
  // cost - rather than a silent state change. Score/streak use the more
  // specific wobble+arrow treatment below instead (animateStatChange).
  function pulse(elOrId) {
    const node = typeof elOrId === 'string' ? el(elOrId) : elOrId;
    if (!node) return;
    node.classList.remove('anim-pulse');
    void node.offsetWidth;
    node.classList.add('anim-pulse');
  }

  // Same trick again, for a value that just changed rather than a button
  // that was just pressed: the digits themselves wobble (see .anim-tilt
  // in style.css), and a small drawn chevron - not a text glyph, this
  // project has no icon font - rises and fades in the tile's corner,
  // coloured Good/Bad the same way the answer pills already are. Direction
  // only ever needs "up" (a win) or "down" (a streak resetting on a loss) -
  // score itself never decreases, but both numbers share this one path.
  const STAT_ARROW_SVG = {
    up: '<svg viewBox="0 0 14 14" width="14" height="14"><path d="M2 9 L7 3 L12 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 14 14" width="14" height="14"><path d="M2 5 L7 11 L12 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  function animateStatChange(id, direction) {
    const node = el(id);
    wobble(node);
    const stat = node.closest('.mystery-stat');
    const arrow = stat && stat.querySelector('.mystery-stat-arrow');
    if (!arrow) return;
    arrow.className = 'mystery-stat-arrow ' + direction;
    arrow.innerHTML = STAT_ARROW_SVG[direction];
    void arrow.offsetWidth;
    arrow.classList.add('is-visible');
  }
  function wobble(elOrId) {
    const node = typeof elOrId === 'string' ? el(elOrId) : elOrId;
    if (!node) return;
    node.classList.remove('anim-tilt');
    void node.offsetWidth;
    node.classList.add('anim-tilt');
  }

  // Best-effort: no thumbnail (offline, rate-limited, or the article has
  // none) just leaves the fallback's paw mark showing and the hints carry
  // the round on their own - the fallback is always the site's own mark,
  // never the animal's own emoji, since that would give the game away
  // before a single hint has.
  function loadPhoto(a) {
    if (!window.GMA || typeof GMA.loadSummary !== 'function') {
      el('mysteryHero').classList.remove('is-loading');
      return;
    }
    GMA.loadSummary(a).then((data) => {
      if (a !== target) return; // a newer round already started
      el('mysteryHero').classList.remove('is-loading');
      const src = data && data.thumbnail && data.thumbnail.source;
      if (!src) return;
      photoFullSrc = src;
      applyPixelation();
    });
  }

  // Only called once a round is resolved - the name/category overlay
  // stays invisible (#mysteryHero.revealed gates it in style.css) until
  // this runs, so the photo card can't spoil the answer mid-round.
  function revealHero() {
    el('mysteryPhotoImg').alt = target ? target.n : '';
    el('mysteryPhotoName').textContent = target ? target.n : '';
    el('mysteryPhotoEmoji').textContent = target ? (target.e || '') : '';
    el('mysteryPhotoSub').textContent = target ? (target.c + ' · ' + target.r[0]) : '';
    el('mysteryHero').classList.add('revealed');
  }

  function renderHints() {
    const box = el('mysteryHints');
    box.innerHTML = '';
    for (let i = 0; i < shown; i++) {
      const p = document.createElement('p');
      p.className = 'mystery-hint' + (i === shown - 1 ? ' anim-rise' : '');
      p.textContent = (i + 1) + '. ' + hints[i];
      box.appendChild(p);
    }
    applyPixelation();
    updateHintBtn();
  }

  function updateStats() {
    if (mode === 'daily') {
      el('mysteryStreakLabel').textContent = 'Day streak';
      el('mysteryStreak').textContent = String(getDailyStreak());
      el('mysteryBest').textContent = String(getDailyBest());
    } else {
      el('mysteryStreakLabel').textContent = 'Streak';
      el('mysteryStreak').textContent = String(streak);
      el('mysteryBest').textContent = String(getBest());
    }
    el('mysteryScore').textContent = String(lifetimeScore);
    // Orient before adding personality: a first-timer otherwise lands on
    // three unexplained "0" tiles with no idea Daily is one shared puzzle.
    // Shown once, ever, and only pre-round - once a round's resolved they
    // already know, and the result view has its own things to say.
    el('mysteryDailyIntro').hidden = !(mode === 'daily' && !resolved && !dailyIntroSeen());
  }

  /* -- Milestones: a quiet toast, not a new component ----------------
     Reuses the same "set text, retrigger `rise`" trick #mysteryResult
     already uses below - one keyframe, no new motion primitive. */
  const MILESTONES = [5, 10, 25, 50, 100];
  let toastTimer = null;
  function toast(text) {
    const outer = el('mysteryMilestone');
    const inner = el('mysteryMilestoneText');
    clearTimeout(toastTimer);
    inner.textContent = text;
    outer.classList.add('is-visible');
    inner.classList.remove('anim-rise');
    void inner.offsetWidth;
    inner.classList.add('anim-rise');
    toastTimer = setTimeout(() => { outer.classList.remove('is-visible'); }, 2500);
  }
  // Round transitions shouldn't leave a stale toast floating over new
  // content if one was still showing when the player moved on.
  function hideToast() {
    clearTimeout(toastTimer);
    el('mysteryMilestone').classList.remove('is-visible');
  }
  function maybeToast(v) {
    if (MILESTONES.indexOf(v) !== -1) toast('🔥 ' + v + ' in a row!');
  }

  /* -- Daily result countdown ----------------------------------------
     Ticks while the locked/resolved Daily view is on screen; cleared
     whenever it isn't, so nothing runs in the background. */
  let countdownTimer = null;
  function clearCountdown() { if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; } }
  function nextMidnight() { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }
  function startCountdown() {
    clearCountdown();
    const tick = () => {
      const ms = nextMidnight() - Date.now();
      const note = el('mysteryCountdown');
      if (ms <= 0) { note.textContent = "Today's animal is ready."; clearCountdown(); return; }
      const mins = Math.max(0, Math.floor(ms / 60000));
      note.textContent = 'Next animal in ' + Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    };
    tick();
    countdownTimer = setInterval(tick, 30000);
  }

  /* -- Sharing ---------------------------------------------------------
     Same panel pattern app.js already uses for the animal page itself
     (native share sheet on a coarse pointer, an explicit WhatsApp/X/
     Facebook/copy panel otherwise) - duplicated here with its own ids
     since this file already owns its view independently, the same call
     this file made for typo tolerance above.

     Daily shares a solved day's result grid; Endless has no single
     "result" to grid out - it's an open run - so it shares whatever
     streak was live when Share was offered instead (see
     renderEndlessShare and endlessShareStreak below). */

  function shareGrid(r) {
    let s = '';
    for (let i = 0; i < r.hintsTotal; i++) s += (r.won && i === r.hintsShown - 1) ? '🟩' : '⬜';
    return s;
  }

  // Endless has no single "result" object the way a resolved Daily does -
  // it's an open-ended run, so what's shareable is whatever the streak
  // was at the moment Share was offered. Set once by renderEndlessShare,
  // read back here rather than the live `streak` variable, which has
  // usually already reset to 0 by the time someone taps Share after a
  // loss - the number worth bragging about is the one that just ended.
  let endlessShareStreak = 0;

  function shareText() {
    if (roundMode === 'daily') {
      const r = getDailyResult();
      return r ? 'GuessMyAnimal #' + dailyNumber(r.date) + '\n' + shareGrid(r) : '';
    }
    return 'GuessMyAnimal — ' + endlessShareStreak + ' in a row. Can you beat it?';
  }
  function shareUrl() { return location.origin + '/?mystery=1'; }

  const canShareNatively = () =>
    typeof navigator.share === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  function setSharePanel(open) {
    const panel = el('mysterySharePanel');
    panel.hidden = !open;
    el('mysteryShareBtn').setAttribute('aria-expanded', String(open));
    if (!open) return;
    const text = shareText();
    if (!text) return;
    const url = shareUrl();
    el('mysteryShareWa').href = 'https://wa.me/?text=' + encodeURIComponent(text + '\n' + url);
    el('mysteryShareX').href = 'https://twitter.com/intent/tweet?text=' +
      encodeURIComponent(text) + '&url=' + encodeURIComponent(url);
    el('mysteryShareFb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  }

  function renderDailyShare() {
    const r = getDailyResult();
    el('mysteryShare').hidden = !r;
    setSharePanel(false);
  }

  // A streak of 1 or 2 isn't a result yet, just a round - matches the
  // same >= 3 threshold lossFeedback() already uses to decide a streak
  // is worth naming out loud.
  function renderEndlessShare(n) {
    endlessShareStreak = n;
    el('mysteryShare').hidden = !(n >= 3);
    setSharePanel(false);
  }

  /* -- Round lifecycle -------------------------------------------------
     A third view alongside home and the animal page, sharing the same
     body-class + hidden-toggle pattern app.js's goHome()/show() use -
     and, since it needs to hand back to those, the same URL-driven
     routing too. app.js's routeFromURL() calls window.openMystery when
     it sees ?mystery=1 (including on the browser's own back button);
     GMA.push/GMA.goHome/GMA.setMenu/GMA.loadSummary/GMA.dock are what
     this file needs back from that side. */

  const GIVEUP_LABEL = 'Give up, show the answer';
  // Short enough to stay on one line at the button's own width - the
  // longer "you won't get another today" clause already lives in the
  // aria-live feedback line below, so the button doesn't need to repeat
  // it and grow by two lines' worth of height every time it arms.
  const GIVEUP_CONFIRM_LABEL = 'Tap again to give up';
  let giveUpArmed = false;
  let giveUpArmTimer = null;
  function resetGiveUpArm() {
    const wasArmed = giveUpArmed;
    giveUpArmed = false;
    if (giveUpArmTimer) { clearTimeout(giveUpArmTimer); giveUpArmTimer = null; }
    el('mysteryGiveUp').textContent = GIVEUP_LABEL;
    // Only clear the feedback line if it was actually announcing the
    // armed state - never stomp some other message (a fresh round already
    // clears it separately, and a confirmed give-up is about to overwrite
    // it via endRound() anyway).
    if (wasArmed) {
      el('mysteryFeedback').textContent = '';
      el('mysteryFeedback').className = 'mystery-feedback';
    }
  }

  // forArchiveDate, when given, starts a Daily round for that past date
  // instead of today - the one other caller of this (the archive list's
  // row click) always passes 'daily' alongside it, but the check stays
  // explicit rather than assumed.
  function newRound(forMode, forArchiveDate) {
    roundMode = forMode;
    archiveDate = forMode === 'daily' ? (forArchiveDate || null) : null;
    resolved = false;
    const bucket = forMode === 'endless' ? bucketOf(filter) : null;
    const skipCategory = !!(bucket && bucket.cats && bucket.cats.length === 1);
    target = forMode === 'endless' ? pickEndless() : pickDailyFor(archiveDate || todayStr());
    hints = hintsFor(target, skipCategory);
    shown = 1;
    roundStart = Date.now();
    el('mysteryGuess').value = '';
    el('mysteryForm').hidden = false;
    el('mysteryGiveUp').hidden = false;
    el('mysteryFeedback').textContent = '';
    el('mysteryFeedback').className = 'mystery-feedback';
    el('mysteryResult').hidden = true;
    el('mysteryNext').hidden = false;
    el('mysteryArchiveResultBack').hidden = true;
    el('mysteryResultNote').hidden = true;
    el('mysteryCountdown').hidden = true;
    el('mysteryShare').hidden = true;
    el('mysteryCelebrate').innerHTML = '';
    for (const a of document.querySelectorAll('.mystery-stat-arrow')) { a.className = 'mystery-stat-arrow'; a.innerHTML = ''; }
    resetGiveUpArm();
    hideToast();
    clearCountdown();
    closeArchive();
    renderHints();
    resetHero();
    dealHero();
    loadPhoto(target);
    updateStats();
    el('mysteryGuess').focus();
  }

  // Only ever populated on a genuine, just-happened win (see the
  // `celebrateWin` param on showResultCard below) - a give-up or a
  // Daily-history replay shows the exact same result card otherwise, so
  // this is the one thing that tells "I solved it" apart from "I didn't."
  // Uses the animal's own emoji plus the site's paw mark rather than
  // generic confetti shapes, so it reads as specific to what just
  // happened rather than a stock celebration effect.
  const CELEBRATE_PARTICLES = [
    { x: '8%', ty: '-64px', r: '-24deg', d: '0s' },
    { x: '28%', ty: '-82px', r: '18deg', d: '.12s' },
    { x: '50%', ty: '-56px', r: '-10deg', d: '.24s' },
    { x: '72%', ty: '-80px', r: '22deg', d: '.12s' },
    { x: '92%', ty: '-62px', r: '-18deg', d: '0s' },
  ];
  function celebrate() {
    const box = el('mysteryCelebrate');
    box.innerHTML = '';
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const glyphs = [target.e || '🐾', '🐾', target.e || '🐾', '✨', target.e || '🐾'];
    for (let i = 0; i < CELEBRATE_PARTICLES.length; i++) {
      const p = CELEBRATE_PARTICLES[i];
      const s = document.createElement('span');
      s.textContent = glyphs[i];
      s.style.setProperty('--x', p.x);
      s.style.setProperty('--ty', p.ty);
      s.style.setProperty('--r', p.r);
      s.style.setProperty('--d', p.d);
      box.appendChild(s);
    }
  }

  function showResultCard(won, lostDailyStreak, celebrateWin, endlessStreakForShare) {
    resolved = true;
    applyPixelation();
    updateHintBtn();
    revealHero();
    el('mysteryAnswerEmoji').textContent = target.e || '🐾';
    el('mysteryAnswerName').textContent = target.n;
    if (celebrateWin) celebrate(); else el('mysteryCelebrate').innerHTML = '';
    el('mysteryResult').hidden = false;
    el('mysteryResult').classList.remove('anim-rise');
    void el('mysteryResult').offsetWidth;
    el('mysteryResult').classList.add('anim-rise');

    if (roundMode === 'daily' && archiveDate) {
      // A past day, not today - no countdown (there's nothing to wait
      // for), no share (the grid's day number would read as today's),
      // and "Next animal" makes no sense for one fixed puzzle, so this
      // is the one state where its stand-in takes over instead.
      el('mysteryNext').hidden = true;
      el('mysteryArchiveResultBack').hidden = false;
      const note = el('mysteryResultNote');
      note.hidden = false;
      note.textContent = 'Day ' + dailyNumber(archiveDate) + ' — ' +
        (won ? 'solved in ' + shown + (shown === 1 ? ' hint.' : ' hints.') : 'missed it.');
      el('mysteryCountdown').hidden = true;
      el('mysteryShare').hidden = true;
    } else if (roundMode === 'daily') {
      el('mysteryNext').hidden = true;
      el('mysteryArchiveResultBack').hidden = true;
      const note = el('mysteryResultNote');
      note.hidden = false;
      note.textContent = won
        ? 'Solved in ' + shown + (shown === 1 ? ' hint.' : ' hints.')
        : (lostDailyStreak >= 3 ? 'Streak of ' + lostDailyStreak + ' gone — see you tomorrow.' : 'Streak reset — see you tomorrow.');
      el('mysteryCountdown').hidden = false;
      startCountdown();
      renderDailyShare();
    } else {
      el('mysteryNext').hidden = false;
      el('mysteryResultNote').hidden = true;
      el('mysteryCountdown').hidden = true;
      renderEndlessShare(endlessStreakForShare);
    }
  }

  // The two extremes of a win are the ones worth naming - solved cold on
  // the first hint, or dragged out to the very last one. Everything in
  // between stays the plain, steady line: not every win needs a line
  // written for it, or the ones that do stop landing.
  function winFeedback(pts) {
    if (shown === 1) return 'First hint. Nailed it. +' + pts + ' points.';
    if (shown === hints.length) return 'Right at the wire — +' + pts + ' points.';
    return 'Got it — +' + pts + ' points.';
  }

  // Only a streak that was actually something says so by name on the way
  // out - a streak of 0 or 1 has nothing to mourn, so the plain line
  // covers it.
  function lossFeedback(lostStreak) {
    return lostStreak >= 3 ? "That's the one. Streak of " + lostStreak + ' gone.' : "That's the one — streak reset.";
  }

  function endRound(won) {
    resolved = true;
    el('mysteryForm').hidden = true;
    el('mysteryGiveUp').hidden = true;
    sfx(won ? 'win' : 'lose');

    const pts = won ? pointsForHints(shown) + timeBonus(Date.now() - roundStart) : 0;
    let lostDailyStreak = null;
    let lostStreakAmount = 0; // > 0 means a real streak just reset to 0 - worth a down-arrow

    if (roundMode === 'endless') {
      if (won) {
        streak += 1;
        lifetimeScore += pts;
        setScore(lifetimeScore);
        if (streak > getBest()) setBest(streak);
        maybeToast(streak);
        el('mysteryFeedback').textContent = winFeedback(pts);
        el('mysteryFeedback').className = 'mystery-feedback good';
      } else {
        lostStreakAmount = streak;
        streak = 0;
        el('mysteryFeedback').textContent = lossFeedback(lostStreakAmount);
        el('mysteryFeedback').className = 'mystery-feedback';
      }
    } else if (archiveDate) {
      // An archived day: real score either way, but the day streak is
      // specifically about consecutive *today*s, so it - and today's
      // own DAILY_RESULT_KEY/date - are never touched here.
      if (won) {
        lifetimeScore += pts;
        setScore(lifetimeScore);
        el('mysteryFeedback').textContent = winFeedback(pts);
        el('mysteryFeedback').className = 'mystery-feedback good';
      } else {
        el('mysteryFeedback').textContent = "That's the one.";
        el('mysteryFeedback').className = 'mystery-feedback';
      }
      setArchiveEntry(archiveDate, { won, hintsShown: shown, hintsTotal: hints.length, animalName: target.n });
    } else {
      const today = todayStr();
      lostDailyStreak = won ? null : getDailyStreak();
      let dstreak = won ? (getDailyDate() === addDays(today, -1) ? getDailyStreak() + 1 : 1) : 0;
      if (won) {
        lifetimeScore += pts;
        setScore(lifetimeScore);
        maybeToast(dstreak);
        el('mysteryFeedback').textContent = winFeedback(pts);
        el('mysteryFeedback').className = 'mystery-feedback good';
      } else {
        lostStreakAmount = lostDailyStreak || 0;
        el('mysteryFeedback').textContent = "That's the one.";
        el('mysteryFeedback').className = 'mystery-feedback';
      }
      setDailyStreak(dstreak);
      if (dstreak > getDailyBest()) setDailyBest(dstreak);
      setDailyDate(today);
      setDailyResult({ date: today, won, hintsShown: shown, hintsTotal: hints.length, animalName: target.n });
      setDailyIntroSeen();
    }

    updateStats();
    if (won) {
      if (!archiveDate) animateStatChange('mysteryStreak', 'up');
      animateStatChange('mysteryScore', 'up');
    } else if (lostStreakAmount > 0) {
      animateStatChange('mysteryStreak', 'down');
    }
    showResultCard(won, lostDailyStreak, won, won ? streak : lostStreakAmount);
  }

  // Reconstructs today's already-played Daily round from storage - the
  // hint list is re-derived from the animal (never itself stored) and
  // shown in full since none of it is secret once the day is settled.
  function renderDailyLocked(r) {
    roundMode = 'daily';
    archiveDate = null; // this is always today's own result, never an archived day's
    target = ANIMALS.find((a) => a.n === r.animalName) || null;
    resolved = true;
    setDailyIntroSeen();
    el('mysteryForm').hidden = true;
    el('mysteryGiveUp').hidden = true;
    el('mysteryFeedback').textContent = '';
    el('mysteryArchiveResultBack').hidden = true;
    closeArchive();
    resetHero();
    dealHero();
    if (target) {
      hints = hintsFor(target, false);
      shown = hints.length;
      renderHints();
      loadPhoto(target);
    } else {
      hints = [];
      shown = 0;
      el('mysteryHints').innerHTML = '';
    }
    updateStats();
    // Never celebrates here even if r.won - this is reopening an already-
    // settled day, not the moment of winning it, and replaying the burst
    // every time someone revisits today's result would cheapen it.
    showResultCard(r.won, null, false);
  }

  /* -- Daily archive ---------------------------------------------------
     Newest first - the day someone just missed is the one they're most
     likely looking for, not the very first puzzle from months back. */
  function renderArchiveList() {
    const box = el('mysteryArchiveList');
    box.innerHTML = '';
    const archive = getArchive();
    const todayNum = dailyNumber(todayStr());
    for (let n = todayNum - 1; n >= 1; n--) {
      const ds = addDays(DAILY_EPOCH, n - 1);
      const entry = archive[ds];
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'mystery-archive-row';
      const day = document.createElement('span');
      day.className = 'mystery-archive-day';
      day.textContent = 'Day ' + n;
      const status = document.createElement('span');
      status.className = 'mystery-archive-status' + (entry ? (entry.won ? ' won' : ' lost') : '');
      status.textContent = entry ? (entry.won ? '✓ Solved in ' + entry.hintsShown : '✕ Missed') : 'Play';
      row.append(day, status);
      row.addEventListener('click', () => newRound('daily', ds));
      box.appendChild(row);
    }
  }

  function openArchive() {
    renderArchiveList();
    clearCountdown();
    el('mysteryRound').hidden = true;
    // The hero photo sits outside #mysteryRound (a DOM sibling, not a
    // child - it's shared with the desktop two-column layout's own
    // grid-area), so toggling that alone leaves today's half-pixelated
    // photo sitting oddly above a list of other days. Hidden along with
    // the round it belongs to instead.
    el('mysteryHero').hidden = true;
    el('mysteryArchive').hidden = false;
  }
  function closeArchive() {
    el('mysteryArchive').hidden = true;
    el('mysteryRound').hidden = false;
    el('mysteryHero').hidden = false;
  }

  function enterDaily() {
    clearCountdown();
    closeArchive();
    const today = todayStr();
    if (getDailyDate() === today) {
      const r = getDailyResult();
      if (r) { renderDailyLocked(r); return; }
    }
    if (roundMode === 'daily' && target && !resolved) { renderHints(); loadPhoto(target); updateStats(); return; }
    newRound('daily');
  }

  function enterEndless() {
    clearCountdown();
    if (roundMode === 'endless' && target && !resolved) { renderHints(); loadPhoto(target); updateStats(); return; }
    newRound('endless');
  }

  function updateTabsUI() {
    el('mysteryTabDaily').setAttribute('aria-pressed', String(mode === 'daily'));
    el('mysteryTabEndless').setAttribute('aria-pressed', String(mode === 'endless'));
    el('mysteryFilters').hidden = mode !== 'endless';
    // Only once a second day genuinely exists to look back on - on Day 1
    // itself the archive would just be an empty list.
    el('mysteryArchiveOpen').hidden = mode !== 'daily' || dailyNumber(todayStr()) <= 1;
  }

  function switchMode(next) {
    if (next === mode && target) return;
    mode = next;
    setModeStore(mode);
    updateTabsUI();
    // A brief landing pulse on the tab that just became active, on top
    // of the thumb's own slide (style.css) - two independent signals for
    // a switch that's often watched on a small, compressed stream feed
    // rather than read closely.
    const activeTab = el(next === 'daily' ? 'mysteryTabDaily' : 'mysteryTabEndless');
    activeTab.classList.remove('anim-pulse');
    void activeTab.offsetWidth;
    activeTab.classList.add('anim-pulse');
    if (mode === 'daily') enterDaily(); else enterEndless();
  }

  function renderFilterChips() {
    const box = el('mysteryFilters');
    box.innerHTML = '';
    for (const b of CATEGORY_BUCKETS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'mystery-chip';
      btn.textContent = b.label;
      btn.setAttribute('aria-pressed', String(b.key === filter));
      btn.addEventListener('click', () => {
        if (filter === b.key) return;
        filter = b.key;
        setFilterStore(filter);
        for (const c of box.children) c.setAttribute('aria-pressed', 'false');
        btn.setAttribute('aria-pressed', 'true');
      });
      box.appendChild(btn);
    }
  }

  // Shared by a wrong guess and the Next hint button, because the cost
  // is identical either way - one hint, so 20 points off the win. The
  // two callers differ only in what they say about it afterwards.
  function revealHint() {
    if (resolved || shown >= hints.length) return false;
    shown += 1;
    renderHints();
    return true;
  }

  // Hidden, not disabled, once the last hint is out - a dead control
  // left on screen only invites another click. The count is on the
  // label because "how much have I got left" is the entire question
  // being asked when someone reaches for this.
  function updateHintBtn() {
    const btn = el('mysteryHint');
    if (!btn) return;
    const left = hints.length - shown;
    btn.hidden = resolved || left <= 0;
    if (left <= 0) return; // about to be hidden - don't leave "(0 left)" behind it
    btn.textContent = left === 1 ? 'Last hint' : 'Next hint (' + left + ' left)';
  }

  function submitGuess(e) {
    e.preventDefault();
    if (resolved) return;
    const val = el('mysteryGuess').value;
    if (!val.trim()) return;

    if (matches(val, target)) {
      endRound(true);
      return;
    }

    if (shown >= hints.length) {
      // Out of hints - this wrong guess just settles it.
      endRound(false);
      return;
    }

    sfx('wrong');
    revealHint();
    el('mysteryFeedback').textContent = 'Not quite — another hint.';
    el('mysteryFeedback').className = 'mystery-feedback';
    el('mysteryGuess').value = '';
    el('mysteryGuess').focus();
  }

  /* -- View wiring ----------------------------------------------------- */

  function openMystery(opts) {
    if (window.GMA) window.GMA.setMenu(false);
    // #searchunit is a single shared node app.js re-parents into whichever
    // view is showing (see app.js's dock()) - goHome() and show() both dock
    // it before finishing, but nothing did here, so a direct or refreshed
    // ?mystery=1 load left it stranded at its raw DOM position (a sibling of
    // #home, not a descendant), floating above this view's own topbar.
    if (window.GMA) window.GMA.dock('home');
    document.body.className = 'view-mystery';
    el('home').hidden = true;
    el('animalview').hidden = true;
    el('partyview').hidden = true;
    el('mysteryview').hidden = false;
    window.scrollTo(0, 0);
    if (!(opts && opts.noPush) && window.GMA) window.GMA.push('?mystery=1');
    updateTabsUI();
    if (mode === 'daily') enterDaily(); else enterEndless();
  }
  window.openMystery = openMystery;

  el('mysteryForm').addEventListener('submit', submitGuess);

  // Focus goes straight back to the input: the hint is something you
  // read on the way to typing, not a place to be left standing.
  el('mysteryHint').addEventListener('click', () => {
    if (!revealHint()) return;
    sfx('hint');
    resetGiveUpArm();
    el('mysteryFeedback').textContent = '';
    el('mysteryFeedback').className = 'mystery-feedback';
    el('mysteryGuess').focus();
  });

  // A wrong guess only costs a hint - giving up on Daily forfeits the
  // entire day's puzzle, so it gets a second-tap confirm (no modal, just
  // a relabelled button) rather than the one-tap Endless already had. The
  // arm clears itself after a few seconds or at the next round. The label
  // swap alone is a sighted-only signal, so it's echoed into the existing
  // aria-live feedback line too - a screen-reader user hears the same
  // "this now costs you the day" warning a sighted player sees.
  el('mysteryGiveUp').addEventListener('click', () => {
    if (resolved) return;
    if (roundMode === 'daily' && !giveUpArmed) {
      giveUpArmed = true;
      sfx('tap');
      el('mysteryGiveUp').textContent = GIVEUP_CONFIRM_LABEL;
      pulse('mysteryGiveUp');
      el('mysteryFeedback').textContent = "Tap again to confirm — you won't get another animal today.";
      el('mysteryFeedback').className = 'mystery-feedback';
      giveUpArmTimer = setTimeout(resetGiveUpArm, 4000);
      return;
    }
    resetGiveUpArm();
    endRound(false);
  });
  el('mysteryNext').addEventListener('click', () => newRound(roundMode));

  // The real animal name always travels with the report (useful for
  // triage), but the on-screen label only names it once the round is
  // actually resolved - showing it earlier would spoil the round the
  // report button sits right in the middle of.
  el('mysteryReport').addEventListener('click', () => {
    if (!window.GMA || typeof GMA.openReport !== 'function' || !target) return;
    const known = resolved;
    GMA.openReport({
      animal: target.n,
      label: known
        ? 'About ' + target.n + ' (Mystery Animal).'
        : "From Mystery Animal - not shown here since the round isn't over, but the animal is attached.",
      wantKind: 'facts',
    });
  });
  // The desktop footer's own Report link (see index.html, .desktop-foot)
  // reuses this exact handler rather than duplicating the mystery-aware
  // context above - simplest to just trigger the real button.
  el('mysteryDesktopReport').addEventListener('click', () => el('mysteryReport').click());

  el('mysteryTabDaily').addEventListener('click', () => switchMode('daily'));
  el('mysteryTabEndless').addEventListener('click', () => switchMode('endless'));

  el('mysteryArchiveOpen').addEventListener('click', openArchive);
  // enterDaily(), not the bare closeArchive() - closeArchive() only
  // toggles visibility, and whatever's sitting in #mysteryRound by this
  // point could be an archived day's result, not today's. enterDaily()
  // re-derives the real current state (today's lock, an in-progress
  // round to resume, or a fresh one) the same way arriving at the Daily
  // tab any other way already does.
  // Hiding #mysteryArchive drops the just-focused Back-to-today button
  // out of the document, so a keyboard user's focus otherwise falls back
  // to <body> - restoring it to #mysteryRound (see its tabindex="-1" in
  // index.html) keeps tabbing picking up where the player actually is,
  // instead of a full restart from the top of the page.
  el('mysteryArchiveClose').addEventListener('click', () => {
    enterDaily();
    el('mysteryRound').focus();
  });
  // Reopens the list rather than resuming today's round underneath it -
  // someone who just replayed one past day is far more likely reaching
  // for another than heading back to today.
  el('mysteryArchiveResultBack').addEventListener('click', openArchive);

  for (const b of document.querySelectorAll('[data-mystery]')) {
    b.addEventListener('click', () => openMystery());
  }

  // The home button's attention-nudge (see .mystery-play's `mystery-nudge`
  // keyframe in style.css) is only for the eye that hasn't found it yet -
  // the moment a real cursor or keyboard focus actually reaches it, it's
  // done its job and shaking on regardless would read as broken.
  const mysteryPlayBtn = document.querySelector('.mystery-play');
  if (mysteryPlayBtn) {
    const settleMysteryPlay = () => mysteryPlayBtn.classList.add('settled');
    mysteryPlayBtn.addEventListener('pointerenter', settleMysteryPlay, { once: true });
    mysteryPlayBtn.addEventListener('focus', settleMysteryPlay, { once: true });
  }
  el('mysteryBack').addEventListener('click', () => {
    clearCountdown();
    if (window.GMA) window.GMA.goHome();
  });

  el('mysteryShareBtn').addEventListener('click', async (e) => {
    e.stopPropagation();   // out of the delegated listener's reach, so it sounds itself
    sfx('tap');
    const text = shareText();
    if (!text) return;
    if (canShareNatively()) {
      try { await navigator.share({ title: 'Guess My Animal', text: text, url: shareUrl() }); }
      catch (err) { /* dismissed, which is not an error */ }
      return;
    }
    setSharePanel(el('mysterySharePanel').hidden);
  });
  el('mysteryShareCopy').addEventListener('click', async () => {
    setSharePanel(false);
    const text = shareText() ? shareText() + '\n' + shareUrl() : shareUrl();
    try {
      await navigator.clipboard.writeText(text);
      el('mysteryCopied').textContent = 'Copied.';
    } catch (err) {
      el('mysteryCopied').textContent = "Couldn't copy — the link is in the address bar.";
    }
  });
  for (const idn of ['mysteryShareWa', 'mysteryShareX', 'mysteryShareFb']) {
    el(idn).addEventListener('click', () => setSharePanel(false));
  }
  document.addEventListener('click', (e) => {
    const share = el('mysteryShare');
    if (share && !share.hidden && !share.contains(e.target)) setSharePanel(false);
  });
  document.addEventListener('keydown', (e) => {
    const panel = el('mysterySharePanel');
    if (e.key === 'Escape' && panel && !panel.hidden) { setSharePanel(false); el('mysteryShareBtn').focus(); }
  });

  renderFilterChips();
  updateTabsUI();
  updateStats();
})();
