// Loads and validates the editorial content in content/animals/<slug>.json.
//
// animals.js is the game data: short, shipped to every visitor, and
// drives search and the games. This is the reference content that
// sits beside it on an animal's page: our own overview, the reasoning
// behind hedged answers, real sizes, habitat, range, diet, look-alikes
// and sources. One file per animal so a review is a readable diff.
//
// Nothing is published until a person has reviewed it. A file whose
// `rv` (last reviewed, YYYY-MM-DD) is null is a draft: it's validated
// like everything else, but the build leaves it out of the pages and
// app.js ignores it (except in local draft preview, see app.js).
//
// Used by tools/build-seo.js (which fails the build on any error here)
// and tools/content-review.js.

const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const { WHY_KEYS, HABITATS, IUCN } = require('../render-data.js');

const DIR = path.join(__dirname, '..', 'content', 'animals');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

const BY_SLUG = {};
for (const a of ANIMALS) BY_SLUG[slugify(a.n)] = a;

const KEYS = ['sci', 'ov', 'why', 'hb', 'len', 'ht', 'wt', 'rg', 'df', 'cf', 'fx', 'iu', 'grp', 'src', 'rv', 'notes'];
// Fields that make a factual claim, so an entry with any of them has to
// say where the claim comes from.
const CLAIMS = ['ov', 'why', 'len', 'ht', 'wt', 'rg', 'df', 'fx', 'iu', 'sci'];
const SRC_FOR = ['sci', 'ov', 'why', 'hb', 'len', 'ht', 'wt', 'rg', 'df', 'cf', 'fx', 'iu', 'grp'];

function validate(slug, c) {
  const errs = [];
  const err = (m) => errs.push(`${slug}: ${m}`);
  const str = (k, max) => {
    if (c[k] == null) return;
    if (typeof c[k] !== 'string' || !c[k].trim()) return err(`${k} must be a non-empty string`);
    if (max && c[k].length > max) err(`${k} is ${c[k].length} chars, over ${max}`);
  };

  const a = BY_SLUG[slug];
  if (!a) err('no animal in animals.js has this slug');

  for (const k of Object.keys(c)) if (!KEYS.includes(k)) err(`unknown field "${k}"`);

  str('sci', 80); str('ov', 320); str('len', 60); str('ht', 60); str('wt', 60); str('rg', 220); str('df', 220);

  if (c.why != null) {
    if (typeof c.why !== 'object' || Array.isArray(c.why)) err('why must be an object');
    else for (const k of Object.keys(c.why)) {
      if (!WHY_KEYS.includes(k)) err(`why.${k} is not an answer that takes a note (${WHY_KEYS.join(', ')})`);
      else if (typeof c.why[k] !== 'string' || !c.why[k].trim()) err(`why.${k} must be a non-empty string`);
      else if (c.why[k].length > 200) err(`why.${k} is ${c.why[k].length} chars, over 200`);
    }
  }

  if (c.hb != null) {
    if (!Array.isArray(c.hb) || !c.hb.length) err('hb must be a non-empty array');
    else for (const h of c.hb) if (!HABITATS[h]) err(`hb "${h}" is not one of ${Object.keys(HABITATS).join(', ')}`);
  }

  if (c.iu != null && !IUCN[c.iu]) err(`iu "${c.iu}" is not an IUCN category (${Object.keys(IUCN).join(', ')})`);
  if (c.iu != null && !c.sci) err('iu needs sci, which the IUCN link searches for');

  if (c.cf != null) {
    if (!Array.isArray(c.cf)) err('cf must be an array');
    else for (const x of c.cf) {
      if (!x || !BY_SLUG[x.slug]) err(`cf slug "${x && x.slug}" is not an animal`);
      else if (x.slug === slug) err('cf lists the animal itself');
      if (!x || typeof x.tip !== 'string' || !x.tip.trim()) err(`cf "${x && x.slug}" needs a tip`);
      else if (x.tip.length > 220) err(`cf "${x.slug}" tip is ${x.tip.length} chars, over 220`);
    }
  }

  if (c.grp != null) {
    if (!Array.isArray(c.grp) || !c.grp.length) err('grp must be a non-empty array of slugs');
    else for (const g of c.grp) if (!BY_SLUG[g]) err(`grp slug "${g}" is not an animal`);
  }

  if (c.fx != null) {
    if (!Array.isArray(c.fx) || c.fx.length > 2) err('fx must be an array of at most 2 facts');
    else for (const f of c.fx) if (typeof f !== 'string' || !f.trim() || f.length > 200) err('each fx must be a string of at most 200 chars');
  }

  const claims = CLAIMS.filter((k) => c[k] != null);
  if (claims.length && !(Array.isArray(c.src) && c.src.length)) err(`makes claims (${claims.join(', ')}) but has no src`);
  if (c.src != null) {
    if (!Array.isArray(c.src)) err('src must be an array');
    else for (const s of c.src) {
      if (!s || typeof s.title !== 'string' || !s.title.trim()) err('every src needs a title');
      if (!s || typeof s.url !== 'string' || !/^https:\/\/[^\s]+$/.test(s.url)) err(`src url "${s && s.url}" must be https`);
      if (s && s.for != null && (!Array.isArray(s.for) || s.for.some((k) => !SRC_FOR.includes(k)))) err(`src "${s.title}" has a bad "for" list`);
    }
  }

  if (c.rv != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.rv)) err('rv must be YYYY-MM-DD or null');
    else if (c.rv > new Date().toISOString().slice(0, 10)) err('rv is in the future');
  }
  if (c.notes != null && typeof c.notes !== 'string') err('notes must be a string');
  return errs;
}

// { all: {slug: content}, published: {slug: content}, errors: [] }.
// `notes` is for the reviewer and never leaves this file.
function loadContent() {
  const all = {};
  const published = {};
  const errors = [];
  if (!fs.existsSync(DIR)) return { all, published, errors };
  for (const f of fs.readdirSync(DIR).sort()) {
    if (!f.endsWith('.json')) continue;
    const slug = f.slice(0, -5);
    let c;
    try { c = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
    catch (e) { errors.push(`${slug}: not valid JSON (${e.message})`); continue; }
    errors.push(...validate(slug, c));
    all[slug] = c;
    if (c.rv) {
      const pub = Object.assign({}, c);
      delete pub.notes;
      published[slug] = pub;
    }
  }
  return { all, published, errors };
}

module.exports = { loadContent, validate, BY_SLUG, slugify, DIR };
