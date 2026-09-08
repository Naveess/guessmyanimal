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

const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;
// browse.html is generated whole by this script (see below), not hand-
// edited, so its own style.css link needs this kept in step by hand -
// same manual-lockstep convention index.html/about.html/privacy.html/
// sw.js already use for every other shell asset. Bump this alongside
// them, then re-run node tools/build-seo.js.
const STYLE_VERSION = '20260907-3';

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
    if (i === 4) html += '<div class="ans-gap"></div>';
    const cls = 'pill' + (state ? ' ' + state : '');
    html += `<div class="row" style="--i:${i}"><span class="k">${escapeHtml(k)}</span><span class="${cls}">${escapeHtml(v)}</span></div>`;
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
    const html = `<div class="gchip" style="--i:${i}">${iconSvg(ic)}${keyHtml}<b>${escapeHtml(value)}</b></div>`;
    i++;
    return html;
  };
  return appearance.map(chip).join('') + '<div class="glance-gap"></div>' + behaviour.map(chip).join('');
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

  const jump = letters.map((l) => `<a href="#${l}">${l}</a>`).join('');
  const sections = letters
    .map((l) => {
      const items = groups[l]
        .map((a) => `<li><a href="/?a=${slugify(a.n)}">${escapeHtml(a.n)}</a></li>`)
        .join('');
      return `<section class="atoz-group"><h2 class="atoz-letter" id="${l}">${l}</h2><ul class="atoz-list">${items}</ul></section>`;
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

<main class="prose atoz">

  <h1>Every animal, A to Z</h1>

  <p class="lede">All ${ANIMALS.length}, in one list. Pick one to see if it's dangerous,
    what it eats, and everything else people ask mid-game.</p>

  <nav class="atoz-jump" aria-label="Jump to letter">${jump}</nav>

  ${sections}

</main>

<footer class="foot prose-foot">
  <p><a href="./">Look up an animal</a></p>
  <p><a href="privacy.html">Privacy</a></p>
</footer>

</body>
</html>
`;
}

fs.writeFileSync(path.join(__dirname, '..', 'browse.html'), browseHtml());

console.log(`wrote functions/seo-meta.json (${ANIMALS.length} animals)`);
console.log(`wrote sitemap.xml (${all.length} urls)`);
console.log(`wrote browse.html (${ANIMALS.length} animals)`);
