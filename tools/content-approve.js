// Marks drafts as reviewed: sets rv (last reviewed) to today on each named
// content/animals/<slug>.json. This is the one step that publishes
// content, so it's a person's call. Run it for an entry only after you've
// read it and checked it against its sources.
//
//   npm run approve -- lion tiger
//
// A collection page's intro (content/collections.json) is approved the
// same way, by its URL path:
//
//   npm run approve -- explore/region/africa explore/answer/dangerous
//
// Then npm run seo to bake it into the pages.

const fs = require('fs');
const path = require('path');
const { loadContent, DIR } = require('./content.js');

const slugs = process.argv.slice(2);
if (!slugs.length) {
  console.error('usage: npm run approve -- <slug> [<slug>...]');
  process.exit(1);
}

const { all, errors } = loadContent();
const today = new Date().toISOString().slice(0, 10);
let failed = false;

const cols = slugs.filter((s) => s.startsWith('explore/'));
if (cols.length) {
  const { FILE, loadIntros } = require('./collections.js');
  const intros = loadIntros();
  for (const arg of cols) {
    const key = arg.slice('explore/'.length);
    if (!intros[key]) { console.error(`${arg}: no "${key}" in content/collections.json`); failed = true; continue; }
    intros[key].rv = today;
    console.log(`${arg}: reviewed ${today}`);
  }
  fs.writeFileSync(FILE, JSON.stringify(intros, null, 2) + '\n');
}

for (const slug of slugs.filter((s) => !s.startsWith('explore/'))) {
  if (!all[slug]) { console.error(`${slug}: no content/animals/${slug}.json`); failed = true; continue; }
  const own = errors.filter((e) => e.startsWith(slug + ':'));
  if (own.length) { console.error(own.join('\n')); failed = true; continue; }
  // Rewritten from the parsed object so key order and formatting stay
  // the same as every other file.
  const c = all[slug];
  c.rv = today;
  fs.writeFileSync(path.join(DIR, slug + '.json'), JSON.stringify(c, null, 2) + '\n');
  console.log(`${slug}: reviewed ${today}`);
}
if (failed) process.exit(1);
console.log('Now run npm run seo to publish.');
