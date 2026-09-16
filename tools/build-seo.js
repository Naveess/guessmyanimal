// Generates sitemap.xml and functions/seo-meta.json from animals.js.
//
// The site itself never changes URL shape - animals stay at /?a=<slug>,
// exactly as they've always been shareable and linkable. This script only
// adds what a crawler needs on top: a list of every URL that exists, and a
// real per-animal <title>/<meta description> for the Function in
// functions/index.js to inject, instead of every animal sharing the one
// generic homepage title.
//
// Run: node tools/build-seo.js (or npm run seo). Re-run whenever animals.js
// changes - nothing else does this automatically.

const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { answers, glanceGroups, ICONS } = require('../render-data.js');
const { relatedFor } = require('../related.js');
const { CATEGORY_BUCKETS } = require('../game-core.js');

const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;
// browse.html is generated whole by this script (see below), not hand-
// edited, so its own style.css link needs this kept in step by hand -
// same manual-lockstep convention index.html/about.html/privacy.html/
// sw.js already use for every other shell asset. Bump this alongside
// them, then re-run node tools/build-seo.js.
const STYLE_VERSION = '20260916-5';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Mirrors app.js's icon(): same wrapper attributes, same path data from
// render-data.js, just built as a string instead of a DOM node.
function iconSvg(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// Mirrors renderAnswers()'s DOM exactly: a row per answer, the .ans-gap
// spacer inserted before index 4, same class names, same --i custom
// property the CSS stagger reads. If this drifts from app.js's actual
// output, a real visitor sees the baked version flash into the
// client-rendered one on load - keep the two in step.
function answersHtml(a) {
  const rows = answers(a);
  let html = '';
  rows.forEach(([k, v, state], i) => {
    if (i === 4) html += '<div class="ans-gap" role="presentation"></div>';
    const cls = 'pill' + (state ? ' ' + state : '');
    html += `<div class="row" role="listitem" style="--i:${i}"><span class="k">${escapeHtml(k)}</span><span class="${cls}">${escapeHtml(v)}</span></div>`;
  });
  return html;
}

// Mirrors renderGlance()'s DOM exactly: same chip shape, same
// appearance/behaviour split with the .glance-gap spacer between them.
function glanceHtml(a) {
  const { appearance, behaviour } = glanceGroups(a);
  let i = 0;
  const chip = ([ic, key, value]) => {
    const keyHtml = key ? `<span class="gk">${escapeHtml(key)}</span>` : '';
    const html = `<div class="gchip" role="listitem" style="--i:${i}">${iconSvg(ic)}${keyHtml}<b>${escapeHtml(value)}</b></div>`;
    i++;
    return html;
  };
  return appearance.map(chip).join('') + '<div class="glance-gap" role="presentation"></div>' + behaviour.map(chip).join('');
}

// Mirrors renderRelated()'s DOM exactly: same .related-item shape, same
// real <a href> - this is the version a crawler actually sees, so it has
// to be real anchors here too, not just in the client-rendered copy.
function relatedHtml(a) {
  return relatedFor(a, ANIMALS)
    .map((b) => {
      const slug = slugify(b.n);
      return `<a class="related-item" href="/?a=${slug}"><span class="r-emoji" aria-hidden="true">${b.e || '🐾'}</span>${escapeHtml(b.n)}</a>`;
    })
    .join('');
}

const meta = {};
const urls = [];
let longest = 0;

for (const a of ANIMALS) {
  const slug = slugify(a.n);
  const lower = a.n.toLowerCase();
  // "Is a elephant dangerous?" - the indefinite article has to match the
  // sound the name starts with, not just its spelling ("a hour" is wrong
  // for the same reason "an elephant" is right), but every name in this
  // dataset is a plain animal noun with no silent-consonant exceptions,
  // so a vowel-letter check is the whole rule here.
  const article = /^[aeiou]/i.test(lower) ? 'an' : 'a';

  const title = `${a.n} — is it dangerous? | Guess My Animal`;

  let description = `${a.f} Is ${article} ${lower} dangerous, and could you keep one as a pet? Get instant answers on Guess My Animal.`;
  if (description.length > MAX_DESC) {
    // Keep the hand-written fact whole - it's the one truly unique part of
    // the description - and drop the templated tail instead of chopping
    // mid-sentence.
    description = `${a.f} Is ${article} ${lower} dangerous? Get the answer on Guess My Animal.`;
  }
  if (description.length > MAX_DESC) {
    // The fact alone is already long (e.g. Poison dart frog). Drop the
    // templated tail entirely rather than truncate mid-sentence - the fact
    // by itself is still a perfectly good description.
    description = a.f;
  }
  if (description.length > MAX_DESC) {
    // The fact itself runs past the limit - truncate at the last whole
    // word inside the budget, never mid-word.
    const cut = description.slice(0, MAX_DESC - 1);
    description = cut.slice(0, cut.lastIndexOf(' ')) + '…';
  }
  longest = Math.max(longest, description.length);

  // Same fallback app.js's wikiTitle() uses: an explicit override, or the
  // name with spaces turned to underscores. Kept here too so the Function
  // can ask Wikipedia for a share-preview photo without needing to load
  // the whole animals.js dataset itself.
  const wikiTitle = a.w || a.n.replace(/ /g, '_');

  meta[slug] = {
    title,
    description,
    wikiTitle,
    name: a.n,
    emoji: a.e || '',
    kicker: `${a.c} · ${a.r[0]}`,
    fact: a.f,
    wikiHref: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(wikiTitle),
    answersHtml: answersHtml(a),
    glanceHtml: glanceHtml(a),
    relatedHtml: relatedHtml(a),
  };
  urls.push(`${SITE}/?a=${slug}`);
}

if (longest > MAX_DESC) {
  console.warn(`warning: longest description is ${longest} chars, above the ${MAX_DESC} target - check animals.js facts for an unusually long one.`);
}

fs.writeFileSync(
  path.join(__dirname, '..', 'functions', 'seo-meta.json'),
  JSON.stringify(meta, null, 1)
);

// Cloudflare Pages' clean-URLs feature 308-redirects /about.html to
// /about, so the sitemap should point straight at the URL that actually
// serves, not the one that immediately bounces.
const staticUrls = [SITE + '/', SITE + '/about', SITE + '/privacy', SITE + '/browse'];
const lastmod = new Date().toISOString().slice(0, 10);
const all = staticUrls.concat(urls);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all
  .map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`)
  .join('\n')}\n</urlset>\n`;

fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'), xml);

// browse.html: the one page listing every animal. Everything else on the
// site is reached by typing a guess into search - fine for a returning
// visitor who already knows what they want, useless for a crawler (or a
// new visitor) with nothing to type yet. Generated as a real static file,
// not client-rendered, so the full list of 438 links exists with no JS
// required - the same reasoning answersHtml/glanceHtml/relatedHtml are
// baked server-side for a live animal page, just for a page that's
// static end to end instead of rewritten per-request.
function browseHtml() {
  const groups = {};
  for (const a of ANIMALS) {
    const letter = a.n[0].toUpperCase();
    (groups[letter] = groups[letter] || []).push(a);
  }
  const letters = Object.keys(groups).sort();
  for (const l of letters) groups[l].sort((x, y) => x.n.localeCompare(y.n));

  // Same bucket table Party Mode's own category picker uses (game-core.js)
  // - one canonical mapping from an animal's real class (a.c) to a filter
  // key, not a second, divergent taxonomy invented for this page alone.
  const bucketKeyFor = (a) => {
    const b = CATEGORY_BUCKETS.find((bk) => bk.cats && bk.cats.includes(a.c));
    return b ? b.key : 'all';
  };
  const catChips = CATEGORY_BUCKETS
    .map((b) => `<button type="button" data-cat-filter="${b.key}" aria-pressed="${b.key === 'all'}">${escapeHtml(b.label)}</button>`)
    .join('');

  const jump = letters.map((l) => `<a href="#${l}">${l}</a>`).join('');

  const itemHtml = (a) => `<li data-cat="${bucketKeyFor(a)}"><a href="/?a=${slugify(a.n)}">${escapeHtml(a.n)}</a></li>`;

  // Letters past this size get chunked into labelled sub-groups so a
  // jump to "S" (60+ names) isn't one undifferentiated column to scan -
  // small letters stay a plain flat list, since a sub-head over three
  // names is its own kind of noise. Fixed-size chunks rather than exact
  // second-letter boundaries, so every sub-group is a similar, readable
  // size regardless of how lumpy the real second-letter distribution is.
  const SUBDIVIDE_AT = 20;
  const CHUNK_SIZE = 14;

  const sections = letters
    .map((l) => {
      const items = groups[l];
      const countTag = `<span class="sr-only">, ${items.length} animal${items.length === 1 ? '' : 's'}</span>`;
      let body;
      if (items.length > SUBDIVIDE_AT) {
        const chunks = [];
        for (let i = 0; i < items.length; i += CHUNK_SIZE) chunks.push(items.slice(i, i + CHUNK_SIZE));
        body = `<div class="atoz-subgroups">${chunks
          .map((chunk) => {
            const label = escapeHtml(chunk[0].n.slice(0, 2)) + '–' + escapeHtml(chunk[chunk.length - 1].n.slice(0, 2));
            return `<div class="atoz-subgroup"><h3 class="label atoz-sublabel">${label}</h3><ul class="atoz-list">${chunk.map(itemHtml).join('')}</ul></div>`;
          })
          .join('')}</div>`;
      } else {
        body = `<ul class="atoz-list">${items.map(itemHtml).join('')}</ul>`;
      }
      return `<section class="atoz-group"><h2 class="atoz-letter" id="${l}">${l}${countTag}</h2>${body}</section>`;
    })
    .join('\n  ');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Every animal, A to Z — Guess My Animal</title>
<meta name="description" content="All ${ANIMALS.length} animals on Guess My Animal, listed A to Z. Pick one to see if it's dangerous, if you could keep it as a pet, and everything else people ask.">
<meta name="theme-color" content="#ffce1f">

<meta property="og:title" content="Every animal, A to Z — Guess My Animal">
<meta property="og:description" content="All ${ANIMALS.length} animals on Guess My Animal, listed A to Z.">
<meta property="og:type" content="article">
<meta property="og:image" content="og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">

<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
<link rel="preload" href="fonts/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<script>
(function(){try{var t=localStorage.getItem('gma-theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
<link rel="stylesheet" href="style.css?v=${STYLE_VERSION}">
<!-- Google AdSense (Auto ads) - client ca-pub-2495070274777193. -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2495070274777193"
     crossorigin="anonymous"></script>
<!-- Funding Choices - see privacy.html for what this pair does. -->
<script async src="https://fundingchoicesmessages.google.com/i/pub-2495070274777193?ers=1"></script>
<script>
(function() {
  function signalGooglefcPresent() {
    if (!window.frames['googlefcPresent']) {
      if (document.body) {
        var iframe = document.createElement('iframe');
        iframe.style = 'width: 0; height: 0; border: none; z-index: -1000; left: -1000px; top: -1000px;';
        iframe.style.display = 'none';
        iframe.name = 'googlefcPresent';
        document.body.appendChild(iframe);
      } else {
        setTimeout(signalGooglefcPresent, 0);
      }
    }
  }
  signalGooglefcPresent();
})();
</script>
</head>
<body class="view-page">

<!-- First focusable element on purpose: a keyboard/screen-reader user
     otherwise tabs through the corner menu, sound toggle, and theme
     switch before ever reaching the 438-link list that IS this page. -->
<a class="skip-link" href="#main">Skip to main content</a>

<!-- Same corner menu as index.html (see menu.js for why Mystery Animal
     and Report a problem are plain links here rather than the buttons
     that open dialogs on the home page). -->
<nav class="menu" id="menu">
  <button class="menu-btn" id="menuBtn" type="button"
          aria-label="Menu" aria-expanded="false" aria-controls="menuPanel">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M4 7h16M4 12h16M4 17h16"/>
    </svg>
  </button>
  <div class="menu-panel" id="menuPanel" hidden>
    <a class="menu-item" href="about.html"><span class="mi-full">About the game</span><span class="mi-short">About</span></a>
    <a class="menu-item" href="browse.html"><span class="mi-full">Browse all animals</span><span class="mi-short">Browse</span></a>
    <a class="menu-item" href="./?mystery=1">Mystery Animal</a>
    <a class="menu-item" href="./?party=1"><span class="mi-full">Party Mode</span><span class="mi-short">Party</span> <span class="beta-tag">beta</span></a>
    <a class="menu-item" href="streamer.html"><span class="mi-full">Twitch stream mode</span><span class="mi-short">Stream</span> <span class="beta-tag">beta</span></a>
    <!-- Site-wide quick search - inline in the nav bar itself (grows in
         place, doesn't drop a second box underneath it), not a
         navigation to index.html's real search box, so it works from
         any of these standalone pages. See menu.js. -->
    <div class="navsearch" id="navSearch">
      <button class="menu-item" id="navSearchToggle" type="button"
              aria-label="Search animals" aria-expanded="false" aria-controls="navSearchRow">
        <span class="mag" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>
          </svg>
        </span>Search</button>
      <div class="navsearch-row" id="navSearchRow" hidden>
        <span class="mag" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
            <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>
          </svg>
        </span>
        <input id="navSearchInput" type="search" placeholder="Search an animal…"
               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
               aria-label="Search animals" role="combobox" aria-expanded="false"
               aria-autocomplete="list" aria-controls="navSearchResults">
        <button class="navsearch-close" id="navSearchClose" type="button" aria-label="Close search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
      <ul class="suggest" id="navSearchResults" role="listbox" hidden></ul>
      <p class="noresult" id="navSearchNoResult" hidden></p>
    </div>
    <!-- menu-desktop-hide: moves to the desktop footer / theme dial once
         there's room for them to just be visible - see style.css. Mobile
         is untouched. -->
    <a class="menu-item menu-desktop-hide" href="./?report=1">Report a problem</a>
    <a class="menu-item menu-desktop-hide" href="privacy.html">Privacy</a>
    <a class="menu-item menu-desktop-hide" href="https://github.com/Naveess/guessmyanimal"
       target="_blank" rel="noopener">Source on GitHub</a>
    <hr class="menu-sep menu-desktop-hide">
    <p class="theme-label menu-desktop-hide" id="themeLabel">Appearance</p>
    <div class="theme menu-desktop-hide" role="group" aria-labelledby="themeLabel">
      <button class="theme-btn" type="button" data-theme-set="system" aria-pressed="true">System</button>
      <button class="theme-btn" type="button" data-theme-set="light" aria-pressed="false">Light</button>
      <button class="theme-btn" type="button" data-theme-set="dark" aria-pressed="false">Dark</button>
    </div>
  </div>
</nav>

<!-- Own icon button, not a menu item - see index.html for why.
     data-sfx="off": turning sound off has to be silent, so the click
     handler plays its own confirming tap instead of the delegated one. -->
<button class="sound-toggle" id="soundToggle" type="button"
        aria-pressed="true" aria-label="Sound on" data-sfx="off">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/>
    <path class="sw-waves" d="M16 9.2a4 4 0 0 1 0 5.6M18.3 6.8a7.5 7.5 0 0 1 0 10.4"/>
    <path class="sw-mute" d="M15.5 9.5l5 5m0-5l-5 5"/>
  </svg>
</button>

<!-- Desktop-only sliding theme switch, next to the corner menu button.
     Reuses [data-theme-set] - menu.js's own applyTheme() syncs
     aria-pressed across every matching element on the page already,
     this group included. -->
<div class="theme-toggle" role="group" aria-label="Appearance">
  <button type="button" class="theme-toggle-opt" data-theme-set="light" aria-pressed="false" aria-label="Light">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.5"/>
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>
    </svg>
  </button>
  <button type="button" class="theme-toggle-opt" data-theme-set="dark" aria-pressed="false" aria-label="Dark">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>
    </svg>
  </button>
  <button type="button" class="theme-toggle-opt" data-theme-set="system" aria-pressed="true" aria-label="System">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="13" rx="2"/>
      <path d="M8 21h8M12 17v4"/>
    </svg>
  </button>
</div>

<header class="topbar">
  <a class="back" href="./" aria-label="Back to search">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15 5 8 12l7 7"/>
    </svg>
  </a>
  <a class="topbar-mark" href="./">
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <ellipse cx="32" cy="41" rx="14.5" ry="12"/>
      <ellipse cx="14.5" cy="27" rx="6.4" ry="8"/>
      <ellipse cx="26" cy="16.5" rx="6.4" ry="8.6"/>
      <ellipse cx="38" cy="16.5" rx="6.4" ry="8.6"/>
      <ellipse cx="49.5" cy="27" rx="6.4" ry="8"/>
    </svg>
    Guess my animal
  </a>
</header>

<main class="prose atoz" id="main">

  <h1>Every animal, A to Z</h1>

  <p class="lede">All ${ANIMALS.length}, in one list. Pick one to see if it's dangerous,
    what it eats, and everything else people ask mid-game.</p>

  <!-- Always visible, unlike the corner menu's own quick-search below -
       this is the one page whose entire job is finding a name, so the
       fastest way to do that shouldn't be two taps inside a hamburger.
       Reuses SearchCore (search-core.js) and the .searchrow/.suggest
       components the corner search already uses, see atoz.js. -->
  <div class="atoz-search" id="atozSearch">
    <div class="searchrow">
      <span class="mag" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>
        </svg>
      </span>
      <input id="atozSearchInput" type="search" placeholder="Search an animal…"
             autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
             aria-label="Search animals" role="combobox" aria-expanded="false"
             aria-autocomplete="list" aria-controls="atozSearchResults">
    </div>
    <ul class="suggest" id="atozSearchResults" role="listbox" hidden></ul>
    <p class="noresult" id="atozSearchNoResult" hidden></p>
  </div>

  <!-- Client-side show/hide only (see atoz.js) - every animal is still a
       real <a href> in the DOM under every filter, so this never costs a
       crawler or a no-JS visitor anything the plain list already had. -->
  <div class="atoz-cats" role="group" aria-label="Filter by kind">${catChips}</div>

  <div class="atoz-body">
    <nav class="atoz-jump" aria-label="Jump to letter">${jump}</nav>
    <div class="atoz-main">

      <aside class="atoz-play">
        <p>Or don't pick — let the game pick for you.</p>
        <a class="btn btn-solid" href="/?mystery=1">Mystery Animal</a>
      </aside>

      ${sections}

    </div>
  </div>

</main>

<footer class="foot prose-foot">
  <p><a href="./">Look up an animal</a></p>
  <p><a href="privacy.html">Privacy</a></p>
</footer>
<!-- Desktop-only: moved out of the corner menu, see style.css. -->
<div class="desktop-foot">
  <a href="./?report=1">Report a problem</a>
  <a href="https://github.com/Naveess/guessmyanimal" target="_blank" rel="noopener">Source on GitHub</a>
</div>

<script src="sfx.js?v=20260912-1"></script>
<script src="animals.js?v=20260907-1"></script>
<script src="search-core.js?v=20260913-1"></script>
<script src="menu.js?v=20260913-2"></script>
<!-- Decoration only, and only on this page: marks the letter you're
     currently reading in the rail. Every jump link works with this
     disabled - see atoz.js. -->
<script src="atoz.js?v=20260916-1"></script>
</body>
</html>
`;
}

fs.writeFileSync(path.join(__dirname, '..', 'browse.html'), browseHtml());

console.log(`wrote functions/seo-meta.json (${ANIMALS.length} animals)`);
console.log(`wrote sitemap.xml (${all.length} urls)`);
console.log(`wrote browse.html (${ANIMALS.length} animals)`);
