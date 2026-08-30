// Renders og.png — the card that shows when someone posts the link.
// Since the whole point is telling friends about it, a bare URL preview
// would be a real loss.
//
// Run: node tools/make-og.js

const fs = require('fs');
const path = require('path');
const { chromium } = require('C:/Users/navee/Documents/lead-finder/node_modules/playwright-core');

const OUT = path.join(__dirname, '..', 'og.png');

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@500;700;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#ffce1f;color:#17150f;
       font-family:Figtree,sans-serif;display:flex;align-items:center;
       padding:0 74px;position:relative;overflow:hidden}
  .in{position:relative;max-width:680px}
  .mark{width:96px;height:96px;fill:#17150f;margin-bottom:26px;display:block}
  h1{font-size:96px;font-weight:900;letter-spacing:-.045em;line-height:.93}
  p{font-size:33px;font-weight:500;color:rgba(23,21,15,.68);margin-top:22px}
  .row{display:flex;gap:12px;margin-top:40px}
  .t{background:#fff;border-radius:999px;padding:13px 24px;
     font-size:26px;font-weight:800}
  .t.g{background:#e1f3ea;color:#0b7c55}
  .t.b{background:#fce4df;color:#c93018}
  /* The emoji stack sits clear of the chip row - overlapping it made
     both the animal and the chip underneath unreadable. */
  .zoo{position:absolute;right:70px;top:96px;font-size:150px;line-height:1.06;
       display:flex;flex-direction:column;align-items:center}
</style></head><body>
<div class="in">
  <svg class="mark" viewBox="0 0 64 64">
    <ellipse cx="32" cy="41" rx="14.5" ry="12"/>
    <ellipse cx="14.5" cy="27" rx="6.4" ry="8"/>
    <ellipse cx="26" cy="16.5" rx="6.4" ry="8.6"/>
    <ellipse cx="38" cy="16.5" rx="6.4" ry="8.6"/>
    <ellipse cx="49.5" cy="27" rx="6.4" ry="8"/>
  </svg>
  <h1>Guess my<br>animal</h1>
  <p>The cheat sheet for the animal guessing game.</p>
  <div class="row">
    <span class="t">Carnivore?</span>
    <span class="t g">Nocturnal</span>
    <span class="t b">Dangerous</span>
  </div>
</div>
<div class="zoo">🦥🐙</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(HTML, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT });
  await browser.close();
  console.log('  wrote og.png  ' + (fs.statSync(OUT).size / 1024).toFixed(0) + ' KB');
})();
