// Generates sitemap.xml and functions/seo-meta.json from animals.js.
//
// Animals live at /animals/<slug> (functions/animals/[slug].js serves
// them; the old /?a=<slug> 301s there - see functions/index.js). This
// script adds what that Function and a crawler need: a list of every URL
// that exists, and a real per-animal <title>/<meta description> and
// pre-rendered answers for the Function to inject, instead of every
// animal sharing the one generic homepage shell.
//
// Run: node tools/build-seo.js (or npm run seo). Re-run whenever animals.js
// changes - nothing else does this automatically.

const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { answers, glanceGroups, sections, ICONS } = require('../render-data.js');
const { loadContent } = require('./content.js');
const { relatedFor } = require('../related.js');
const { creditHtml } = require('../photo-credit.js');
// Lead photo + licence credit per animal, cached by tools/build-photos.js
// (the one build step that needs the network). Missing file or missing
// entry just means no baked-in photo; app.js still looks it up live.
const PHOTOS = (() => {
  try { return require('./photos.json'); } catch (e) { return {}; }
})();
const { CATEGORY_BUCKETS } = require('../game-core.js');
const { siteBar, brand, siteFooter } = require('./chrome.js');
const { buildCollections } = require('./build-collections.js');
const { buildCompare } = require('./build-compare.js');
const { buildReviewed } = require('./build-reviewed.js');
const jsonld = require('./jsonld.js');

const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;
// browse.html is generated whole by this script (see below), not hand-
// edited, so its own style.css link needs this kept in step by hand -
// same manual-lockstep convention index.html/about.html/privacy.html/
// sw.js already use for every other shell asset. Bump this alongside
// them, then re-run node tools/build-seo.js.
const STYLE_VERSION = '20260930-7';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

// Reviewed editorial content (tools/content.js). Any validation error
// stops the build: a broken content file must never half-publish.
const CONTENT = loadContent();
if (CONTENT.errors.length) {
  console.error('content/animals has errors:\n  ' + CONTENT.errors.join('\n  '));
  process.exit(1);
}
const PUBLISHED = CONTENT.published;
const lookup = (slug) => {
  const a = ANIMALS.find((x) => slugify(x.n) === slug);
  return a ? { n: a.n, e: a.e } : null;
};

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
function answersHtml(a, c) {
  const rows = answers(a, c);
  let html = '';
  rows.forEach(([k, v, state, why], i) => {
    if (i === 4) html += '<div class="ans-gap" role="presentation"></div>';
    const cls = 'pill' + (state ? ' ' + state : '');
    const note = why ? `<p class="why">${escapeHtml(why)}</p>` : '';
    html += `<div class="row${why ? ' has-why' : ''}" role="listitem" style="--i:${i}"><span class="k">${escapeHtml(k)}</span><span class="${cls}">${escapeHtml(v)}</span>${note}</div>`;
  });
  return html;
}

// Mirrors renderGlance()'s DOM exactly: same chip shape, same
// appearance/behaviour split with the .glance-gap spacer between them.
function glanceHtml(a, c) {
  const { appearance, behaviour } = glanceGroups(a, c);
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
      return `<a class="related-item" href="/animals/${slug}"><span class="r-emoji" aria-hidden="true">${b.e || '🐾'}</span>${escapeHtml(b.n)}</a>`;
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

  const c = PUBLISHED[slug] || null;

  // Not "X — is it dangerous?" any more: that stamped one question on
  // every page, and the page answers eight. app.js sets the same title.
  const title = `${a.n}: quick answers and facts | Guess My Animal`;

  // Our own reviewed overview when there is one; the fact-based
  // template otherwise.
  let description;
  if (c && c.ov) {
    // As many whole sentences as fit. If that leaves too little to be a
    // description ("Africa's social big cat."), the word-boundary cut
    // below takes over instead.
    description = c.ov;
    if (description.length > MAX_DESC) {
      let kept = '';
      for (const s of c.ov.split(/(?<=[.!?])\s+/)) {
        const next = kept ? kept + ' ' + s : s;
        if (next.length > MAX_DESC) break;
        kept = next;
      }
      if (kept.length >= 90) description = kept;
    }
  } else {
    description = `${a.f} Is ${article} ${lower} dangerous, and could you keep one as a pet? Get instant answers on Guess My Animal.`;
    if (description.length > MAX_DESC) {
      // Keep the hand-written fact whole - it's the one truly unique part
      // of the description - and drop the templated tail instead of
      // chopping mid-sentence.
      description = `${a.f} Is ${article} ${lower} dangerous? Get the answer on Guess My Animal.`;
    }
    if (description.length > MAX_DESC) {
      // The fact alone is already long (e.g. Poison dart frog). Drop the
      // templated tail entirely rather than truncate mid-sentence - the
      // fact by itself is still a perfectly good description.
      description = a.f;
    }
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
    photo: PHOTOS[slug]
      ? { src: PHOTOS[slug].src, width: PHOTOS[slug].width, height: PHOTOS[slug].height, creditHtml: creditHtml(PHOTOS[slug]) }
      : null,
    answersHtml: answersHtml(a, c),
    glanceHtml: glanceHtml(a, c),
    relatedHtml: relatedHtml(a),
    // Only for animals with reviewed content (see sections() in
    // render-data.js). `json` is what app.js would otherwise fetch from
    // /data/animals/, embedded so the first render needs no second request.
    // JSON-LD for the Function to append (tools/jsonld.js): the page, its
    // real review date, and the path back up through All animals.
    ld: jsonld.scriptTag(jsonld.page({
      path: `/animals/${slug}`, name: `${a.n}: quick answers and facts`, description,
      dateModified: c ? c.rv : null,
      image: PHOTOS[slug] ? PHOTOS[slug].src : null,
      crumbs: [['Home', '/'], ['All animals', '/browse'], [a.n, `/animals/${slug}`]],
    })),
    content: c ? Object.assign({ overview: c.ov || '', json: JSON.stringify(c) }, sections(c, lookup, slug)) : null,
  };
  urls.push({ loc: `${SITE}/animals/${slug}`, lastmod: c ? c.rv : null });
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
const staticUrls = ['/', '/about', '/how-we-answer', '/browse', '/streamer', '/contact', '/privacy', '/terms'].map((p) => SITE + p);
// No build-date <lastmod>: it used to be stamped on every URL, which
// tells a crawler every page changed every time anyone ran this. A
// reviewed animal gets its real review date (rv); the rest get none.
// Collection pages (tools/build-collections.js): only the approved ones
// are written, and only those go in the sitemap.
const COLLECTIONS = buildCollections(PUBLISHED, { styleVersion: STYLE_VERSION });
// Look-alike compare pages (tools/build-compare.js) and the review log
// (tools/build-reviewed.js), both built only from published content.
const COMPARE = buildCompare(PUBLISHED, { styleVersion: STYLE_VERSION });
const REVIEWED = buildReviewed(PUBLISHED, COLLECTIONS.live, { styleVersion: STYLE_VERSION });
const all = staticUrls.map((loc) => ({ loc, lastmod: null })).concat(urls, COLLECTIONS.urls, COMPARE.urls, REVIEWED.urls);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all
  .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`)
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

  const itemHtml = (a) => `<li data-cat="${bucketKeyFor(a)}"><a href="/animals/${slugify(a.n)}">${escapeHtml(a.n)}</a></li>`;

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
<link rel="canonical" href="https://guessmyanimal.com/browse">
<meta property="og:url" content="https://guessmyanimal.com/browse">
<meta property="og:type" content="article">
<meta property="og:image" content="https://guessmyanimal.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
${jsonld.scriptTag(jsonld.page({
  type: 'CollectionPage', path: '/browse', name: 'Every animal, A to Z',
  description: `All ${ANIMALS.length} animals on Guess My Animal, listed A to Z.`,
  crumbs: [['Home', '/'], ['All animals', '/browse']],
}))}

<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<script>
(function(){try{var t=localStorage.getItem('gma-theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
<link rel="stylesheet" href="/style.css?v=${STYLE_VERSION}">
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

<!-- Row 1 (sticky) and row 2 (brand) - from tools/chrome.js. -->
${siteBar()}

<div class="page-head">
  ${brand()}
</div>

<main class="prose atoz" id="main">

  <h1>Every animal, A to Z</h1>

  <p class="lede">All ${ANIMALS.length}, in one list. Pick one to see if it's dangerous,
    what it eats, and everything else people ask mid-game.</p>

  <!-- Always visible, unlike the site bar's own Search popover - this
       is the one page whose entire job is finding a name, so the
       fastest way to do that shouldn't be a tap away.
       Reuses SearchCore (search-core.js) and the .searchrow/.suggest
       components the corner search already uses, see atoz.js. -->
  <div class="atoz-search" id="atozSearch">
    <div class="searchrow">
      <span class="mag" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
          <circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>
        </svg>
      </span>
      <input class="search-input" id="atozSearchInput" type="search" placeholder="Search an animal…"
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

${siteFooter()}

<script src="/sfx.js?v=20260912-1"></script>
<script src="/animals.js?v=20260930-2"></script>
<script src="/search-core.js?v=20260913-1"></script>
<script src="/navsearch.js?v=20260930-2"></script>
<script src="/menu.js?v=20260930-2"></script>
<!-- Decoration only, and only on this page: marks the letter you're
     currently reading in the rail. Every jump link works with this
     disabled - see atoz.js. -->
<script src="/atoz.js?v=20260928-1"></script>
</body>
</html>
`;
}

fs.writeFileSync(path.join(__dirname, '..', 'browse.html'), browseHtml());

// data/animals/<slug>.json: each published animal's content, for app.js
// to fetch on in-app navigation. Reviewed entries only, reviewer notes
// already stripped by loadContent(); files for anything no longer
// published are removed.
const DATA_DIR = path.join(__dirname, '..', 'data', 'animals');
fs.mkdirSync(DATA_DIR, { recursive: true });
for (const f of fs.readdirSync(DATA_DIR)) {
  if (f.endsWith('.json') && !PUBLISHED[f.slice(0, -5)]) fs.unlinkSync(path.join(DATA_DIR, f));
}
for (const slug of Object.keys(PUBLISHED)) {
  fs.writeFileSync(path.join(DATA_DIR, slug + '.json'), JSON.stringify(PUBLISHED[slug]));
}
// The list app.js checks before fetching, so the ~400 animals without
// content yet don't each cost a 404 round trip.
fs.writeFileSync(path.join(DATA_DIR, '..', 'published.json'), JSON.stringify(Object.keys(PUBLISHED)));

console.log(`wrote functions/seo-meta.json (${ANIMALS.length} animals)`);
console.log(`wrote sitemap.xml (${all.length} urls)`);
console.log(`wrote browse.html (${ANIMALS.length} animals)`);
console.log(`collections: ${COLLECTIONS.live.length} live (explore/)`);
console.log(`compare: ${COMPARE.pairs.length} pairs (compare/)`);
console.log(`content: ${Object.keys(PUBLISHED).length} published, ${Object.keys(CONTENT.all).length - Object.keys(PUBLISHED).length} awaiting review`);

// Last, so the hand-written pages pick up the same chrome browse.html
// just got - see tools/build-chrome.js.
require('./build-chrome.js');
