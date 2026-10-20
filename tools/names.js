/* How an animal's name reads in a sentence: its plural, its article and
 * the question its page title asks ("Is a Halibut Dangerous?").
 *
 * Regular English plural rules here; everything they get wrong lives in
 * content/names.json, one entry per slug, all fields optional:
 *   pl    the plural ("mice", "halibut")
 *   q     the whole title question, for a name no rule fits
 *         ("Is Coral Dangerous?")
 *   mass  true for a name used without "a" and with "is" ("coral")
 *
 * Used by tools/build-seo.js for the animal pages' titles and
 * descriptions.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'content', 'names.json');
const OVERRIDES = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
const FIELDS = ['pl', 'q', 'mass'];

// Words that keep their capital mid-sentence ("Komodo dragons").
const PROPER = /\b(arctic|african|tasmanian|komodo)\b/g;

// The name's last word decides the plural ("polar bear" -> "polar bears").
function plural(name, slug) {
  const o = OVERRIDES[slug];
  if (o && o.pl) return o.pl;
  const lower = name.toLowerCase().replace(PROPER, (w) => w.charAt(0).toUpperCase() + w.slice(1));
  const m = lower.match(/^(.*?)([a-z]+)$/);
  if (!m) return lower;
  const [, head, last] = m;
  let pl;
  if (/fish$/.test(last)) pl = last;                       // goldfish
  else if (/(s|x|z|ch|sh)$/.test(last)) pl = last + 'es';  // foxes, walruses
  else if (/[^aeiou]y$/.test(last)) pl = last.slice(0, -1) + 'ies'; // ponies
  else pl = last + 's';
  return head + pl;
}

// "a" or "an" by the sound the name starts with. Every name in the
// dataset starts with a plain vowel or consonant sound; names.json's q
// covers any that don't.
const article = (name) => (/^[aeiou]/i.test(name) ? 'an' : 'a');

const titleCase = (s) => s.replace(/(^|[\s-])([a-z])/g, (m, sp, c) => sp + c.toUpperCase());

// "Is a Halibut Dangerous?"
function question(name, slug) {
  const o = OVERRIDES[slug] || {};
  if (o.q) return o.q;
  return o.mass ? `Is ${titleCase(name)} Dangerous?` : `Is ${article(name)} ${titleCase(name)} Dangerous?`;
}

const isMass = (slug) => !!(OVERRIDES[slug] && OVERRIDES[slug].mass);

// Shape check, so a typo fails the build instead of shipping.
function validate(knownSlugs) {
  const errs = [];
  for (const [slug, o] of Object.entries(OVERRIDES)) {
    if (!knownSlugs.has(slug)) errs.push(`names.json: "${slug}" is not an animal`);
    for (const k of Object.keys(o)) if (!FIELDS.includes(k)) errs.push(`names.json: ${slug}: unknown field "${k}"`);
    if (o.q != null && (typeof o.q !== 'string' || !o.q.endsWith('?'))) errs.push(`names.json: ${slug}: q must end in "?"`);
  }
  return errs;
}

module.exports = { plural, article, question, isMass, titleCase, validate, FILE };
