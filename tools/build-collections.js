/* Writes the collection pages (tools/collections.js decides what's on
 * them) as static files Pages serves at clean URLs:
 *
 *   explore.html                     /explore       the hub
 *                                    (not explore/index.html, which Pages
 *                                    would serve at /explore/ instead)
 *   explore/<kind>/<key>.html        /explore/<kind>/<key>
 *
 * Only approved collections (rv set in content/collections.json) are
 * written; files for anything else are removed, so un-approving a
 * collection takes its page down on the next build. The hub is written
 * only while at least one collection is live.
 *
 * Preview (every collection, approved or not, marked DRAFT and noindex):
 *   node tools/build-collections.js --drafts
 * writes into preview/ (gitignored, so it never deploys from git); open
 * localhost:8788/preview/explore with wrangler pages dev running.
 *
 * Normally run by tools/build-seo.js, which also adds the live pages to
 * the sitemap.
 */
const fs = require('fs');
const path = require('path');
const { published: collections } = require('./collections.js');
const { siteBar, brand, siteFooter, docHead } = require('./chrome.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://guessmyanimal.com';

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Hub groups, in the order they appear there.
const GROUPS = [
  ['region', 'Where they live'],
  ['habitat', 'Habitats'],
  ['kind', 'Kinds of animal'],
  ['answer', 'Quick-answer lists'],
];

function page({ title, description, canonical, styleVersion, draft, body }) {
  return `<!doctype html>
<html lang="en-GB">
<head>
${docHead({ title: escapeHtml(title), description: escapeHtml(description), canonical, styleVersion, robots: draft ? 'noindex' : null })}
</head>
<body class="view-page">

<a class="skip-link" href="#main">Skip to main content</a>

${siteBar()}

<div class="page-head">
  ${brand()}
</div>

<main class="prose coll" id="main">
${draft ? '  <p class="coll-draft">DRAFT preview: not approved, not published.</p>\n' : ''}${body}
</main>

${siteFooter()}

<script src="/sfx.js?v=20260912-1"></script>
<script src="/animals.js?v=20260930-1"></script>
<script src="/search-core.js?v=20260913-1"></script>
<script src="/navsearch.js?v=20260928-1"></script>
<script src="/menu.js?v=20260928-1"></script>
</body>
</html>
`;
}

function collectionBody(col) {
  const intro = col.intro.map((p) => `  <p${col.intro[0] === p ? ' class="lede"' : ''}>${escapeHtml(p)}</p>`).join('\n');
  const sections = col.sections.filter((s) => s.items.length).map((s) => {
    const items = s.items.map(({ a, slug, line }) =>
      `<li><a href="/animals/${slug}"><span class="coll-emoji" aria-hidden="true">${a.e || '🐾'}</span>${escapeHtml(a.n)}</a>${line ? `<span class="coll-line">${escapeHtml(line)}</span>` : ''}</li>`
    ).join('\n    ');
    const head = s.heading ? `  <h2>${escapeHtml(s.heading)} <span class="coll-count">${s.items.length}</span></h2>\n` : '';
    return `${head}  <ul class="coll-list">\n    ${items}\n  </ul>`;
  }).join('\n\n');
  return `  <p class="coll-up"><a href="/explore">Explore</a></p>
  <h1>${escapeHtml(col.title)}</h1>
${intro}
  <p class="coll-total">${col.count} animal${col.count === 1 ? '' : 's'}, A to Z.</p>

${sections}

  <p class="coll-foot">How each answer is decided: <a href="/how-we-answer">How we answer</a>.
    Every animal, in one list: <a href="/browse">All animals</a>.</p>`;
}

function hubBody(cols) {
  const groups = GROUPS.map(([g, heading]) => {
    const mine = cols.filter((c) => c.group === g);
    if (!mine.length) return '';
    const links = mine.map((c) => `<li><a href="/explore/${c.key}">${escapeHtml(c.title)}</a> <span class="coll-count">${c.count}</span></li>`).join('\n    ');
    return `  <h2>${heading}</h2>\n  <ul class="coll-hub">\n    ${links}\n  </ul>`;
  }).filter(Boolean).join('\n\n');
  return `  <h1>Explore animals</h1>
  <p class="lede">Lists of the animals on this site that share one thing: where they live,
    the kind of place they live in, what kind of animal they are, or one of the quick answers.</p>
  <p>Each list covers one question only. That's on purpose: a page that combined them
    would be a way to look up the answer mid-game, and this site doesn't do that.</p>

${groups}`;
}

// Removes every .html under dir that isn't in keep (absolute paths),
// then any folders left empty.
function prune(dir, keep) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) {
      prune(full, keep);
      if (!fs.readdirSync(full).length) fs.rmdirSync(full);
    } else if (name.endsWith('.html') && !keep.has(full)) {
      fs.unlinkSync(full);
    }
  }
}

// Writes the pages; returns the live ones for the sitemap.
function buildCollections(content, { styleVersion, drafts = false } = {}) {
  const { defs, intros, live, errors } = collections(content);
  if (errors.length) throw new Error('content/collections.json has errors:\n  ' + errors.join('\n  '));

  // In draft mode every collection with an intro is written, approved or
  // not; without one there's no title to give the page.
  const cols = drafts
    ? defs.filter((d) => intros[d.key] && d.count).map((d) => Object.assign(d, intros[d.key]))
    : live;
  const outRoot = drafts ? path.join(ROOT, 'preview', 'explore') : path.join(ROOT, 'explore');
  const written = new Set();
  const write = (rel, html) => {
    const full = path.join(outRoot, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
    written.add(full);
  };

  for (const col of cols) {
    write(col.key + '.html', page({
      title: `${col.title} | Guess My Animal`,
      description: col.desc || col.intro[0],
      canonical: `${SITE}/explore/${col.key}`,
      styleVersion, draft: drafts && !col.rv,
      body: collectionBody(col),
    }));
  }
  if (cols.length) {
    write('../explore.html', page({
      title: 'Explore animals | Guess My Animal',
      description: 'Lists of the animals on Guess My Animal that share one thing: a region, a habitat, a kind of animal or one quick answer.',
      canonical: `${SITE}/explore`,
      styleVersion, draft: drafts,
      body: hubBody(cols),
    }));
  }
  prune(outRoot, written);
  const hub = path.join(outRoot, '..', 'explore.html');
  if (!cols.length && fs.existsSync(hub)) fs.unlinkSync(hub);

  return {
    live,
    urls: live.length
      ? [{ loc: `${SITE}/explore`, lastmod: null }].concat(live.map((c) => ({ loc: `${SITE}/explore/${c.key}`, lastmod: c.rv })))
      : [],
    written: written.size,
  };
}

module.exports = { buildCollections };

if (require.main === module) {
  const { loadContent } = require('./content.js');
  const { published } = loadContent();
  const drafts = process.argv.includes('--drafts');
  const styleVersion = fs.readFileSync(path.join(ROOT, 'tools', 'build-seo.js'), 'utf8').match(/STYLE_VERSION = '([^']+)'/)[1];
  const { written } = buildCollections(published, { styleVersion, drafts });
  console.log(`wrote ${written} page${written === 1 ? '' : 's'} to ${drafts ? 'preview/explore' : 'explore'}`);
}
