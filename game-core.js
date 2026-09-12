/* The guessing game's pure rules: what a hint says, whether a guess is
 * close enough, what a round is worth, and which animals a category
 * covers. No DOM, no state, no fetches - just the logic several
 * surfaces need to agree on.
 *
 * Party mode has three of those surfaces (the host and player controls
 * in index.html, the streamer page's Twitch chat reader, and the API
 * endpoints that pick a target and judge guesses server-side), and they
 * have to score and hint identically or the same round means different
 * things in three places.
 *
 * looksLikeAGuess/chatMatches live here rather than in the page that
 * reads chat because the server judges chat guesses too - a matcher used
 * by only one side of that would be the bug it's there to prevent.
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

  // A public chat is much noisier than a solo guess box, and every
  // message there would otherwise reach the fuzzy matcher - which is
  // tolerant by design ("gorila" should count) and so is exactly the
  // wrong thing to point at general conversation. Filtered first, costs
  // nothing:
  const MAX_CHAT_GUESS_LEN = 40;
  function looksLikeAGuess(text) {
    const t = String(text || '').trim();
    if (!t || t.length > MAX_CHAT_GUESS_LEN) return false;
    if (t[0] === '!' || t[0] === '/') return false;      // bot commands
    if (/https?:\/\//i.test(t)) return false;             // links
    if (/^@/.test(t)) return false;                        // replies to other chatters
    return true;
  }

  // Chat doesn't answer the way a guess box does. "leopard" is a guess
  // and so is "is it a leopard?", and refusing the second one makes the
  // game feel broken to everyone watching. So a bare message still gets
  // the normal typo tolerance above, and a longer one is additionally
  // scanned for the animal's name as a complete run of words.
  //
  // Deliberately exact inside a sentence, never fuzzy: the pool has
  // animals called Swift, Crane, Seal and Ray, and fuzzy-matching those
  // against ordinary conversation would end rounds nobody was guessing
  // in - a much worse failure than a missed phrasing, since the first
  // correct answer takes the round outright.
  function chatMatches(text, a) {
    if (matches(text, a)) return true;
    const words = norm(text).split(' ').filter(Boolean);
    const names = [a.n].concat(a.a || []).map(norm);
    for (const name of names) {
      const nw = name.split(' ').filter(Boolean);
      if (!nw.length || nw.length > words.length) continue;
      for (let i = 0; i + nw.length <= words.length; i++) {
        if (nw.every((w, j) => w === words[i + j])) return true;
      }
    }
    return false;
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

  function aOrAn(word) {
    return /^[aeiou]/i.test(word) ? 'an' : 'a';
  }

  const ACTIVE_HINT = {
    day: "It's active mostly during the day.",
    night: "It's active mostly at night.",
    both: "It's active both day and night.",
  };

  // "Solitary" is the odd one out - an adjective, not a group noun like
  // the rest of these values - so it gets its own sentence shape rather
  // than forcing it through the generic "they live in ___" every other
  // value takes cleanly.
  const SOCIAL_HINT = {
    Solitary: 'It lives a solitary life, without a group.',
    Prides: 'They live in prides.',
    Packs: 'They travel in packs.',
    Herds: 'They gather in herds.',
    Groups: 'They stick together in groups.',
    Troops: 'They live in troops.',
    Mobs: 'They gather in mobs.',
    Flocks: 'They gather in flocks.',
    Colonies: 'They live in colonies.',
    Pods: 'They travel in pods.',
    Clans: 'They live in clans.',
    Families: 'They stick close to family groups.',
    Pairs: "They're usually seen in pairs.",
    Blooms: 'A group of them is called a bloom.',
  };

  // The two covering values that don't fit "Its body is covered in
  // ___." at all - a jellyfish has nothing there to cover, and coral is
  // its own skeleton rather than something wearing one.
  const COVERING_HINT = {
    None: 'It has no fur, feathers or shell to speak of.',
    Skeleton: "It's built from its own skeleton, not covered by one.",
  };
  function coveringHint(cv) {
    return COVERING_HINT[cv] || ('Its body is covered in ' + cv.toLowerCase() + '.');
  }

  function legsHint(lg) {
    return lg === 0 ? 'It has no legs.' : 'It has ' + lg + ' legs.';
  }

  const DANGER_HINT = {
    no: "It's not considered dangerous to humans.",
    some: 'It can be dangerous to humans in some situations.',
    yes: "It's considered dangerous to humans.",
  };

  // Only worth a hint when it's true - "it can't fly" is true of most of
  // the pool and says nothing, the same reason a "no" on the pet check
  // isn't a hint either, right below.
  function petHint(p, dm) {
    if (dm) return "It's a domesticated animal.";
    if (p === 'common') return "It's commonly kept as a pet.";
    if (p === 'some') return "It's sometimes kept as a pet.";
    return null;
  }

  function coloursHint(co) {
    const list = co.length > 1 ? co.slice(0, -1).join(', ') + ' and ' + co[co.length - 1] : co[0];
    return 'Its colours include ' + list + '.';
  }

  // Deterministic, seeded from the animal's own slug rather than
  // Math.random() - party mode and the streamer page each build their
  // hint list independently in their own tab from the same target slug,
  // so a truly random pick would show two different hint orders for the
  // same round on the host's screen and a player's.
  function seedFromString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededPick(list, seed, n) {
    const rand = mulberry32(seed);
    const pool = list.slice();
    const picked = [];
    for (let k = 0; k < n && pool.length; k++) picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    return picked;
  }

  // Broad to specific in three tiers, then the fact last - never the
  // flat, fixed-order list this used to be (class, region, diet, size,
  // fact for every animal alike - hint 1 was "It's a mammal" for 48% of
  // the pool, and a plain first-hint collision of 12 animals sharing all
  // four non-fact hints verbatim - Zebra, Gorilla, Camel and friends).
  // Which *field* fills each tier still varies animal to animal (seeded,
  // not fixed), so two mammals don't open on the same sentence either.
  //
  // skipCategory drops the class hint from the whole pool, not just
  // hint 1 - a single-category room (Mammals, Birds) already told
  // everyone the class, so it can't appear anywhere in the list, same
  // reasoning mystery.js's own skipCategory already uses. A class hint
  // that would itself satisfy matches() (Sea sponge's alias "sponge",
  // the Tardigrade class of the same name) is dropped the same way, for
  // the same reason - at that point it isn't a redundant hint, it's the
  // answer.
  function hintsFor(a, skipCategory) {
    const seed = seedFromString(slugify(a.n));

    const tier1 = [];
    if (!skipCategory && !matches(a.c, a)) tier1.push("It's " + aOrAn(a.c) + ' ' + a.c.toLowerCase() + '.');
    tier1.push(regionHint(a.r[0]), cap(a.sz) + ' in size.', legsHint(a.lg), coveringHint(a.cv));

    const tier2 = [DIET_HINT[a.d], ACTIVE_HINT[a.ac], SOCIAL_HINT[a.so]].filter(Boolean);
    if (a.fl) tier2.push('It can fly.');
    if (a.sw) tier2.push('It can swim.');
    if (a.eg) tier2.push('It lays eggs.');

    const tier3 = [coloursHint(a.co), 'It typically lives ' + a.lf + '.', DANGER_HINT[a.dg]].filter(Boolean);
    const pet = petHint(a.p, a.dm);
    if (pet) tier3.push(pet);

    return [
      ...seededPick(tier1, seed ^ 0x1, 2),
      ...seededPick(tier2, seed ^ 0x2, 1),
      ...seededPick(tier3, seed ^ 0x3, 1),
      a.f,
    ];
  }

  const MAX_HINTS = 5;

  // Twitch stream mode only (see next.js/create.js) - local/QR Party
  // Mode has no deadline and this is never called for it. Starts
  // generous and tightens as the stream goes on, floored rather than
  // tightening forever so round 40 is still a fair fight, not a
  // reflex test. Tunable: every number below is a starting point, not
  // a constraint the rest of the system depends on.
  function roundSeconds(roundNo) {
    return Math.max(45, Math.min(90, 90 - (roundNo - 1) * 5));
  }

  // The fraction of the round's total time still REMAINING at which
  // each hint unlocks - hint 1 is free from the start (remaining 1.0),
  // hint 5 only once the round is nearly out. Expressed as remaining
  // rather than elapsed because that's what a countdown display already
  // tracks, so the same number drives both the timer's colour steps
  // (see streamer.js) and this schedule with no unit conversion between
  // them.
  const HINT_UNLOCK_AT = [1, 0.65, 0.45, 0.28, 0.14];

  // Derives how many hints SHOULD be visible from elapsed time alone,
  // server-side - this is what makes hint reveal clock-driven without
  // a client ever polling a "reveal hint" endpoint on a timer, which
  // would just be a write-race against the host's own manual button.
  // The caller takes max(this, whatever's actually stored) so the
  // manual button can still jump ahead of the clock, never behind it.
  function hintsFromElapsed(elapsedMs, durationMs) {
    if (!(durationMs > 0)) return MAX_HINTS;
    const remaining = Math.max(0, 1 - elapsedMs / durationMs);
    let shown = 1;
    for (let i = 1; i < HINT_UNLOCK_AT.length; i++) {
      if (remaining <= HINT_UNLOCK_AT[i]) shown = i + 1;
    }
    return Math.min(shown, MAX_HINTS);
  }

  // Up to 100 for a first-hint guess, down a step of 20 per hint after
  // that. The formula's own floor is 10, but MAX_HINTS never reaches
  // enough hints to hit it - 5 hints lands on 20, the real floor in
  // practice.
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

  // Whether a category key maps to exactly one real class - "Mammals"
  // and "Birds" do, so the class hint (see hintsFor above) would just
  // restate a chip the player already picked. Shared rather than
  // recomputed per surface: party.js and streamer.js both need this to
  // pass skipCategory into hintsFor, the same check mystery.js's own
  // bucketOf already makes against its own, separately-forked copy of
  // this same table.
  function skipCategoryFor(key) {
    const bucket = CATEGORY_BUCKETS.find((b) => b.key === key);
    return !!(bucket && bucket.cats && bucket.cats.length === 1);
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
    looksLikeAGuess, chatMatches, MAX_CHAT_GUESS_LEN,
    regionHint, hintsFor, MAX_HINTS,
    roundSeconds, hintsFromElapsed,
    pointsForHints, CATEGORY_BUCKETS, poolFor, skipCategoryFor,
    PIXEL_WIDTH_STEPS, thumbAtWidth, pixelStepFor,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = GameCore;
  else root.GameCore = GameCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
