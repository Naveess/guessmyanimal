/* The guessing game's pure rules: what a hint says, whether a guess is
 * close enough, what a round is worth, and which animals a category
 * covers. No DOM, no state, no fetches - just the logic several
 * surfaces need to agree on.
 *
 * Party mode has three of those surfaces (the host controls in
 * index.html, the OBS overlay on its own page, and the API endpoints
 * that pick a target server-side), and they have to score and hint
 * identically or the same round means different things in two places.
 *
 * Loaded as a plain <script> before the files that use it (browser
 * global), and via require()/import from Node and Pages Functions -
 * same dual-export shape animals.js and render-data.js already use.
 *
 * NOTE: mystery.js still carries its own copies of near/matches/
 * hintsFor/pointsForHints/CATEGORY_BUCKETS/the pixelation helpers,
 * written before this file existed. They're intentionally identical.
 * Folding mystery.js onto this file is worth doing, but it's a change
 * to a live, working game for no behaviour gain, so it's deliberately
 * not bundled into the party mode build - if you change a rule here,
 * change it there too until that happens.
 */
(function (root) {
  'use strict';

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
  const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');
  const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

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

  // A few region values read as proper nouns they aren't once dropped
  // into "Found in ___." - see mystery.js for the full reasoning.
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

  function hintsFor(a) {
    return [
      "It's a " + a.c.toLowerCase() + '.',
      regionHint(a.r[0]),
      DIET_HINT[a.d] || '',
      cap(a.sz) + ' in size.',
      a.f,
    ];
  }

  const MAX_HINTS = 5;

  // Up to 100 for a first-hint guess, down to a 10-point floor.
  function pointsForHints(hintsShown) {
    return Math.max(100 - (hintsShown - 1) * 20, 10);
  }

  const CATEGORY_BUCKETS = [
    { key: 'all', label: 'All', cats: null },
    { key: 'mammals', label: 'Mammals', cats: ['Mammal'] },
    { key: 'birds', label: 'Birds', cats: ['Bird'] },
    { key: 'reptiles', label: 'Reptiles & Amphibians', cats: ['Reptile', 'Amphibian'] },
    { key: 'sea', label: 'Fish & Sea Life', cats: ['Fish', 'Mollusc', 'Cnidarian', 'Crustacean', 'Echinoderm', 'Sponge'] },
    { key: 'bugs', label: 'Bugs & Crawlers', cats: ['Insect', 'Arachnid', 'Annelid', 'Myriapod', 'Tardigrade'] },
  ];

  function poolFor(key, animals) {
    const bucket = CATEGORY_BUCKETS.find((b) => b.key === key) || CATEGORY_BUCKETS[0];
    if (!bucket.cats) return animals;
    const pool = animals.filter((a) => bucket.cats.includes(a.c));
    return pool.length ? pool : animals;
  }

  // The "blurred photo" mechanic, straight out of mystery.js: never a
  // CSS filter (that ships the real, sharp image to the browser -
  // readable from devtools regardless of what's painted on screen), a
  // genuinely tiny Wikimedia thumbnail instead, stretched back up and
  // rendered pixelated. 0 is a sentinel for "the real, full-size
  // source" - only reachable once a round resolves. See mystery.js's
  // own copy of this comment for the standard-widths citation.
  const PIXEL_WIDTH_STEPS = [20, 40, 60, 120, 0];

  function thumbAtWidth(src, width) {
    const m = /^(.*\/)(\d+)px-([^/]+)$/.exec(src);
    return m ? m[1] + width + 'px-' + m[3] : null;
  }

  // hintsShown counts from 1 (the first hint is always visible), same
  // as the round state every surface already tracks.
  function pixelStepFor(hintsShown) {
    const idx = Math.min(Math.max(hintsShown - 1, 0), PIXEL_WIDTH_STEPS.length - 1);
    return PIXEL_WIDTH_STEPS[idx];
  }

  const GameCore = {
    norm, slugify, near, matches,
    regionHint, hintsFor, MAX_HINTS,
    pointsForHints, CATEGORY_BUCKETS, poolFor,
    PIXEL_WIDTH_STEPS, thumbAtWidth, pixelStepFor,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameCore;
  else root.GameCore = GameCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
