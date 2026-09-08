// Every animal lives at the same URL shape it always has - /?a=<slug> -
// so nothing that already links here breaks. What was missing is that
// every one of those 435 pages served the exact same <title> and
// <meta description> as the homepage, because the real content only
// exists after client JS runs. This rewrites just those tags server-side
// from functions/seo-meta.json (built by tools/build-seo.js from
// animals.js), so a crawler - or a link preview - sees the right thing
// without needing to execute anything.
//
// Falls through unchanged for the plain homepage and for any slug that
// doesn't resolve to a real animal - it never invents content.

import META from './seo-meta.json';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

class SetText {
  // Named this.value, not this.text - "text" is a reserved handler method
  // name on ElementContentHandlers (called per text chunk inside the
  // element), and a same-named instance property shadows it with a string,
  // which HTMLRewriter rejects at registration with a fairly opaque error.
  constructor(value) { this.value = value; }
  element(el) { el.setInnerContent(this.value); }
}

class SetAttr {
  constructor(attr, value) { this.attr = attr; this.value = value; }
  element(el) { el.setAttribute(this.attr, this.value); }
}

class AddCanonical {
  constructor(href) { this.href = href; }
  element(el) { el.append(`<link rel="canonical" href="${this.href}">`, { html: true }); }
}

class SetHtml {
  constructor(value) { this.value = value; }
  element(el) { el.setInnerContent(this.value, { html: true }); }
}

class RemoveAttr {
  constructor(attr) { this.attr = attr; }
  element(el) { el.removeAttribute(this.attr); }
}

// The og:image swap needs a live Wikipedia fetch, which is real added
// latency on the response - fine for a share-preview bot fetching the page
// once to build a card, wasted on every real visitor who never looks at a
// meta tag. Gated to known preview crawlers so a normal page load never
// pays for it.
const BOT_UA = /facebookexternalhit|facebot|twitterbot|discordbot|whatsapp|slackbot|linkedinbot|telegrambot|pinterest|redditbot|googlebot|bingbot|embedly|w3c_validator|applebot|skypeuripreview|vkshare/i;

async function fetchWikiThumb(wikiTitle) {
  try {
    const res = await fetch(
      'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(wikiTitle.replace(/ /g, '_')),
      { headers: { 'User-Agent': 'GuessMyAnimal-OGImage/1.0 (guessmyanimal.com)' } }
    );
    if (!res.ok) return null;
    const j = await res.json();
    // originalimage over thumbnail: the API's default thumbnail is a soft
    // 330px wide, too small for a good share card. Never hand-rewrite that
    // width in the URL to get something bigger - Wikimedia 404s a size it
    // hasn't generated and the browser swallows it as a blocked opaque
    // response with no visible error. originalimage is a real, larger
    // rendition the API actually returns, not a guessed URL.
    if (j.originalimage && j.originalimage.source) return j.originalimage;
    return j.thumbnail && j.thumbnail.source ? j.thumbnail : null;
  } catch {
    return null;
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const res = await env.ASSETS.fetch(request);

  const url = new URL(request.url);
  const wanted = url.searchParams.get('a');
  if (!wanted) return res;

  const slug = slugify(wanted);
  const entry = META[slug];
  if (!entry) return res;

  const canonical = `https://guessmyanimal.com/?a=${slug}`;
  const isBot = BOT_UA.test(request.headers.get('user-agent') || '');

  const rewriter = new HTMLRewriter()
    .on('title', new SetText(entry.title))
    .on('meta[name="description"]', new SetAttr('content', entry.description))
    .on('meta[property="og:title"]', new SetAttr('content', entry.title))
    .on('meta[property="og:description"]', new SetAttr('content', entry.description))
    .on('head', new AddCanonical(canonical))
    // Everything below is pure local templating (no network call), so it
    // runs for every visitor, not just bots - a crawler, a slow
    // connection, or JS-disabled browser all see the real page instead
    // of an empty shell. app.js's routeFromURL() re-renders this exact
    // same content on top once it loads (same render-data.js source), so
    // there's nothing to reconcile - it's an identical rebuild, not a
    // correction.
    .on('body', new SetAttr('class', 'view-animal'))
    .on('#home', new SetAttr('hidden', ''))
    .on('#animalview', new RemoveAttr('hidden'))
    .on('#name', new SetText(entry.name))
    .on('#emoji', new SetText(entry.emoji))
    .on('#kicker', new SetText(entry.kicker))
    .on('#fact', new SetText(entry.fact))
    .on('#wiki', new SetAttr('href', entry.wikiHref))
    .on('#answers', new SetHtml(entry.answersHtml))
    .on('#glance', new SetHtml(entry.glanceHtml))
    .on('#related', new SetHtml(entry.relatedHtml));

  if (!isBot) return rewriter.transform(res);

  // Bot path only: cached a day at the edge, since the same animal gets
  // shared repeatedly and Wikipedia's photo for an established species
  // page essentially never changes hour to hour.
  const cache = caches.default;
  const cacheKey = new Request('https://cache.internal/og/' + slug, request);
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const thumb = await fetchWikiThumb(entry.wikiTitle);
  if (thumb) {
    rewriter
      .on('meta[property="og:image"]', new SetAttr('content', thumb.source))
      .on('meta[property="og:image:width"]', new SetAttr('content', String(thumb.width)))
      .on('meta[property="og:image:height"]', new SetAttr('content', String(thumb.height)));
  }

  const transformed = rewriter.transform(res);
  const finalRes = new Response(transformed.body, transformed);
  finalRes.headers.set('Cache-Control', 'public, max-age=86400');
  context.waitUntil(cache.put(cacheKey, finalRes.clone()));
  return finalRes;
}
