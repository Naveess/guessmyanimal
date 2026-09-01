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

const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;

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

const meta = {};
const urls = [];
let longest = 0;

for (const a of ANIMALS) {
  const slug = slugify(a.n);
  const lower = a.n.toLowerCase();

  const title = `${a.n} — is it dangerous? | Guess My Animal`;

  let description = `${a.f} Is a ${lower} dangerous, and could you keep one as a pet? Get instant answers on Guess My Animal.`;
  if (description.length > MAX_DESC) {
    // Keep the hand-written fact whole - it's the one truly unique part of
    // the description - and drop the templated tail instead of chopping
    // mid-sentence.
    description = `${a.f} Is a ${lower} dangerous? Get the answer on Guess My Animal.`;
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
const staticUrls = [SITE + '/', SITE + '/about'];
const lastmod = new Date().toISOString().slice(0, 10);
const all = staticUrls.concat(urls);
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${all
  .map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod></url>`)
  .join('\n')}\n</urlset>\n`;

fs.writeFileSync(path.join(__dirname, '..', 'sitemap.xml'), xml);

console.log(`wrote functions/seo-meta.json (${ANIMALS.length} animals)`);
console.log(`wrote sitemap.xml (${all.length} urls)`);
