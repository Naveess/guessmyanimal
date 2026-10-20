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
 * answers all come from the reviewed content and animals.js, and the
 * sentences built from the data (dataLine() below) only restate a field
 * both animals already have. The one exception is the optional
 * per-pair entry in content/compare.json - "Common questions" and any
 * title override - which, like every other piece of editorial content,
 * goes live only once a person has reviewed it (npm run approve --
 * compare/<a>-vs-<b>).
 *
 * Preview, with unapproved compare.json entries shown and marked DRAFT:
 *   node tools/build-compare.js --drafts      (writes preview/compare/)
 *
 * Normally run by tools/build-seo.js, which adds the pages to the
 * sitemap. Files for a pair that no longer exists are removed.
 */
const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { answers, pairSlug, cap, longDate, HABITATS } = require('../render-data.js');
const { creditHtml } = require('../photo-credit.js');
const { slugify } = require('./content.js');
const { page, prune, escapeHtml } = require('./build-collections.js');
const jsonld = require('./jsonld.js');

const ROOT = path.join(__dirname, '..');
const SITE = require('../functions/_shared/site.json').url; // functions/_shared/site.json
const FILE = path.join(ROOT, 'content', 'compare.json');
const MAX_DESC = 155;
// Past this a results page cuts the title off; brackets are dropped from
// the end (never below two) until it fits.
const MAX_TITLE = 70;

const PHOTOS = (() => {
  try { return require('./photos.json'); } catch (e) { return {}; }
})();

const BY_SLUG = {};
for (const a of ANIMALS) BY_SLUG[slugify(a.n)] = a;

// The second name reads mid-sentence, so it's lower-cased, except for
// the one proper adjective among the pairs.
const midSentence = (n) => n.toLowerCase().replace(/\barctic\b/g, 'Arctic');
const titleCase = (n) => n.replace(/(^|[\s-])([a-z])/g, (m, s, c) => s + c.toUpperCase());
const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const the = (x) => 'the ' + midSentence(x.n);
const sentences = (t) => String(t).split(/(?<=[.!?])\s+/).filter(Boolean);

// Two animals' tips for the same pair are often the same sentence written
// from each side. Show both only when they say different things: when
// most of the shorter one's words are in the longer one, keep the longer.
function tipsFor(tips) {
  if (tips.length < 2) return tips;
  const words = (t) => new Set(t.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter((w) => w.length > 3));
  const [x, y] = tips.map((t) => words(t.tip));
  const shared = [...x].filter((w) => y.has(w)).length;
  const opening = (t) => t.toLowerCase().split(/\s+/).slice(0, 4).join(' ');
  if (opening(tips[0].tip) === opening(tips[1].tip)) return [tips[0]];
  if (shared / Math.min(x.size, y.size) >= 0.6) {
    return [tips[0].tip.length >= tips[1].tip.length ? tips[0] : tips[1]];
  }
  return tips;
}

// Every pair named by a published animal: {key, s1, s2, a, b, tips: [{from, tip}]}.
// allTips keeps both sides' tips (before tipsFor() de-duplicates them),
// for the animal pages' "Often confused with" list.
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
    .map((p) => Object.assign(p, { a: BY_SLUG[p.s1], b: BY_SLUG[p.s2], allTips: p.tips.slice(), tips: tipsFor(p.tips) }))
    .sort((p, q) => p.key.localeCompare(q.key));
}

/* -- content/compare.json -------------------------------------------
 * Optional, one entry per pair key, all fields optional:
 *   first  slug of the animal to name first in the title and H1
 *   dims   up to 3 bracket labels, replacing the ones picked below
 *   qa     [{q, a, from}] - the "Common questions"; `from` names the
 *          reviewed fields each answer comes from ("yak.ov", "cow.sci")
 *   rv     review date, set only by npm run approve -- compare/<key>
 */
function loadEntries() {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
}

// A qa answer's `from` names "<slug>.<field>": one of the pair's two
// animals and a field it actually has, in its reviewed content or in
// animals.js - so a reviewer can check each answer against its source.
function validateEntries(entries, pairs, published) {
  const errs = [];
  const keys = new Map(pairs.map((p) => [p.key, p]));
  for (const [k, v] of Object.entries(entries)) {
    const p = keys.get(k);
    if (!p) { errs.push(`compare.json: "${k}" is not a compare pair`); continue; }
    for (const f of Object.keys(v)) if (!['first', 'dims', 'qa', 'rv', 'notes'].includes(f)) errs.push(`${k}: unknown field "${f}"`);
    if (v.first != null && v.first !== p.s1 && v.first !== p.s2) errs.push(`${k}: first must be ${p.s1} or ${p.s2}`);
    if (v.dims != null && (!Array.isArray(v.dims) || !v.dims.length || v.dims.length > 3 || v.dims.some((d) => typeof d !== 'string' || !d.trim()))) errs.push(`${k}: dims must be 1-3 labels`);
    if (v.qa != null) {
      if (!Array.isArray(v.qa) || !v.qa.length) errs.push(`${k}: qa must be a non-empty array`);
      else for (const x of v.qa) {
        if (!x || typeof x.q !== 'string' || !x.q.trim().endsWith('?')) errs.push(`${k}: each qa needs a q ending in "?"`);
        if (!x || typeof x.a !== 'string' || !x.a.trim() || x.a.length > 320) errs.push(`${k}: each qa needs an a of at most 320 chars`);
        if (!x || !Array.isArray(x.from) || !x.from.length) { errs.push(`${k}: each qa needs from: the fields it comes from`); continue; }
        for (const f of x.from) {
          const [slug, field] = String(f).split('.');
          const has = (slug === p.s1 || slug === p.s2) &&
            ((published[slug] && published[slug][field] != null) || BY_SLUG[slug][field] != null);
          if (!has) errs.push(`${k}: from "${f}" is not a field of ${p.s1} or ${p.s2}`);
        }
      }
    }
    if (v.rv != null && !/^\d{4}-\d{2}-\d{2}$/.test(v.rv)) errs.push(`${k}: rv must be YYYY-MM-DD or null`);
  }
  return errs;
}

/* -- What differs ----------------------------------------------------
 * The title's brackets name the two or three differences that matter
 * most for this pair. A difference counts only where the data has one
 * (animals.js, or the reviewed content), and ranks higher when the
 * reviewed tip - the sentence a person wrote about telling these two
 * apart - mentions it. Features only a tip can know about (tusks, a
 * hump) count when the tip names them.
 */
const SIZE_WORD = { tiny: 'tiny', small: 'small', medium: 'medium-sized', large: 'large', huge: 'huge' };
const COVER_WORD = {
  Fur: 'fur', Skin: 'bare skin', Spines: 'spines', Bristles: 'bristles', Wool: 'wool', Armour: 'armour',
  Scales: 'scales', Quills: 'quills', Feathers: 'feathers', Shell: 'a shell', Exoskeleton: 'an exoskeleton', Skeleton: 'a skeleton',
};
const DIET_WORD = { Carnivore: 'is a carnivore', Herbivore: 'is a herbivore', Omnivore: 'is an omnivore', Insectivore: 'eats insects' };
const FLY_WORD = (x) => (x.fl === 'some' ? 'only some can fly' : x.fl ? 'can fly' : "can't fly");
const DANGER_WORD = (x) => (x.dg === 'yes' ? 'is dangerous to people' : x.dg === 'some' ? 'can be dangerous to people' : "isn't dangerous to people");
const ACTIVE_WORD = (x) => (x.ac === 'night' ? 'is active at night' : x.ac === 'day' ? 'is active by day' : 'is active by day and night');
const placeList = (r) => {
  const names = r.map((p) => (p === 'Oceans' ? 'the oceans' : p === 'Rivers' ? 'rivers' : p === 'Americas' ? 'the Americas' : p));
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
};
const livesIn = (x) => (x.r.length === 1 && x.r[0] === 'Worldwide' ? 'is found worldwide' : `lives in ${placeList(x.r)}`);
const isHybrid = (c) => !!(c && c.sci && c.sci.includes('×'));
const firstClause = (s) => String(s).split(';')[0].trim();
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// [label, base score, tip pattern, differs(A, B) where A/B = {x, c}]
const DATA_DIMS = [
  ['Parents', 100, /father|mother|cross|parent/i, (A, B) => isHybrid(A.c) || isHybrid(B.c)],
  ['Size', 45, /\b(bigger|smaller|larger|size|heav|weigh|tall|hands|small|big|huge|tiny|long)/i,
    // The coarse size scale alone decides it only when there are no
    // measured weights for both: a Hereford bull outweighs a yak, whatever
    // "large" and "huge" say.
    (A, B, tip) => /\b(bigger|smaller|larger|heavier|taller|hands)\b/i.test(tip) ||
      (A.x.sz !== B.x.sz && !(A.c && A.c.wt && B.c && B.c.wt))],
  ['Flight', 55, /\bfl(y|ies|ight)\b|flightless/i, (A, B) => A.x.fl !== B.x.fl],
  ['Danger', 40, /venom|danger|bite|sting|kill/i, (A, B) => A.x.dg !== B.x.dg],
  ['Diet', 35, /\beat|diet|prey|hunt|carrion|scaveng|graz|insects|nectar|blood/i, (A, B) => A.x.d !== B.x.d],
  ['Range', 35, /Africa|Asia|America|Europe|Australia|Arctic|Antarctic|Zealand|Madagascar|Guinea|island|native/i,
    (A, B) => !isHybrid(A.c) && !isHybrid(B.c) && !A.x.r.some((p) => B.x.r.includes(p))],
  ['Day vs Night', 35, /night|nocturnal|by day|daytime/i, (A, B) => A.x.ac !== B.x.ac && (A.x.ac !== 'both' || B.x.ac !== 'both')],
  ['Covering', 40, /scales|scaly|\bfur\b|feather|shell|spines|wool|quill/i, (A, B) => A.x.cv !== B.x.cv && A.x.cv !== 'None' && B.x.cv !== 'None'],
  ['Domestication', 35, /domestic|tame|ancestor|\bbred\b/i, (A, B) => A.x.dm !== B.x.dm],
  ['Eggs', 30, /\beggs?\b/i, (A, B) => A.x.eg !== B.x.eg],
  ['Legs', 25, /\blegs?\b/i, (A, B) => A.x.lg !== B.x.lg],
  ['Social Life', 15, /alone|solitary|group|herd|pack|pairs|flock|colon/i, (A, B) => (A.x.so === 'Solitary') !== (B.x.so === 'Solitary')],
  ['Lifespan', 10, /lifespan|live (for|to)/i, (A, B) => A.x.lf !== B.x.lf],
];
// Only a tip can say these differ, so they count when it names them.
const TIP_DIMS = [
  ['Tusks', /tusk/i], ['Ears', /\bears\b/i], ['Tail', /\btails?\b/i], ['Horns', /\bhorns?\b/i],
  ['Antlers', /antler/i], ['Wings', /\bwings?\b/i], ['Beak', /\bbeak|\bbill\b/i], ['Markings', /stripe|spots|marking/i],
  ['Neck', /\bneck/i], ['Hump', /hump/i], ['Snout', /snout|\bnose|muzzle/i], ['Teeth', /teeth|tooth|fang/i],
  ['Mane', /\bmane\b/i], ['Mouthparts', /mouthpart|proboscis/i], ['Colour', /colou?r/i], ['Legs', /\blegs?\b/i],
  ['Claws', /\bclaws?\b/i], ['Shell', /\bshell\b/i], ['Fins', /\bfins?\b/i],
];

function differences(p, ca, cb) {
  const A = { x: p.a, c: ca };
  const B = { x: p.b, c: cb };
  const tip = p.tips.map((t) => t.tip).join(' ');
  const found = new Map();
  for (const [label, base, re, differs] of DATA_DIMS) {
    if (!differs(A, B, tip)) continue;
    const named = label === 'Covering' ? `${p.a.cv} vs ${p.b.cv}` : label;
    const mentioned = re.test(tip);
    found.set(label, { label: named, key: label, mentioned, score: base + (mentioned ? 40 : 0) });
  }
  const named = () => [...found.values()].map((d) => d.label.toLowerCase()).join(' ');
  for (const [label, re] of TIP_DIMS) {
    if (!re.test(tip) || found.has(label) || named().includes(label.toLowerCase())) continue;
    found.set(label, { label, key: label, score: 60 });
  }
  return [...found.values()].sort((x, y) => y.score - x.score);
}

// One sentence restating a difference the data holds for both animals,
// or null when it can't be said from the data alone.
function dataLine(key, a, ca, b, cb) {
  const pair = (fa, fb) => (fa === fb ? null : `${capFirst(the(a))} ${fa}; ${the(b)} ${fb}.`);
  // Seasonal figures ("about 3 kg in March") need the context the table gives.
  const plain = (v) => v && !/[:()]/.test(firstClause(v)) &&
    !/\bin (spring|summer|autumn|winter|January|February|March|April|May|June|July|August|September|October|November|December)\b/.test(firstClause(v));
  switch (key) {
    case 'Size':
      if (ca && cb && plain(ca.wt) && plain(cb.wt)) return `Weight: ${midSentence(a.n)} ${lowerFirst(firstClause(ca.wt))}; ${midSentence(b.n)} ${lowerFirst(firstClause(cb.wt))}.`;
      if (ca && cb && plain(ca.len) && plain(cb.len)) return `Length: ${midSentence(a.n)} ${lowerFirst(firstClause(ca.len))}; ${midSentence(b.n)} ${lowerFirst(firstClause(cb.len))}.`;
      // Measured weights the sentence can't use outrank the size scale.
      if ((ca && ca.wt) || (cb && cb.wt)) return null;
      return a.sz !== b.sz ? pair(`is ${SIZE_WORD[a.sz]}`, `is ${SIZE_WORD[b.sz]}`) : null;
    case 'Flight': return pair(FLY_WORD(a), FLY_WORD(b));
    case 'Danger': return pair(DANGER_WORD(a), DANGER_WORD(b));
    case 'Diet': return pair(DIET_WORD[a.d], DIET_WORD[b.d]);
    case 'Range': return pair(livesIn(a), livesIn(b));
    case 'Day vs Night': return pair(ACTIVE_WORD(a), ACTIVE_WORD(b));
    case 'Covering': return pair(`has ${COVER_WORD[a.cv] || a.cv.toLowerCase()}`, `has ${COVER_WORD[b.cv] || b.cv.toLowerCase()}`);
    case 'Domestication': return pair(a.dm ? 'is domesticated' : 'is wild', b.dm ? 'is domesticated' : 'is wild');
    case 'Legs': return pair(`has ${a.lg === 0 ? 'no' : a.lg} legs`, `has ${b.lg === 0 ? 'no' : b.lg} legs`);
    case 'Lifespan': return pair(`lives ${a.lf}`, `lives ${b.lf}`);
    default: return null;
  }
}

// The words a page leads with: the title and H1 question, its brackets,
// the direct answer and the meta description.
function headline(p, ca, cb, entry) {
  const [x, y] = entry && entry.first === p.s2 ? [p.b, p.a] : [p.a, p.b];
  const [cx, cy] = x === p.a ? [ca, cb] : [cb, ca];
  const h1 = `${titleCase(x.n)} vs ${titleCase(y.n)}: What's the Difference?`;
  const diffs = differences(p, ca, cb);

  let dims = entry && entry.dims ? entry.dims.slice() : diffs.slice(0, 3).map((d) => d.label);
  const withDims = (d) => (d.length ? `${h1} (${d.join(', ')})` : h1);
  while (dims.length > 2 && withDims(dims).length > MAX_TITLE) dims.pop();
  const title = withDims(dims);

  // Data sentences that add something the tips don't already say.
  const tipText = p.tips.map((t) => t.tip).join(' ');
  const lines = diffs
    .filter((d) => d.key !== 'Parents' && d.score >= 25)
    .map((d) => [d, dataLine(d.key, x, cx, y, cy)])
    .filter(([d, l]) => l && !tipText.includes(l) && (!d.mentioned || /^(Weight|Length):/.test(l)))
    .map(([, l]) => l);

  // The direct answer: the tips, then data until it's two or three
  // sentences long.
  const answer = p.tips.map((t) => t.tip);
  let count = answer.reduce((n, t) => n + sentences(t).length, 0);
  for (const l of lines) {
    if (count >= 3 || (count >= 2 && answer.length > 1)) break;
    answer.push(l);
    count++;
  }

  // Meta description: a tip that fits whole (either side's - the two
  // usually make the same point), else the first one's opening sentence,
  // then a data sentence if there's room.
  const whole = p.allTips.map((t) => t.tip).find((t) => t.length <= MAX_DESC);
  let description = whole || p.tips[0].tip;
  if (description.length > MAX_DESC) {
    const first = sentences(description)[0];
    description = first.length <= MAX_DESC ? first : clip(description);
  }
  for (const l of lines) {
    if (description.length + 1 + l.length <= MAX_DESC) { description += ' ' + l; break; }
  }

  return { h1, title, dims, answer, description, order: [x, y] };
}

/* -- Page parts ------------------------------------------------------ */

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

// Each animal's licensed lead photo (tools/photos.json, the same one its
// own page shows) with the credit the licence requires, linking to its
// page. No photo on file: its emoji, as on the animal page.
function photoCard(x, slug, eager) {
  const ph = PHOTOS[slug];
  const name = `<a class="cmp-ph-name" href="/animals/${slug}">${escapeHtml(x.n)}</a>`;
  if (!ph) {
    return `<figure class="cmp-ph"><a class="cmp-ph-img cmp-ph-none" href="/animals/${slug}" tabindex="-1" aria-hidden="true"><span>${x.e || '🐾'}</span></a><figcaption>${name}</figcaption></figure>`;
  }
  return `<figure class="cmp-ph"><a class="cmp-ph-img" href="/animals/${slug}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(ph.src)}" alt="${escapeHtml(x.n)}" width="${ph.width}" height="${ph.height}"${eager ? '' : ' loading="lazy"'} decoding="async"></a><figcaption>${name}<span class="cmp-ph-credit">${creditHtml(ph)}</span></figcaption></figure>`;
}

// The sources behind what this page shows from each animal: the tip and
// the overview, the fields the data sentences use, plus any source not
// tied to particular fields.
function sourcesFor(c) {
  const used = ['cf', 'ov', 'wt', 'len', 'sci'];
  return ((c && c.src) || []).filter((s) => !s.for || s.for.some((f) => used.includes(f)));
}

function pairBody(p, published, entry, showQa) {
  const { a, b } = p;
  const ca = published[p.s1] || null;
  const cb = published[p.s2] || null;
  const head = headline(p, ca, cb, entry);
  const [x, y] = head.order;
  const slugOf = (z) => (z === a ? p.s1 : p.s2);

  const ansB = answers(b, cb);
  const ans = answers(a, ca).map(([k, v, cls], i) => [k, { text: v, cls }, { text: ansB[i][1], cls: ansB[i][2] }]);
  const differ = ans.filter(([, l, r]) => l.text !== r.text).map(([k]) => k.replace(/\?$/, '').toLowerCase());
  const summary = differ.length
    ? `They differ on ${differ.length} of the ${ans.length} quick answers: ${differ.join(', ')}.`
    : `They give the same ${ans.length} quick answers, so in the game it comes down to the clues above.`;
  const glance = glanceRows(a, ca, b, cb).map(([k, l, r]) => [k, { text: l }, { text: r }]);

  const qa = showQa && entry && entry.qa ? entry.qa : null;
  const qaHtml = qa ? `
  <h2>Common questions</h2>
${entry.rv ? '' : '  <p class="coll-draft">DRAFT: these answers are not reviewed yet.</p>\n'}  <div class="cmp-qa">
${qa.map((q) => `    <h3>${escapeHtml(q.q)}</h3>\n    <p>${escapeHtml(q.a)}</p>`).join('\n')}
  </div>
` : '';

  const about = [[a, p.s1, ca], [b, p.s2, cb]].map(([z, slug, c]) => {
    const ov = c && c.ov ? `\n  <p>${escapeHtml(c.ov)}</p>` : '';
    return `  <h3>${escapeHtml(z.n)}</h3>${ov}
  <p class="cmp-more"><a href="/animals/${slug}">Everything on the ${escapeHtml(midSentence(z.n))} page</a></p>`;
  }).join('\n');

  const seen = new Set();
  const srcItems = [ca, cb].flatMap(sourcesFor).filter((s) => !seen.has(s.url) && seen.add(s.url))
    .map((s) => `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener">${escapeHtml(s.title)}</a></li>`).join('\n    ');
  const rv = [ca && ca.rv, cb && cb.rv, entry && entry.rv].filter(Boolean).sort().pop();

  return {
    rv,
    head,
    html: `  <p class="coll-up"><a href="/compare">Commonly confused animals</a></p>
  <h1>${escapeHtml(head.h1)}</h1>
  <p class="lede cmp-answer">${escapeHtml(head.answer.join(' '))}</p>
  <div class="cmp-photos">${photoCard(x, slugOf(x), true)}${photoCard(y, slugOf(y), true)}</div>
${qaHtml}
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
    More look-alikes: <a href="/compare">Commonly confused animals</a>.</p>`,
  };
}

const pairLabel = (p) => `${p.a.n} vs ${midSentence(p.b.n)}`;

function hubBody(pairs) {
  const items = pairs.map((p) =>
    `<li><a href="/compare/${p.key}">${escapeHtml(pairLabel(p))}</a><span class="coll-line">${escapeHtml(sentences(p.tips[0].tip)[0])}</span></li>`
  ).join('\n    ');
  return `  <p class="coll-up"><a href="/explore">Explore</a></p>
  <h1>Commonly confused animals</h1>
  <p class="lede">Animals people often mix up, one pair to a page: what the difference is,
    then their quick answers next to each other, with the ones that differ marked.</p>
  <p>The pairs are the look-alikes listed on the animals' own pages, not every possible
    combination.</p>
  <p class="coll-total">${pairs.length} pairs, A to Z.</p>

  <ul class="coll-list">
    ${items}
  </ul>

  <p class="coll-foot">How each answer is decided: <a href="/how-we-answer">How we answer</a>.
    Every animal, in one list: <a href="/browse">All animals</a>. Lists by region, habitat
    and answer: <a href="/explore">Explore</a>.</p>`;
}

function clip(s) {
  if (s.length <= MAX_DESC) return s;
  const cut = s.slice(0, MAX_DESC - 1);
  return cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

const HUB_TITLE = 'Commonly Confused Animals: Look-alikes Side by Side | Guess My Animal';
const HUB_DESC = 'Animals people often mix up, one pair to a page: what the difference is, and their quick answers side by side.';

// Writes the pages; returns their URLs for the sitemap. With drafts, every
// compare.json entry is shown (unapproved ones marked) and the pages go to
// preview/compare instead, noindex.
function buildCompare(published, { styleVersion, drafts = false }) {
  const pairs = pairsFrom(published);
  const entries = loadEntries();
  const errors = validateEntries(entries, pairs, published);
  if (errors.length) throw new Error('content/compare.json has errors:\n  ' + errors.join('\n  '));

  const outRoot = drafts ? path.join(ROOT, 'preview', 'compare') : path.join(ROOT, 'compare');
  const written = new Set();
  const write = (full, html) => {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, html);
    written.add(full);
  };

  const urls = [];
  const heads = {};
  for (const p of pairs) {
    const raw = entries[p.key] || null;
    // Live: an entry counts only once reviewed. Drafts: all of it shows.
    const entry = raw && (raw.rv || drafts) ? raw : null;
    const { rv, head, html } = pairBody(p, published, entry, true);
    heads[p.key] = head;
    write(path.join(outRoot, p.key + '.html'), page({
      title: head.title,
      description: head.description,
      canonical: `${SITE}/compare/${p.key}`,
      styleVersion, mainClass: 'coll cmp', draft: drafts,
      body: html,
      ld: jsonld.scriptTag(jsonld.page({
        path: `/compare/${p.key}`, name: head.h1, description: head.description, dateModified: rv,
        image: PHOTOS[p.s1] ? PHOTOS[p.s1].src : null,
        crumbs: [['Home', '/'], ['Commonly confused animals', '/compare'], [head.h1, `/compare/${p.key}`]],
      })),
    }));
    urls.push({ loc: `${SITE}/compare/${p.key}`, lastmod: rv || null });
  }

  const hub = drafts ? path.join(ROOT, 'preview', 'compare.html') : path.join(ROOT, 'compare.html');
  if (pairs.length) {
    write(hub, page({
      title: HUB_TITLE,
      description: HUB_DESC,
      canonical: `${SITE}/compare`,
      styleVersion, draft: drafts,
      body: hubBody(pairs),
      ld: jsonld.scriptTag(jsonld.page({
        type: 'CollectionPage', path: '/compare', name: 'Commonly confused animals', description: HUB_DESC,
        crumbs: [['Home', '/'], ['Commonly confused animals', '/compare']],
      })),
    }));
  } else if (fs.existsSync(hub)) {
    fs.unlinkSync(hub);
  }
  prune(outRoot, written);

  return { pairs, heads, urls: pairs.length ? [{ loc: `${SITE}/compare`, lastmod: null }].concat(urls) : [] };
}

module.exports = { buildCompare, pairsFrom, headline, loadEntries, FILE };

if (require.main === module) {
  const { loadContent } = require('./content.js');
  const { published } = loadContent();
  const drafts = process.argv.includes('--drafts');
  const styleVersion = fs.readFileSync(path.join(ROOT, 'tools', 'build-seo.js'), 'utf8').match(/STYLE_VERSION = '([^']+)'/)[1];
  const { pairs } = buildCompare(published, { styleVersion, drafts });
  console.log(`wrote ${pairs.length} pair pages to ${drafts ? 'preview/compare' : 'compare'}`);
}
