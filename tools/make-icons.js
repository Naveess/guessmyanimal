// Renders PWA icons from the same paw mark used everywhere else on the
// site (favicon.svg), so the installed app icon is the existing brand
// mark, not new artwork. Three shapes for three jobs:
//   - icon-192 / icon-512: "any" purpose, used as-is by browsers/desktop
//   - icon-maskable-512: extra padding so Android's circular/squircle
//     icon mask doesn't clip the paw - maskable icons must keep all
//     content inside the centre ~80% safe zone or the OS crops it
//   - apple-touch-icon: iOS applies its own rounding, so this ships as a
//     plain square: pre-rounding it too would double up the corners
//
// Run: node tools/make-icons.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/navee/Documents/lead-finder/node_modules/playwright-core');

const OUT = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

const PAW = `
  <ellipse cx="32" cy="41" rx="13.5" ry="11.2"/>
  <ellipse cx="15.5" cy="27.5" rx="6" ry="7.5"/>
  <ellipse cx="26.5" cy="17.5" rx="6" ry="8"/>
  <ellipse cx="37.5" cy="17.5" rx="6" ry="8"/>
  <ellipse cx="48.5" cy="27.5" rx="6" ry="7.5"/>
`;

// Standard: matches favicon.svg exactly - rounded-square yellow ground,
// paw filling almost the whole 64x64 viewBox.
const standardSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="15" fill="#ffce1f"/>
  <g fill="#17150f">${PAW}</g>
</svg>`;

// Maskable: no rounded corners (the OS mask draws the shape), paw
// scaled to ~62% and centred so a circular crop still shows all five
// pads with room to spare.
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#ffce1f"/>
  <g fill="#17150f" transform="translate(32 32) scale(0.62) translate(-32 -32)">${PAW}</g>
</svg>`;

// Apple touch icon: same as standard but iOS re-rounds it itself, so
// this ships as a flat square - a pre-rounded source would show a
// visible double corner under iOS's own mask.
const appleSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#ffce1f"/>
  <g fill="#17150f">${PAW}</g>
</svg>`;

const TARGETS = [
  { svg: standardSvg, size: 192, file: 'icon-192.png' },
  { svg: standardSvg, size: 512, file: 'icon-512.png' },
  { svg: maskableSvg, size: 512, file: 'icon-maskable-512.png' },
  { svg: appleSvg, size: 180, file: 'apple-touch-icon.png' },
];

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  for (const t of TARGETS) {
    const page = await browser.newPage({ viewport: { width: t.size, height: t.size }, deviceScaleFactor: 1 });
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0} html,body{width:${t.size}px;height:${t.size}px}
      svg{display:block;width:${t.size}px;height:${t.size}px}
    </style></head><body>${t.svg}</body></html>`;
    await page.setContent(html);
    const out = path.join(OUT, t.file);
    await page.screenshot({ path: out });
    await page.close();
    console.log(`  wrote icons/${t.file}  (${(fs.statSync(out).size / 1024).toFixed(1)} KB)`);
  }
  await browser.close();
})();
