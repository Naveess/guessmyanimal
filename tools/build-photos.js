/* Looks up every animal's lead photo and its licence credit, once, and
 * caches the result in tools/photos.json - which build-seo.js then bakes
 * into each animal page, so the photo (and its credit) are in the HTML
 * before any JS runs instead of arriving after two API round trips.
 *
 *   node tools/build-photos.js            fill in animals not yet cached
 *   node tools/build-photos.js --refresh  re-check every animal
 *
 * Needs a network connection; nothing else in the build does. Wikipedia's
 * lead image for an established species rarely changes, so --refresh is
 * an occasional chore, not an every-build one. Same rules as the live
 * lookup in app.js, because it's the same code: photo-credit.js.
 */
const fs = require('fs');
const path = require('path');
const { ANIMALS } = require('../animals.js');
const PhotoCredit = require('../photo-credit.js');

const OUT = path.join(__dirname, 'photos.json');
const UA = 'GuessMyAnimal-build/1.0 (https://guessmyanimal.com; naveessharma@gmail.com)';
const refresh = process.argv.includes('--refresh');

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (res.status === 404) return null;
    if (res.ok) return res.json();
    await sleep(1500 * (attempt + 1));   // 429/5xx: back off and retry
  }
  throw new Error('failed: ' + url);
}

async function lookup(a) {
  const title = a.w || a.n.replace(/ /g, '_');
  const summary = await getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title));
  const img = summary && (summary.originalimage || summary.thumbnail);
  const file = img && PhotoCredit.fileTitleFromUrl(img.source);
  if (!file) return null;
  return PhotoCredit.fromApi(await getJson(PhotoCredit.apiUrl(file)));
}

(async () => {
  const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const todo = ANIMALS.filter((a) => refresh || !(slugify(a.n) in cache));
  let done = 0, none = 0;
  // Two at a time: four got rate-limited (429) partway through a full run.
  const queue = todo.slice();
  async function worker() {
    for (let a; (a = queue.shift());) {
      const slug = slugify(a.n);
      try {
        cache[slug] = await lookup(a);
        if (!cache[slug]) none++;
      } catch (err) {
        console.warn(`skip ${a.n}: ${err.message}`);   // left uncached; next run retries
      }
      if (++done % 50 === 0) console.log(`${done}/${todo.length}`);
    }
  }
  await Promise.all([worker(), worker()]);
  const sorted = Object.fromEntries(Object.keys(cache).sort().map((k) => [k, cache[k]]));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`photos.json: ${Object.keys(sorted).length} animals, ${done} looked up, ${none} with no usable photo`);
})();
