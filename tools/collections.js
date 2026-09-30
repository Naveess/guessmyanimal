/* Collection pages: /explore and /explore/<kind>/<key>.
 *
 * Each page lists every animal that shares ONE answer - one region, one
 * habitat, one kind of animal, or one Quick Answers value - with a line
 * about why it's there. One dimension per page, always: a page that
 * combined them (nocturnal + Africa + carnivore) is exactly what someone
 * mid-game would type in to solve it, and PRODUCT.md rules that out.
 * There is deliberately no filter UI and no page that intersects two.
 *
 * WHICH animals go on a page is decided here, from animals.js and the
 * reviewed content. The words a person reads first - the title and the
 * intro - live in content/collections.json and, like an animal's
 * content, only go live once a person sets `rv` (npm run approve --
 * explore/<kind>/<key>). An unapproved collection gets no page, no
 * sitemap entry and no link from the hub.
 *
 * Called by tools/build-seo.js, which writes the files and the sitemap.
 */
const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { HABITATS } = require('../render-data.js');

const FILE = path.join(__dirname, '..', 'content', 'collections.json');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

// The first sentence of an overview, for a one-line entry in a list.
function firstSentence(text) {
  const m = String(text || '').match(/^(.+?[.!?])(?=\s+[A-Z"“(]|$)/);
  return (m ? m[1] : String(text || '')).trim();
}

// "Americas" in animals.js means spread across all three, so it belongs
// on each of their pages.
const inRegion = (label) => (a) => a.r.includes(label) ||
  (a.r.includes('Americas') && /America$/.test(label));

const REGIONS = [
  ['africa', 'Africa'], ['asia', 'Asia'], ['europe', 'Europe'],
  ['north-america', 'North America'], ['central-america', 'Central America'],
  ['south-america', 'South America'], ['australia', 'Australia'],
  ['new-zealand', 'New Zealand'], ['new-guinea', 'New Guinea'],
  ['madagascar', 'Madagascar'], ['arctic', 'Arctic'], ['antarctic', 'Antarctic'],
  ['worldwide', 'Worldwide'],
];

const CLASSES = [
  ['mammals', ['Mammal']], ['birds', ['Bird']], ['reptiles', ['Reptile']],
  ['amphibians', ['Amphibian']], ['fish', ['Fish']], ['insects', ['Insect']],
  ['arachnids', ['Arachnid']], ['crustaceans', ['Crustacean']], ['molluscs', ['Mollusc']],
  ['other-invertebrates', ['Cnidarian', 'Annelid', 'Echinoderm', 'Myriapod', 'Sponge', 'Tardigrade']],
];

// The Quick Answers lists. Each section is one value of one answer, in
// the words the animal page uses for it (render-data.js answers()), and
// its line is the animal's why-note for that answer when it has one.
const QUESTIONS = [
  ['dangerous', 'dg', [['yes', 'Dangerous: yes'], ['some', 'Dangerous: can be']]],
  ['pets', 'p', [['common', 'Commonly kept as pets'], ['some', 'Sometimes kept as pets']]],
  ['nocturnal', 'ac', [['night', 'Awake at night']]],
  ['hibernate', 'h', [[true, 'Hibernates']]],
  ['eaten', 'et', [['yes', 'Eaten: yes'], ['some', 'Eaten: in places']]],
];
const WHY_FOR = { dg: 'dg', p: 'p', ac: 'ac', h: 'h', et: 'et' };

// Every possible collection, whatever its review state: key, which hub
// group it sits in, its sections of animals, and the line under each.
function defineAll(content) {
  const byName = (x, y) => x.n.localeCompare(y.n);
  const entry = (a, line) => ({ a, slug: slugify(a.n), line });
  const ov = (a) => firstSentence((content[slugify(a.n)] || {}).ov);
  const list = [];

  for (const [key, label] of REGIONS) {
    const pick = ANIMALS.filter(inRegion(label)).sort(byName);
    list.push({
      key: 'region/' + key, group: 'region', label,
      sections: [{ items: pick.map((a) => entry(a, (content[slugify(a.n)] || {}).rg || ov(a))) }],
    });
  }
  for (const [key, label] of Object.entries(HABITATS)) {
    const pick = ANIMALS.filter((a) => ((content[slugify(a.n)] || {}).hb || []).includes(key)).sort(byName);
    list.push({ key: 'habitat/' + key, group: 'habitat', label, sections: [{ items: pick.map((a) => entry(a, ov(a))) }] });
  }
  for (const [key, cats] of CLASSES) {
    const pick = ANIMALS.filter((a) => cats.includes(a.c)).sort(byName);
    list.push({ key: 'kind/' + key, group: 'kind', label: key, sections: [{ items: pick.map((a) => entry(a, ov(a))) }] });
  }
  for (const [key, field, values] of QUESTIONS) {
    list.push({
      key: 'answer/' + key, group: 'answer', label: key,
      sections: values.map(([value, heading]) => ({
        heading: values.length > 1 ? heading : null,
        items: ANIMALS.filter((a) => a[field] === value).sort(byName).map((a) => {
          const c = content[slugify(a.n)] || {};
          return entry(a, (c.why && c.why[WHY_FOR[field]]) || firstSentence(c.ov));
        }),
      })),
    });
  }
  for (const col of list) col.count = col.sections.reduce((n, s) => n + s.items.length, 0);
  return list;
}

function loadIntros() {
  return fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
}

// Shape check for content/collections.json, so a typo fails the build
// instead of shipping a page with no title.
function validate(intros, defs) {
  const errs = [];
  const keys = new Set(defs.map((d) => d.key));
  for (const [k, v] of Object.entries(intros)) {
    if (!keys.has(k)) { errs.push(`collections.json: "${k}" is not a collection`); continue; }
    if (!v.title || typeof v.title !== 'string') errs.push(`${k}: needs a title`);
    if (!Array.isArray(v.intro) || !v.intro.length || v.intro.some((p) => typeof p !== 'string' || !p.trim())) errs.push(`${k}: intro must be a non-empty array of paragraphs`);
    if (v.desc && v.desc.length > 158) errs.push(`${k}: desc is ${v.desc.length} chars, over 158`);
    if (v.rv != null && !/^\d{4}-\d{2}-\d{2}$/.test(v.rv)) errs.push(`${k}: rv must be YYYY-MM-DD or null`);
  }
  return errs;
}

// The collections that go live: defined, with an approved intro, and not
// empty.
function published(content) {
  const defs = defineAll(content);
  const intros = loadIntros();
  const errors = validate(intros, defs);
  const live = defs
    .filter((d) => intros[d.key] && intros[d.key].rv && d.count)
    .map((d) => Object.assign(d, intros[d.key]));
  return { defs, intros, live, errors };
}

module.exports = { defineAll, loadIntros, validate, published, firstSentence, FILE };
