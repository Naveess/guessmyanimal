/* Writes the shared chrome (tools/chrome.js) into every hand-written
 * page, between marker comments:
 *
 *   <!-- chrome:site-bar -->        ... <!-- /chrome:site-bar -->
 *   <!-- chrome:site-bar-index -->  ... <!-- /chrome:site-bar-index -->
 *   <!-- chrome:brand -->           ... <!-- /chrome:brand -->
 *
 * Whatever sits between a pair is replaced wholesale, so a page never
 * drifts from the others. browse.html is not listed: build-seo.js
 * generates that file whole and calls chrome.js itself.
 *
 * Run via `npm run seo` (which calls this last) or `npm run chrome`.
 */
const fs = require('fs');
const path = require('path');
const { BLOCKS } = require('./chrome.js');

const ROOT = path.join(__dirname, '..');
const PAGES = [
  'index.html', 'about.html', 'how-we-answer.html', 'contact.html',
  'privacy.html', 'terms.html', 'streamer.html', '404.html',
];

function inject(html, file) {
  let count = 0;
  const out = html.replace(
    /<!-- chrome:([a-z-]+) -->[\s\S]*?<!-- \/chrome:\1 -->/g,
    (whole, name) => {
      const make = BLOCKS[name];
      if (!make) throw new Error(`${file}: unknown chrome block "${name}"`);
      count++;
      return `<!-- chrome:${name} -->\n${make()}\n<!-- /chrome:${name} -->`;
    }
  );
  return { out, count };
}

// The site address in each hand-written page's head comes from the one
// constant (functions/_shared/site.json), not from whatever was typed:
// canonical and og:url name the page's own clean URL, og:image and the
// homepage's WebSite JSON-LD the same origin.
const SITE = require('../functions/_shared/site.json').url;
const ORIGIN = '(?:https?://[^/"]+)';
function stampSite(html, file) {
  const own = SITE + (file === 'index.html' ? '/' : '/' + file.replace(/\.html$/, ''));
  return html
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${own}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${own}$2`)
    .replace(new RegExp('(<meta property="og:image" content=")' + ORIGIN + '(/og\\.png")'), `$1${SITE}$2`)
    .replace(new RegExp('("(?:@id|url)":")' + ORIGIN + '(/)', 'g'), `$1${SITE}$2`);
}

for (const file of PAGES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');
  const injected = inject(html, file);
  const count = injected.count;
  const out = file === '404.html' ? injected.out : stampSite(injected.out, file);
  if (!count) console.warn(`warning: ${file} has no chrome markers`);
  if (out !== html) fs.writeFileSync(full, out);
  console.log(`${file}: ${count} block(s)`);
}

// robots.txt names the sitemap by its full address.
const robots = path.join(ROOT, 'robots.txt');
const rtxt = fs.readFileSync(robots, 'utf8');
const rout = rtxt.replace(/^Sitemap: .*$/m, `Sitemap: ${SITE}/sitemap.xml`);
if (rout !== rtxt) fs.writeFileSync(robots, rout);

module.exports = { inject, stampSite };
