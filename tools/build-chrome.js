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

for (const file of PAGES) {
  const full = path.join(ROOT, file);
  const html = fs.readFileSync(full, 'utf8');
  const { out, count } = inject(html, file);
  if (!count) console.warn(`warning: ${file} has no chrome markers`);
  if (out !== html) fs.writeFileSync(full, out);
  console.log(`${file}: ${count} block(s)`);
}

module.exports = { inject };
