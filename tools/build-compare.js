/* Writes the look-alike compare pages as static files Pages serves at
 * clean URLs:
 *
 *   compare.html                  /compare                 the list
 *   compare/<a>-vs-<b>.html       /compare/<a>-vs-<b>      one pair
 *
 * A pair exists only where a published animal lists the other under
 * "Often confused with" (cf in content/animals/<slug>.json), so every
 * page is a pair a person picked and wrote a tip for, never every
 * combination. The slugs are in A to Z order (pairSlug() in
 * render-data.js), and the animal pages link to the same address.
 *
 * Nothing here is new writing about the animals: the tips, overviews and
 * answers all come from the reviewed content and animals.js. Only the
 * page furniture (headings, the hub intro) is written here.
 *
 * Normally run by tools/build-seo.js, which adds the pages to the
 * sitemap. Files for a pair that no longer exists are removed.
 */
const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { answers, pairSlug, cap, longDate, HABITATS } = require('../render-data.js');
const { slugify } = require('./content.js');
const { page, prune, escapeHtml } = require('./build-collections.js');
const jsonld = require('./jsonld.js');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://guessmyanimal.com';
const MAX_DESC = 158;

const BY_SLUG = {};
for (const a of ANIMALS) BY_SLUG[slugify(a.n)] = a;

// "Alligator or crocodile?" - the second name reads mid-sentence, so it's
// lower-cased, except for the one proper adjective among the pairs.
const midSentence = (n) => n.toLowerCase().replace(/\barctic\b/g, 'Arctic');
const question = (a, b) => `${a.n} or ${midSentence(b.n)}?`;

// Two animals' tips for the same pair are often the same sentence written
// from each side. Show both only when they say different things: when
// most of the shorter one's words are in the longer one, keep the longer.
function tipsFor(tips) {
  if (tips.length < 2) return tips;
  const words = (t) => new Set(t.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3));
  const [x, y] = tips.map((t) => words(t.tip));
  const shared = [...x].filter((w) => y.has(w)).length;
  if (shared / Math.min(x.size, y.size) >= 0.6) {
    return [tips[0].tip.length >= tips[1].tip.length ? tips[0] : tips[1]];
  }
  return tips;
}

// Every pair named by a published animal: {key, a, b, tips: [{from, tip}]}.
function pairsFrom(published) {
  const pairs = {};
  for (const [slug, c] of Object.entries(published)) {
    for (const x of c.cf || []) {
      if (!BY_SLUG[slug] || !BY_SLUG[x.slug]) continue;
      const key = pairSlug(slug, x.slug);
      const [s1, s2] = slug < x.slug ? [slug, x.slug] : [x.slug, slug];
      const p = pairs[key] || (pairs[key] = { key, s1, s2, tips: [] });
      p.tips.push({ from: slug, tip: x.tip });
    }
  }
  return Object.values(pairs)
    .map((p) => Object.assign(p, { a: BY_SLUG[p.s1], b: BY_SLUG[p.s2], tips: tipsFor(p.tips) }))
    .sort((p, q) => question(p.a, p.b).localeCompare(question(q.a, q.b)));
}

// At a glance, as rows two animals can share: [label, valueA, valueB].
// Built from the same fields as glanceGroups() in render-data.js, with a
// value for "no" too, since a side-by-side needs one in every cell.
function glanceRows(a, ca, b, cb) {
  const v = (x, c) => ({
    'Found in': x.r.join(', '),
    Habitat: c.hb && c.hb.length ? c.hb.map((h) => HABITATS[h] || h).join(', ') : '',
    Size: cap(x.sz),
    Length: c.len || '',
    Height: c.ht || '',
    Weight: c.wt || '',
    Legs: x.lg === 0 ? 'None' : String(x.lg),
    'Covered in': x.cv && x.cv !== 'None' ? x.cv : '',
    Lives: x.so === 'Solitary' ? 'Alone' : `In ${x.so.toLowerCase()}`,
    'Lives for': x.lf,
    'Can fly': x.fl === 'some' ? 'Only some' : x.fl ? 'Yes' : 'No',
    Swims: x.sw === 'debated' ? 'Debatable' : x.sw ? 'Yes' : 'No',
    'Lays eggs': x.eg === 'some' ? 'Some species' : x.eg ? 'Yes' : 'No',
  });
  const va = v(a, ca || {});
  const vb = v(b, cb || {});
  // A row neither animal has a value for (no measured height, say) is left out.
  return Object.keys(va).filter((k) => va[k] || vb[k]).map((k) => [k, va[k] || '–', vb[k] || '–']);
}

function table(caption, a, b, rows) {
  const head = `<thead><tr><th scope="col"><span class="sr-only">Question</span></th><th scope="col">${escapeHtml(a.n)}</th><th scope="col">${escapeHtml(b.n)}</th></tr></thead>`;
  const body = rows.map(([k, x, y]) => {
    const diff = x.text !== y.text;
    const cell = (c) => `<td>${c.cls != null ? `<span class="pill${c.cls ? ' ' + c.cls : ''}">${escapeHtml(c.text)}</span>` : escapeHtml(c.text)}</td>`;
    return `<tr${diff ? ' class="is-diff"' : ''}><th scope="row">${escapeHtml(k)}${diff ? ' <span class="cmp-flag">differs</span>' : ''}</th>${cell(x)}${cell(y)}</tr>`;
  }).join('\n      ');
  return `<div class="cmp-scroll"><table class="cmp-table">
    <caption class="sr-only">${escapeHtml(caption)}</caption>
    ${head}
    <tbody>
      ${body}
    </tbody>
  </table></div>`;
}

// The sources behind what this page shows from each animal: the tip and
// the overview, plus any source not tied to particular fields.
function sourcesFor(c) {
  return ((c && c.src) || []).filter((s) => !s.for || s.for.includes('cf') || s.for.includes('ov'));
}

function pairBody(p, published) {
  const { a, b } = p;
  const ca = published[p.s1] || null;
  const cb = published[p.s2] || null;

  const ansB = answers(b, cb);
  const ans = answers(a, ca).map(([k, v, cls], i) => [k, { text: v, cls }, { text: ansB[i][1], cls: ansB[i][2] }]);
  const differ = ans.filter(([, x, y]) => x.text !== y.text).map(([k]) => k.replace(/\?$/, '').toLowerCase());
  const summary = differ.length
    ? `They differ on ${differ.length} of the ${ans.length} quick answers: ${differ.join(', ')}.`
    : `They give the same ${ans.length} quick answers, so in the game it comes down to the clues below.`;
  const glance = glanceRows(a, ca, b, cb).map(([k, x, y]) => [k, { text: x }, { text: y }]);

  const tips = p.tips.map((t) => `  <p class="cmp-tip">${escapeHtml(t.tip)}</p>`).join('\n');

  const card = (x, slug) => `<a class="cmp-card" href="/animals/${slug}"><span class="coll-emoji" aria-hidden="true">${x.e || '🐾'}</span><span>${escapeHtml(x.n)}</span></a>`;

  const about = [[a, p.s1, ca], [b, p.s2, cb]].map(([x, slug, c]) => {
    const ov = c && c.ov ? `\n  <p>${escapeHtml(c.ov)}</p>` : '';
    return `  <h3>${escapeHtml(x.n)}</h3>${ov}
  <p class="cmp-more"><a href="/animals/${slug}">Everything on the ${escapeHtml(midSentence(x.n))} page</a></p>`;
  }).join('\n');

  const seen = new Set();
  const srcItems = [ca, cb].flatMap(sourcesFor).filter((s) => !seen.has(s.url) && seen.add(s.url))
    .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></li>`).join('\n    ');
  const rv = [ca && ca.rv, cb && cb.rv].filter(Boolean).sort().pop();

  return {
    rv,
    html: `  <p class="coll-up"><a href="/compare">Side by side</a></p>
  <h1>${escapeHtml(question(a, b))}</h1>
  <div class="cmp-cards">${card(a, p.s1)}<span class="cmp-or" aria-hidden="true">or</span>${card(b, p.s2)}</div>

  <h2>How to tell them apart</h2>
${tips}

  <h2>Quick answers</h2>
  <p>${escapeHtml(summary)}</p>
  ${table(`Quick answers for the ${midSentence(a.n)} and the ${midSentence(b.n)}`, a, b, ans)}

  <h2>At a glance</h2>
  ${table(`At a glance: the ${midSentence(a.n)} and the ${midSentence(b.n)}`, a, b, glance)}

  <h2>About each</h2>
${about}
${srcItems ? `
  <h2>Sources</h2>
  <ol class="src-list">
    ${srcItems}
  </ol>` : ''}${rv ? `
  <p class="src-reviewed">Last reviewed <time datetime="${rv}">${longDate(rv)}</time>. The answers and notes come
    from each animal's own page, where every source is listed.</p>` : ''}

  <p class="coll-foot">How each answer is decided: <a href="/how-we-answer">How we answer</a>.
    More look-alikes: <a href="/compare">Side by side</a>.</p>`,
  };
}

function hubBody(pairs) {
  const items = pairs.map((p) =>
    `<li><a href="/compare/${p.key}">${escapeHtml(question(p.a, p.b))}</a></li>`
  ).join('\n    ');
  return `  <p class="coll-up"><a href="/explore">Explore</a></p>
  <h1>Look-alikes, side by side</h1>
  <p class="lede">Animals people often mix up, one pair to a page: how to tell them apart,
    then their quick answers next to each other, with the ones that differ marked.</p>
  <p>The pairs are the look-alikes listed on the animals' own pages, not every possible
    combination.</p>
  <p class="coll-total">${pairs.length} pairs, A to Z.</p>

  <ul class="coll-list">
    ${items}
  </ul>

  <p class="coll-foot">How each answer is decided: <a href="/how-we-answer">How we answer</a>.
    Every animal, in one list: <a href="/browse">All animals</a>.</p>`;
}

const clip = (s) => {
  if (s.length <= MAX_DESC) return s;
  const cut = s.slice(0, MAX_DESC - 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
};

// Writes the pages; returns their URLs for the sitemap.
function buildCompare(published, { styleVersion }) {
  const pairs = pairsFrom(published);
  const outRoot = path.join(ROOT, 'compare');
  const written = new Set();
  const write = (full, html) => {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
    written.add(full);
  };

  const urls = [];
  for (const p of pairs) {
    const q = question(p.a, p.b);
    const { rv, html } = pairBody(p, published);
    const description = clip(p.tips[0].tip);
    write(path.join(outRoot, p.key + '.html'), page({
      title: `${q} How to tell them apart | Guess My Animal`,
      description,
      canonical: `${SITE}/compare/${p.key}`,
      styleVersion, mainClass: 'coll cmp',
      body: html,
      ld: jsonld.scriptTag(jsonld.page({
        path: `/compare/${p.key}`, name: q, description, dateModified: rv,
        crumbs: [['Home', '/'], ['Side by side', '/compare'], [q, `/compare/${p.key}`]],
      })),
    }));
    urls.push({ loc: `${SITE}/compare/${p.key}`, lastmod: rv || null });
  }

  const hub = path.join(ROOT, 'compare.html');
  const hubDesc = 'Animals people often mix up, one pair to a page: how to tell them apart and their quick answers side by side.';
  if (pairs.length) {
    write(hub, page({
      title: 'Look-alikes, side by side | Guess My Animal',
      description: hubDesc,
      canonical: `${SITE}/compare`,
      styleVersion,
      body: hubBody(pairs),
      ld: jsonld.scriptTag(jsonld.page({
        type: 'CollectionPage', path: '/compare', name: 'Look-alikes, side by side', description: hubDesc,
        crumbs: [['Home', '/'], ['Side by side', '/compare']],
      })),
    }));
  } else if (fs.existsSync(hub)) {
    fs.unlinkSync(hub);
  }
  prune(outRoot, written);

  return { pairs, urls: pairs.length ? [{ loc: `${SITE}/compare`, lastmod: null }].concat(urls) : [] };
}

module.exports = { buildCompare, pairsFrom };
