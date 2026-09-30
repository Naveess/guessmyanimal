/* The site's shared page chrome, in one place.
 *
 * There is no templating at serve time - every page is a static file -
 * so this is the build-time equivalent of a layout partial. Two blocks:
 *
 *   siteBar(variant)  row 1: the sticky bar. Back slot on the left, the
 *                     nav (hamburger on phones, centred pill on desktop,
 *                     with Search in both), sound + theme on the right.
 *   brand()           row 2: the centred "Guess My Animal" mark, which
 *                     each page/view places at the top of its own flow
 *                     (it scrolls away; row 1 stays).
 *
 * tools/build-chrome.js writes these into every hand-written HTML file
 * between <!-- chrome:NAME --> ... <!-- /chrome:NAME --> markers, and
 * tools/build-seo.js calls them directly for the generated browse.html.
 * Edit here, then `npm run seo` - never edit the generated blocks in the
 * HTML by hand, the next build overwrites them.
 *
 * Variants exist only where the pages genuinely differ: index.html is
 * one document with three views (animal, Mystery, Party), so its back
 * slot holds each view's own back control (CSS shows the one for the
 * current view) and its Mystery/Party entries are buttons that open the
 * view in place rather than links that reload the page.
 */

const svg = (inner, extra) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${(extra && extra.w) || 2}" stroke-linecap="round"${extra && extra.join ? ' stroke-linejoin="round"' : ''} aria-hidden="true">${inner}</svg>`;

const ICON = {
  back: svg('<path d="M15 5 8 12l7 7"/>', { w: 2.4, join: true }),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  mag: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>', { w: 2.4 }),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>', { w: 2.4 }),
  chev: svg('<path d="m7 10 5 5 5-5"/>', { w: 2.4, join: true }),
  sound: svg('<path d="M4 9.5v5h3.2L12 18V6L7.2 9.5H4Z"/><path class="sw-waves" d="M16 9.2a4 4 0 0 1 0 5.6M18.3 6.8a7.5 7.5 0 0 1 0 10.4"/><path class="sw-mute" d="M15.5 9.5l5 5m0-5l-5 5"/>', { join: true }),
  light: svg('<circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>'),
  dark: svg('<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>', { join: true }),
  system: svg('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>', { join: true }),
};

const PAW = `<svg class="brand-paw" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="41" rx="14.5" ry="12"/><ellipse cx="14.5" cy="27" rx="6.4" ry="8"/><ellipse cx="26" cy="16.5" rx="6.4" ry="8.6"/><ellipse cx="38" cy="16.5" rx="6.4" ry="8.6"/><ellipse cx="49.5" cy="27" rx="6.4" ry="8"/></svg>`;

const GITHUB = 'https://github.com/Naveess/guessmyanimal';

function backSlot(variant) {
  if (variant === 'index') {
    // One slot, one visible control: CSS picks by which view is showing
    // (see .sb-start in style.css). Each keeps the id its own script
    // already binds - app.js #back, mystery.js #mysteryBack, party.js
    // #partyLeave - so no view's back behaviour changes. The splash has
    // no "back", so the slot is empty there (About is in the menu).
    return [
      `<button class="back" id="back" type="button" aria-label="Back to search">${ICON.back}</button>`,
      `<button class="back" id="mysteryBack" type="button" aria-label="Back to search">${ICON.back}</button>`,
      `<button class="back" id="partyLeave" type="button" aria-label="Leave the party">${ICON.back}</button>`,
    ].join('\n    ');
  }
  return `<a class="back" href="/" aria-label="Back to search">${ICON.back}</a>`;
}

function menuItems(variant) {
  const idx = variant === 'index';
  const mystery = idx
    ? '<button class="menu-item" type="button" data-mystery>Mystery Animal</button>'
    : '<a class="menu-item" href="/?mystery=1">Mystery Animal</a>';
  const party = idx
    ? '<button class="menu-item" type="button" id="partyOpen"><span class="mi-full">Party Mode</span><span class="mi-short">Party</span> <span class="beta-tag">beta</span></button>'
    : '<a class="menu-item" href="/?party=1"><span class="mi-full">Party Mode</span><span class="mi-short">Party</span> <span class="beta-tag">beta</span></a>';
  const report = idx
    ? '<button class="menu-item menu-desktop-hide" type="button" data-report>Report a problem</button>'
    : '<a class="menu-item menu-desktop-hide" href="/?report=1">Report a problem</a>';
  // The three ways to play share one entry. On phones the panel has the
  // room to list them under a plain heading; on the desktop pill the
  // heading gives way to a "Game modes" button that drops them down
  // (wired in navsearch.js, which every page loads).
  const modes = [
    '<div class="menu-group" id="modesGroup">',
    `  <button class="menu-item menu-group-toggle" id="modesToggle" type="button" aria-expanded="false" aria-controls="modesList">Game modes ${ICON.chev}</button>`,
    '  <p class="menu-group-label" id="modesLabel">Game modes</p>',
    '  <div class="menu-group-list" id="modesList" role="group" aria-labelledby="modesLabel">',
    '    ' + mystery,
    '    ' + party,
    '    <a class="menu-item" href="/streamer"><span class="mi-full">Twitch stream mode</span><span class="mi-short">Stream</span> <span class="beta-tag">beta</span></a>',
    '  </div>',
    '</div>',
  ].join('\n      ');
  return [
    '<a class="menu-item" href="/about"><span class="mi-full">About the game</span><span class="mi-short">About</span></a>',
    // /browse (A to Z) is linked from the top of /explore, not here.
    '<a class="menu-item" href="/explore"><span class="mi-full">Explore animals</span><span class="mi-short">Explore</span></a>',
    modes,
    // Phone-only extras: past 860px these move to the page footer and
    // the theme dial in the bar (see .menu-desktop-hide).
    report,
    '<a class="menu-item menu-desktop-hide" href="/privacy">Privacy</a>',
    `<a class="menu-item menu-desktop-hide" href="${GITHUB}" target="_blank" rel="noopener">Source on GitHub</a>`,
    '<hr class="menu-sep menu-desktop-hide">',
    '<p class="theme-label menu-desktop-hide" id="themeLabel">Appearance</p>',
    '<div class="theme menu-desktop-hide" role="group" aria-labelledby="themeLabel">',
    '  <button class="theme-btn" type="button" data-theme-set="system" aria-pressed="true">System</button>',
    '  <button class="theme-btn" type="button" data-theme-set="light" aria-pressed="false">Light</button>',
    '  <button class="theme-btn" type="button" data-theme-set="dark" aria-pressed="false">Dark</button>',
    '</div>',
  ].join('\n      ');
}

// Search is a toggle that stays exactly where it is - in the pill on
// desktop, an icon in the bar on phones - and opens a popover anchored
// under the bar. Nothing about the nav's own size or position changes
// when it opens; that was the old in-place version's whole problem.
function navSearch() {
  return `<div class="navsearch" id="navSearch">
      <button class="navsearch-toggle" id="navSearchToggle" type="button"
              aria-expanded="false" aria-controls="navSearchPop">${ICON.mag}<span class="navsearch-label">Search</span></button>
      <div class="navsearch-pop" id="navSearchPop" role="search" hidden>
        <div class="searchrow">
          <span class="mag" aria-hidden="true">${ICON.mag}</span>
          <input class="search-input" id="navSearchInput" type="search" placeholder="Search an animal…"
                 autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
                 aria-label="Search animals" role="combobox" aria-expanded="false"
                 aria-autocomplete="list" aria-controls="navSearchResults">
          <button class="navsearch-close" id="navSearchClose" type="button" aria-label="Close search">${ICON.close}</button>
        </div>
        <ul class="suggest" id="navSearchResults" role="listbox" aria-label="Matching animals" hidden></ul>
        <p class="noresult" id="navSearchNoResult" role="status" hidden></p>
      </div>
    </div>`;
}

function siteBar(variant) {
  return `<header class="site-bar" id="siteBar">
  <div class="sb-start">
    ${backSlot(variant)}
  </div>
  <nav class="menu" id="menu" aria-label="Main">
    <div class="menu-panel" id="menuPanel" hidden>
      ${menuItems(variant)}
    </div>
    ${navSearch()}
    <button class="menu-btn" id="menuBtn" type="button"
            aria-label="Menu" aria-expanded="false" aria-controls="menuPanel">${ICON.menu}</button>
  </nav>
  <div class="sb-end">
    <div class="theme-toggle" role="group" aria-label="Appearance">
      <button type="button" class="theme-toggle-opt" data-theme-set="light" aria-pressed="false" aria-label="Light">${ICON.light}</button>
      <button type="button" class="theme-toggle-opt" data-theme-set="dark" aria-pressed="false" aria-label="Dark">${ICON.dark}</button>
      <button type="button" class="theme-toggle-opt" data-theme-set="system" aria-pressed="true" aria-label="System">${ICON.system}</button>
    </div>
    <button class="sound-toggle" id="soundToggle" type="button"
            aria-pressed="true" aria-label="Sound on" data-sfx="off">${ICON.sound}</button>
  </div>
</header>`;
}

function brand() {
  return `<a class="brand" href="/">${PAW}Guess My Animal</a>`;
}

// One footer for every page and every view: where the site's reference
// and trust pages live, who makes it, and the plain facts about ads and
// photos. On index.html, Report is a button (the dialog is right there,
// and app.js makes it Mystery-aware so a round is never spoiled); every
// other page links back to it.
function siteFooter(variant) {
  const report = variant === 'index'
    ? '<button type="button" id="footerReport">Report a problem</button>'
    : '<a href="/?report=1">Report a problem</a>';
  return `<footer class="site-foot">
  <nav class="sf-links" aria-label="Site">
    <a href="/about">About</a>
    <a href="/how-we-answer">How we answer</a>
    <a href="/browse">All animals</a>
    <a href="/reviewed">Review log</a>
    <a href="/contact">Contact</a>
    ${report}
    <a href="/privacy">Privacy</a>
    <a href="/terms">Terms</a>
    <a href="${GITHUB}" target="_blank" rel="noopener">Source on GitHub</a>
  </nav>
  <p class="sf-note">Made by Nav. Free to use, supported by ads (see <a href="/privacy">Privacy</a>).
    Photos from Wikimedia Commons, credited on each animal's page.</p>
</footer>`;
}

// The <head> of a generated page (tools/build-collections.js): the same
// meta, theme bootstrap, stylesheet and ad scripts browse.html carries.
// Values arrive already HTML-escaped; ld is a ready-made JSON-LD
// <script> tag (tools/jsonld.js), or nothing.
function docHead({ title, description, canonical, styleVersion, robots, ld }) {
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${description}">
${robots ? `<meta name="robots" content="${robots}">\n` : ''}<meta name="theme-color" content="#ffce1f">

<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:url" content="${canonical}">
<meta property="og:type" content="article">
<meta property="og:image" content="https://guessmyanimal.com/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_GB">
<meta name="twitter:card" content="summary_large_image">
${ld ? ld + '\n' : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/onest-latin.woff2" as="font" type="font/woff2" crossorigin>
<script>
(function(){try{var t=localStorage.getItem('gma-theme');
if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();
</script>
<link rel="stylesheet" href="/style.css?v=${styleVersion}">
<!-- Google AdSense (Auto ads) - client ca-pub-2495070274777193. -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2495070274777193"
     crossorigin="anonymous"></script>
<!-- Funding Choices - see privacy.html for what this pair does. -->
<script async src="https://fundingchoicesmessages.google.com/i/pub-2495070274777193?ers=1"></script>
<script>
(function() {
  function signalGooglefcPresent() {
    if (!window.frames['googlefcPresent']) {
      if (document.body) {
        var iframe = document.createElement('iframe');
        iframe.style = 'width: 0; height: 0; border: none; z-index: -1000; left: -1000px; top: -1000px;';
        iframe.style.display = 'none';
        iframe.name = 'googlefcPresent';
        document.body.appendChild(iframe);
      } else {
        setTimeout(signalGooglefcPresent, 0);
      }
    }
  }
  signalGooglefcPresent();
})();
</script>`;
}

const BLOCKS = {
  'site-bar': siteBar,
  'site-bar-index': () => siteBar('index'),
  brand,
  'site-footer': siteFooter,
  'site-footer-index': () => siteFooter('index'),
};

module.exports = { siteBar, brand, siteFooter, docHead, BLOCKS };
