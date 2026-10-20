/* Everything ad-related a page carries, from one settings file:
 * functions/_shared/ads.json.
 *
 *   client   the AdSense publisher ID ("ca-pub-...")
 *   script   true loads AdSense and Google's consent message (Funding
 *            Choices) in every page's <head> that has ads. AdSense's own
 *            site check also looks for this script. false removes both.
 *   verify   true adds <meta name="google-adsense-account">, the other
 *            way AdSense can confirm the site is yours. Off by default.
 *   slots    true fills the ad slots below with real ad units. false (the
 *            default) leaves each one an empty, hidden container.
 *   units    the ad unit ID ("data-ad-slot") for each slot. A slot whose
 *            unit is empty stays hidden even when slots is true.
 *   adsTxt   what /ads.txt serves (functions/ads.txt.js). An ADS_TXT
 *            environment variable in Cloudflare overrides it; empty in
 *            both means /ads.txt is a 404.
 *
 * The slots, and why they sit where they do:
 *   animal       animal pages, after "At a glance". Not directly under
 *                Quick answers: on phones the Mystery Animal / Party Mode
 *                block comes straight after those.
 *   compare-mid  compare pages, after the Quick answers table.
 *   compare-end  compare pages, after "About each", before Sources.
 * Never in or next to the game: the homepage search and Mystery button,
 * the Mystery guess box, Party Mode, a party code, or stream mode.
 * tools/check-site.js fails the build if one ends up there.
 *
 * Pages with no ads at all: 404, stream mode, Terms, Contact.
 *
 * Used by tools/chrome.js (the head and the animal slot), tools/build-seo.js
 * (browse.html) and tools/build-compare.js. Change ads.json, then npm run seo.
 */
const ADS = require('../functions/_shared/ads.json');

const pub = () => ADS.client.replace(/^ca-/, '');

function adsHead() {
  const out = [];
  if (ADS.verify && ADS.client) out.push(`<meta name="google-adsense-account" content="${ADS.client}">`);
  if (ADS.script && ADS.client) out.push(`<!-- Google AdSense - client ${ADS.client}. Settings: functions/_shared/ads.json. -->
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADS.client}"
     crossorigin="anonymous"></script>
<!-- Funding Choices: the consent message itself is authored in the
     AdSense dashboard (Privacy & messaging), not here - this is just the
     loader plus the standard "signal a CMP is present" iframe, unchanged
     from Google's own snippet. -->
<script async src="https://fundingchoicesmessages.google.com/i/${pub()}?ers=1"></script>
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
</script>`);
  return out.length ? out.join('\n') : '<!-- No ads: functions/_shared/ads.json -->';
}

// One slot. Off, it's an empty hidden container. On, it's a labelled
// responsive unit that asks AdSense for an ad only once it's on screen
// (or near it): the animal slot ships inside index.html, where it sits
// in a hidden view until someone opens an animal, and a unit pushed while
// hidden has no width to fill.
function adSlot(name) {
  const unit = ADS.units && ADS.units[name];
  if (!(ADS.slots && ADS.script && ADS.client && unit)) {
    return `<div class="adslot" data-ad="${name}" hidden></div>`;
  }
  return `<aside class="adslot" data-ad="${name}" aria-label="Advertisement">
  <p class="adslot-label">Advertisement</p>
  <ins class="adsbygoogle" style="display:block" data-ad-client="${ADS.client}" data-ad-slot="${unit}" data-ad-format="auto" data-full-width-responsive="true"></ins>
  <script>(function(){var el=document.currentScript.previousElementSibling;function push(){(window.adsbygoogle=window.adsbygoogle||[]).push({});}
  if(!('IntersectionObserver' in window))return push();var io=new IntersectionObserver(function(e){if(e[0].isIntersecting&&el.offsetWidth){io.disconnect();push();}},{rootMargin:'300px'});io.observe(el);})();</script>
</aside>`;
}

module.exports = { adsHead, adSlot, ADS };
