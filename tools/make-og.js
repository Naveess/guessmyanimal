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
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#e7f0e9;color:#10201a;
       font-family:Fredoka,sans-serif;display:flex;flex-direction:column;
       justify-content:center;padding:0 78px;position:relative;overflow:hidden}
  .paws{position:absolute;inset:0;font-size:120px;opacity:.07;line-height:1.5;
        letter-spacing:38px;word-spacing:38px;padding:26px;user-select:none}
  .in{position:relative}
  h1{font-size:104px;font-weight:700;letter-spacing:-.03em;line-height:.98}
  em{font-style:normal;color:#e8442a}
  p{font-size:35px;font-weight:500;color:#4a6357;margin-top:20px;max-width:20ch}
  .row{display:flex;gap:14px;margin-top:38px}
  .t{background:#fff;border:3px solid #cfe0d5;border-radius:16px;padding:12px 20px;
     font-size:26px;font-weight:600}
  .t.y{background:#dcefe2;border-color:#1d7a4c;color:#1d7a4c}
  .t.d{background:#fde8e4;border-color:#e8442a;color:#e8442a}
  /* Kept clear of the chip row: at 150px the sloth sat on top of the
     "Dangerous" chip and made both unreadable. */
  .zoo{position:absolute;right:64px;top:150px;font-size:128px;line-height:1;
       display:flex;flex-direction:column;gap:2px;align-items:center}
  .in{max-width:660px}
</style></head><body>
<div class="paws">🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾 🐾</div>
<div class="in">
  <h1>Guess my<br><em>animal</em></h1>
  <p>The cheat sheet for the animal guessing game.</p>
  <div class="row">
    <span class="t">Carnivore?</span>
    <span class="t y">Nocturnal ✓</span>
    <span class="t d">Dangerous</span>
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
