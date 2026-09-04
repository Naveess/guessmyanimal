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
  function hintsFor(a, skipCategory) {
    const list = [
      "It's a " + a.c.toLowerCase() + '.',
      'Found in ' + a.r[0] + '.',
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

  function getDailyResult() {
    try { return JSON.parse(localStorage.getItem(DAILY_RESULT_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setDailyResult(v) {
    try { localStorage.setItem(DAILY_RESULT_KEY, JSON.stringify(v)); } catch (e) {}
  }

  let streak = 0;                 // endless, session-only
  let lifetimeScore = getScore(); // shared across both modes
  let filter = getFilterStore();
  let mode = getModeStore();

  function pointsForHints(hintsShown) {
    return Math.max(100 - (hintsShown - 1) * 20, 10);
  }
  function timeBonus(elapsedMs) {
    if (elapsedMs < 8000) return 15;
    if (elapsedMs < 20000) return 5;
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
  function pickDaily() {
    return ANIMALS[hashStr(todayStr()) % ANIMALS.length];
  }

  /* -- Round state --------------------------------------------------- */

  let target = null;       // the current animal object (from ANIMALS)
  let hints = [];
  let shown = 0;            // hints currently visible, at least 1
  let lastName = null;      // avoid picking the same animal twice running (Endless)
  let resolved = false;     // round already won/given up
  let roundMode = mode;     // which mode the *current* round/state belongs to
  let roundStart = 0;

  function pickEndless() {
    const pool = poolFor(filter);
    let a;
    do { a = pool[Math.floor(Math.random() * pool.length)]; }
    while (pool.length > 1 && a.n === lastName);
    lastName = a.n;
    return a;
  }

  // Same placeholder the animal page uses to reset its own #photo/#photoBg
  // between animals - a transparent 1x1, never an empty src, so a stale
  // or half-loaded image never flashes between rounds.
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

  const BLUR_STEPS = [20, 14, 9, 5, 0];
  function applyBlur() {
    const img = el('mysteryPhotoImg');
    if (!img) return;
    const idx = Math.min(Math.max(shown - 1, 0), BLUR_STEPS.length - 1);
    img.style.filter = 'blur(' + (resolved ? 0 : BLUR_STEPS[idx]) + 'px)';
  }

  // Mirrors app.js's own hero reset in show(): wipe back to the loading
  // state before the new round's fetch goes out, or the previous
  // animal's photo (and blur level) would sit there briefly looking like
  // this round's answer.
  function resetHero() {
    const hero = el('mysteryHero');
    hero.classList.remove('has-photo', 'revealed');
    hero.classList.add('is-loading');
    const img = el('mysteryPhotoImg');
    img.onerror = null;
    img.alt = '';
    img.src = BLANK;
    img.style.filter = '';
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
      const img = el('mysteryPhotoImg');
      img.onerror = () => { img.onerror = null; el('mysteryHero').classList.remove('has-photo'); };
      img.src = src;
      el('mysteryPhotoBg').src = src;
      el('mysteryHero').classList.add('has-photo');
      applyBlur();
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
    applyBlur();
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
  }

  /* -- Milestones: a quiet toast, not a new component ----------------
     Reuses the same "set text, retrigger `rise`" trick #mysteryResult
     already uses below - one keyframe, no new motion primitive. */
  const MILESTONES = [5, 10, 25, 50, 100];
  let toastTimer = null;
  function toast(text) {
    const t = el('mysteryMilestone');
    clearTimeout(toastTimer);
    t.classList.remove('anim-rise');
    t.textContent = text;
    void t.offsetWidth;
    t.classList.add('anim-rise');
    toastTimer = setTimeout(() => { t.textContent = ''; }, 2500);
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

  /* -- Sharing (Daily result only) ------------------------------------
     Same panel pattern app.js already uses for the animal page itself
     (native share sheet on a coarse pointer, an explicit WhatsApp/X/
     Facebook/copy panel otherwise) - duplicated here with its own ids
     since this file already owns its view independently, the same call
     this file made for typo tolerance above. */

  function shareGrid(r) {
    let s = '';
    for (let i = 0; i < r.hintsTotal; i++) s += (r.won && i === r.hintsShown - 1) ? '🟩' : '⬜';
    return s;
  }
  function shareText(r) {
    return 'GuessMyAnimal #' + dailyNumber(r.date) + '\n' + shareGrid(r);
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
    const r = getDailyResult();
    if (!r) return;
    const url = shareUrl();
    const text = shareText(r);
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

  /* -- Round lifecycle -------------------------------------------------
     A third view alongside home and the animal page, sharing the same
     body-class + hidden-toggle pattern app.js's goHome()/show() use -
     and, since it needs to hand back to those, the same URL-driven
     routing too. app.js's routeFromURL() calls window.openMystery when
     it sees ?mystery=1 (including on the browser's own back button);
     GMA.push/GMA.goHome/GMA.setMenu/GMA.loadSummary/GMA.dock are what
     this file needs back from that side. */

  const GIVEUP_LABEL = 'Give up, show the answer';
  const GIVEUP_CONFIRM_LABEL = "Tap again to give up — you won't get another today";
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

  function newRound(forMode) {
    roundMode = forMode;
    resolved = false;
    const bucket = forMode === 'endless' ? bucketOf(filter) : null;
    const skipCategory = !!(bucket && bucket.cats && bucket.cats.length === 1);
    target = forMode === 'daily' ? pickDaily() : pickEndless();
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
    el('mysteryResultNote').hidden = true;
    el('mysteryCountdown').hidden = true;
    el('mysteryShare').hidden = true;
    resetGiveUpArm();
    clearCountdown();
    renderHints();
    resetHero();
    dealHero();
    loadPhoto(target);
    updateStats();
    el('mysteryGuess').focus();
  }

  function showResultCard(won) {
    resolved = true;
    applyBlur();
    revealHero();
    el('mysteryAnswerEmoji').textContent = target.e || '🐾';
    el('mysteryAnswerName').textContent = target.n;
    el('mysteryResult').hidden = false;
    el('mysteryResult').classList.remove('anim-rise');
    void el('mysteryResult').offsetWidth;
    el('mysteryResult').classList.add('anim-rise');

    if (roundMode === 'daily') {
      el('mysteryNext').hidden = true;
      const note = el('mysteryResultNote');
      note.hidden = false;
      note.textContent = won
        ? 'Solved in ' + shown + (shown === 1 ? ' hint.' : ' hints.')
        : 'Streak reset — see you tomorrow.';
      el('mysteryCountdown').hidden = false;
      startCountdown();
      renderDailyShare();
    } else {
      el('mysteryNext').hidden = false;
      el('mysteryResultNote').hidden = true;
      el('mysteryCountdown').hidden = true;
      el('mysteryShare').hidden = true;
    }
  }

  function endRound(won) {
    resolved = true;
    el('mysteryForm').hidden = true;
    el('mysteryGiveUp').hidden = true;

    const pts = won ? pointsForHints(shown) + timeBonus(Date.now() - roundStart) : 0;

    if (roundMode === 'endless') {
      if (won) {
        streak += 1;
        lifetimeScore += pts;
        setScore(lifetimeScore);
        if (streak > getBest()) setBest(streak);
        maybeToast(streak);
        el('mysteryFeedback').textContent = 'Got it — +' + pts + ' points.';
        el('mysteryFeedback').className = 'mystery-feedback good';
      } else {
        streak = 0;
        el('mysteryFeedback').textContent = "That's the one — streak reset.";
        el('mysteryFeedback').className = 'mystery-feedback';
      }
    } else {
      const today = todayStr();
      let dstreak = won ? (getDailyDate() === addDays(today, -1) ? getDailyStreak() + 1 : 1) : 0;
      if (won) {
        lifetimeScore += pts;
        setScore(lifetimeScore);
        maybeToast(dstreak);
        el('mysteryFeedback').textContent = 'Got it — +' + pts + ' points.';
        el('mysteryFeedback').className = 'mystery-feedback good';
      } else {
        el('mysteryFeedback').textContent = "That's the one.";
        el('mysteryFeedback').className = 'mystery-feedback';
      }
      setDailyStreak(dstreak);
      if (dstreak > getDailyBest()) setDailyBest(dstreak);
      setDailyDate(today);
      setDailyResult({ date: today, won, hintsShown: shown, hintsTotal: hints.length, animalName: target.n });
    }

    updateStats();
    showResultCard(won);
  }

  // Reconstructs today's already-played Daily round from storage - the
  // hint list is re-derived from the animal (never itself stored) and
  // shown in full since none of it is secret once the day is settled.
  function renderDailyLocked(r) {
    roundMode = 'daily';
    target = ANIMALS.find((a) => a.n === r.animalName) || null;
    resolved = true;
    el('mysteryForm').hidden = true;
    el('mysteryGiveUp').hidden = true;
    el('mysteryFeedback').textContent = '';
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
    showResultCard(r.won);
  }

  function enterDaily() {
    clearCountdown();
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
  }

  function switchMode(next) {
    if (next === mode && target) return;
    mode = next;
    setModeStore(mode);
    updateTabsUI();
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

    shown += 1;
    renderHints();
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
    el('mysteryview').hidden = false;
    window.scrollTo(0, 0);
    if (!(opts && opts.noPush) && window.GMA) window.GMA.push('?mystery=1');
    updateTabsUI();
    if (mode === 'daily') enterDaily(); else enterEndless();
  }
  window.openMystery = openMystery;

  el('mysteryForm').addEventListener('submit', submitGuess);
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
      el('mysteryGiveUp').textContent = GIVEUP_CONFIRM_LABEL;
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

  el('mysteryTabDaily').addEventListener('click', () => switchMode('daily'));
  el('mysteryTabEndless').addEventListener('click', () => switchMode('endless'));

  for (const b of document.querySelectorAll('[data-mystery]')) {
    b.addEventListener('click', () => openMystery());
  }
  el('mysteryBack').addEventListener('click', () => {
    clearCountdown();
    if (window.GMA) window.GMA.goHome();
  });

  el('mysteryShareBtn').addEventListener('click', async (e) => {
    e.stopPropagation();
    const r = getDailyResult();
    if (!r) return;
    if (canShareNatively()) {
      try { await navigator.share({ title: 'Guess My Animal', text: shareText(r), url: shareUrl() }); }
      catch (err) { /* dismissed, which is not an error */ }
      return;
    }
    setSharePanel(el('mysterySharePanel').hidden);
  });
  el('mysteryShareCopy').addEventListener('click', async () => {
    setSharePanel(false);
    const r = getDailyResult();
    const text = r ? shareText(r) + '\n' + shareUrl() : shareUrl();
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
