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

  function hintsFor(a) {
    return [
      "It's a " + a.c.toLowerCase() + '.',
      'Found in ' + a.r[0] + '.',
      DIET_HINT[a.d] || '',
      cap(a.sz) + ' in size.',
      a.f,
    ];
  }

  /* -- Score & streak ----------------------------------------------------
     Local only, no accounts - the same standing choice the rest of the
     site already makes for theme and recents. Score per round rewards
     guessing early: 100 on the first hint, down to a 10-point floor by
     the last. Streak is the headline stat, Wordle-style - it's the one
     that makes "just one more" happen. */

  const BEST_KEY = 'gma-mystery-best';
  const SCORE_KEY = 'gma-mystery-score';

  function getBest() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch (e) { return 0; } }
  function getScore() { try { return Number(localStorage.getItem(SCORE_KEY)) || 0; } catch (e) { return 0; } }
  function setBest(v) { try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {} }
  function setScore(v) { try { localStorage.setItem(SCORE_KEY, String(v)); } catch (e) {} }

  let streak = 0;
  let lifetimeScore = getScore();

  function pointsForHints(hintsShown) {
    return Math.max(100 - (hintsShown - 1) * 20, 10);
  }

  /* -- Round state --------------------------------------------------- */

  let target = null;       // the current animal object (from ANIMALS)
  let hints = [];
  let shown = 0;            // hints currently visible, at least 1
  let lastName = null;      // avoid picking the same animal twice running
  let resolved = false;     // round already won/given up

  function pickAnimal() {
    let a;
    do { a = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]; }
    while (ANIMALS.length > 1 && a.n === lastName);
    lastName = a.n;
    return a;
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
  }

  function updateStats() {
    el('mysteryStreak').textContent = String(streak);
    el('mysteryBest').textContent = String(getBest());
    el('mysteryScore').textContent = String(lifetimeScore);
  }

  function newRound() {
    resolved = false;
    target = pickAnimal();
    hints = hintsFor(target);
    shown = 1;
    el('mysteryGuess').value = '';
    el('mysteryForm').hidden = false;
    el('mysteryGiveUp').hidden = false;
    el('mysteryFeedback').textContent = '';
    el('mysteryFeedback').className = 'mystery-feedback';
    el('mysteryResult').hidden = true;
    renderHints();
    updateStats();
    el('mysteryGuess').focus();
  }

  function endRound(won) {
    resolved = true;
    el('mysteryForm').hidden = true;
    el('mysteryGiveUp').hidden = true;

    if (won) {
      const pts = pointsForHints(shown);
      streak += 1;
      lifetimeScore += pts;
      setScore(lifetimeScore);
      if (streak > getBest()) setBest(streak);
      el('mysteryFeedback').textContent = 'Got it — +' + pts + ' points.';
      el('mysteryFeedback').className = 'mystery-feedback good';
    } else {
      streak = 0;
      el('mysteryFeedback').textContent = "That's the one — streak reset.";
      el('mysteryFeedback').className = 'mystery-feedback';
    }
    updateStats();

    el('mysteryAnswerEmoji').textContent = target.e || '🐾';
    el('mysteryAnswerName').textContent = target.n;
    el('mysteryResult').hidden = false;
    el('mysteryResult').classList.remove('anim-rise');
    void el('mysteryResult').offsetWidth;
    el('mysteryResult').classList.add('anim-rise');
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

  /* -- View wiring -----------------------------------------------------
     A third view alongside home and the animal page, sharing the same
     body-class + hidden-toggle pattern app.js's goHome()/show() use -
     and, since it needs to hand back to those, the same URL-driven
     routing too. app.js's routeFromURL() calls window.openMystery when
     it sees ?mystery=1 (including on the browser's own back button);
     GMA.push/GMA.goHome (exposed at the bottom of app.js) are the two
     things this file needs back from that side. */

  function openMystery(opts) {
    if (window.GMA) window.GMA.setMenu(false);
    document.body.className = 'view-mystery';
    el('home').hidden = true;
    el('animalview').hidden = true;
    el('mysteryview').hidden = false;
    window.scrollTo(0, 0);
    if (!(opts && opts.noPush) && window.GMA) window.GMA.push('?mystery=1');
    if (!target) newRound(); else updateStats();
  }
  window.openMystery = openMystery;

  el('mysteryForm').addEventListener('submit', submitGuess);
  el('mysteryGiveUp').addEventListener('click', () => { if (!resolved) endRound(false); });
  el('mysteryNext').addEventListener('click', newRound);

  for (const b of document.querySelectorAll('[data-mystery]')) {
    b.addEventListener('click', () => openMystery());
  }
  el('mysteryBack').addEventListener('click', () => {
    if (window.GMA) window.GMA.goHome();
  });

  updateStats();
})();
