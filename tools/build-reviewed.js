/* Writes reviewed.html (/reviewed): every published page under the date
 * a person last checked it, newest first.
 *
 * True by construction: the dates are the same rv values shown at the
 * bottom of each animal page and set only by `npm run approve` after a
 * review (tools/content-approve.js). Nothing here is typed by hand, so
 * the log can't claim a review the pages don't.
 *
 * Normally run by tools/build-seo.js.
 */
const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { longDate } = require('../render-data.js');
const { slugify } = require('./content.js');
const { page, escapeHtml } = require('./build-collections.js');
const jsonld = require('./jsonld.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://guessmyanimal.com';

const BY_SLUG = {};
for (const a of ANIMALS) BY_SLUG[slugify(a.n)] = a;

const DESC = 'Every animal page and list on Guess My Animal under the date a person last checked it against its sources, newest first.';

// published: {slug: content} (tools/content.js); collections: the live
// collection pages (tools/collections.js), each with a key, title and rv.
function buildReviewed(published, collections, { styleVersion }) {
  const days = {};
  const day = (rv) => days[rv] || (days[rv] = { animals: [], lists: [] });
  for (const [slug, c] of Object.entries(published)) {
    if (c.rv && BY_SLUG[slug]) day(c.rv).animals.push([BY_SLUG[slug], slug]);
  }
  for (const col of collections) if (col.rv) day(col.rv).lists.push(col);

  const dates = Object.keys(days).sort().reverse();
  const out = path.join(ROOT, 'reviewed.html');
  if (!dates.length) {
    if (fs.existsSync(out)) fs.unlinkSync(out);
    return { urls: [] };
  }

  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const sections = dates.map((d) => {
    const { animals, lists } = days[d];
    animals.sort(([x], [y]) => x.n.localeCompare(y.n));
    lists.sort((x, y) => x.title.localeCompare(y.title));
    const counts = [animals.length && plural(animals.length, 'animal', 'animals'), lists.length && plural(lists.length, 'list', 'lists')].filter(Boolean).join(', ');
    const animalList = animals.length
      ? `\n  <ul class="coll-hub">\n    ${animals.map(([a, slug]) => `<li><a href="/animals/${slug}">${escapeHtml(a.n)}</a></li>`).join('\n    ')}\n  </ul>`
      : '';
    const listList = lists.length
      ? `\n  <h3>Lists</h3>\n  <ul class="coll-hub">\n    ${lists.map((c) => `<li><a href="/explore/${c.key}">${escapeHtml(c.title)}</a></li>`).join('\n    ')}\n  </ul>`
      : '';
    return `  <h2 id="d${d}"><time datetime="${d}">${longDate(d)}</time> <span class="coll-count">${counts}</span></h2>${animalList}${listList}`;
  }).join('\n\n');

  const total = Object.keys(published).length;
  const body = `  <h1>Review log</h1>
  <p class="lede">Before an animal's page goes up, a person checks its overview, notes and
    measurements against the sources listed at the bottom of that page. This log lists every
    page under the date it was last checked, newest first.</p>
  <p>It's built from the same review dates shown on the pages themselves, so it only ever
    says what they say. When a page is checked again, it moves up to its new date.
    What the checking covers: <a href="/how-we-answer">How we answer</a>.</p>
  <p class="coll-total">${plural(total, 'animal', 'animals')} and ${plural(collections.length, 'list', 'lists')} reviewed.</p>

${sections}`;

  fs.writeFileSync(out, page({
    title: 'Review log | Guess My Animal',
    description: DESC,
    canonical: `${SITE}/reviewed`,
    styleVersion,
    body,
    ld: jsonld.scriptTag(jsonld.page({
      path: '/reviewed', name: 'Review log', description: DESC, dateModified: dates[0],
      crumbs: [['Home', '/'], ['Review log', '/reviewed']],
    })),
  }));
  return { urls: [{ loc: `${SITE}/reviewed`, lastmod: dates[0] }] };
}

module.exports = { buildReviewed };
