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

const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

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

  meta[slug] = { title, description, wikiTitle };
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
