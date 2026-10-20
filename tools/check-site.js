/* Checks the built site before it ships, from the files alone:
 *
 *   - every sitemap URL is a clean address on SITE (no query, no .html,
 *     no trailing slash) whose page names itself as canonical and og:url
 *     and isn't noindex;
 *   - no page links to the old /?a=<slug> addresses;
 *   - every sitemap URL is at most MAX_CLICKS plain <a href> clicks from
 *     the homepage - no JavaScript, no search box;
 *   - no ad slot (tools/ads.js) sits in or next to the game.
 *
 * Animal pages aren't files: they're index.html rewritten by
 * functions/_shared/animal-page.js from functions/seo-meta.json, so
 * their links are read from the same pieces the Function puts in.
 *
 * Run by tools/build-seo.js last (a failure fails npm run seo), or on its
 * own: node tools/check-site.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = require('../functions/_shared/site.json').url;
const MAX_CLICKS = 3;

function check() {
  const errors = [];
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const META = JSON.parse(read('functions/seo-meta.json'));
  const shell = read('index.html');
  const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  // The HTML a crawler gets for a site path, or null if nothing serves it.
  function htmlFor(p) {
    const m = p.match(/^\/animals\/([^/]+)$/);
    if (m) {
      const e = META[m[1]];
      if (!e) return null;
      const c = e.content || {};
      return shell + e.relatedHtml + (c.confused || '') + (c.lists || '') + (c.group || '');
    }
    const file = p === '/' ? 'index.html' : p.slice(1) + '.html';
    return fs.existsSync(path.join(ROOT, file)) ? read(file) : null;
  }

  // Root-relative page links, as the clean path they open: the query is
  // dropped (/?mystery=1 is the homepage, canonical /), and so are
  // fragments and anything that isn't a page.
  function linksIn(html) {
    const out = new Set();
    for (const m of html.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
      const href = m[1].replace(/&amp;/g, '&');
      if (!href.startsWith('/') || href.startsWith('//') || href.startsWith('/api/')) continue;
      if (/[?&]a=/.test(href)) errors.push(`link to a legacy ?a= address: ${href}`);
      out.add(href.replace(/[?#].*$/, '') || '/');
    }
    return out;
  }

  for (const loc of locs) {
    if (!loc.startsWith(SITE + '/')) { errors.push(`sitemap: ${loc} is not on ${SITE}`); continue; }
    const p = loc.slice(SITE.length);
    if (/[?#]/.test(p) || /\.html$/.test(p) || (p !== '/' && p.endsWith('/'))) { errors.push(`sitemap: ${loc} is not a clean URL`); continue; }
    const html = htmlFor(p);
    if (html == null) { errors.push(`sitemap: nothing serves ${loc}`); continue; }
    if (p.startsWith('/animals/')) continue; // canonical is set per request; checked live
    const head = html.slice(0, html.indexOf('</head>'));
    const canon = (head.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    const og = (head.match(/<meta property="og:url" content="([^"]+)"/) || [])[1];
    if (canon !== loc) errors.push(`${p}: canonical is ${canon}, not ${loc}`);
    if (og !== loc) errors.push(`${p}: og:url is ${og}, not ${loc}`);
    if (/<meta name="robots" content="[^"]*noindex/.test(head)) errors.push(`${p}: in the sitemap but noindex`);
  }

  // Breadth-first from the homepage over plain links.
  const depth = new Map([['/', 0]]);
  const queue = ['/'];
  while (queue.length) {
    const p = queue.shift();
    const d = depth.get(p);
    if (d >= MAX_CLICKS) continue;
    const html = htmlFor(p);
    if (!html) continue;
    for (const q of linksIn(html)) {
      if (!depth.has(q)) { depth.set(q, d + 1); queue.push(q); }
    }
  }
  // Ad slots (tools/ads.js) stay out of the game: none in the homepage
  // splash, Mystery or Party views, stream mode or the 404, and the
  // animal page's one slot inside its facts column, never in the play
  // block or the actions under it.
  const slotsIn = (html) => [...html.matchAll(/class="adslot"/g)].map((m) => m.index);
  for (const f of ['streamer.html', '404.html', 'terms.html', 'contact.html']) {
    if (slotsIn(read(f)).length) errors.push(`${f}: has an ad slot; this page carries no ads`);
  }
  // The facts column ends where the related rail begins; the play block,
  // the actions and every other view come after it.
  const facts = [shell.indexOf('<div class="feed-content">'), shell.indexOf('<section class="ansec ansec-related">')];
  for (const at of slotsIn(shell)) {
    if (!(facts[0] >= 0 && at > facts[0] && at < facts[1])) errors.push('index.html: an ad slot outside the animal facts column');
  }

  const deepest = {};
  for (const loc of locs) {
    const p = loc.slice(SITE.length);
    const d = depth.get(p);
    if (d == null) errors.push(`${p}: more than ${MAX_CLICKS} clicks from the homepage`);
    else deepest[d] = (deepest[d] || 0) + 1;
  }
  return { errors, count: locs.length, deepest };
}

module.exports = { check };

if (require.main === module) {
  const { errors, count, deepest } = check();
  console.log(`checked ${count} sitemap URLs; by clicks from home: ${JSON.stringify(deepest)}`);
  if (errors.length) {
    console.error([...new Set(errors)].join('\n'));
    process.exit(1);
  }
}
