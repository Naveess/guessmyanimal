// Which built pages search engines may index (the thin-content audit,
// approved 2026-11-02). content/indexable.json lists the animals, explore
// lists and site pages that stay in the sitemap; every other page is still
// written and linked for players, but carries noindex,follow and has no
// sitemap entry. Compare pages aren't listed: one becomes indexable when
// its "Common questions" are approved (content/compare.json rv), see
// tools/build-compare.js.
const LIST = require('../content/indexable.json');

const animals = new Set(LIST.animals);
const explore = new Set(LIST.explore);
const pages = new Set(LIST.pages);

module.exports = {
  NOINDEX: 'noindex,follow',
  LIST,
  animal: (slug) => animals.has(slug),
  explore: (key) => explore.has(key),
  page: (p) => pages.has(p),
};
