// Shared by functions/index.js (the old /?a=<slug> redirect) and
// functions/animals/[slug].js (the real animal page). Not a route itself:
// it exports no onRequest handler, so Pages never serves it.

import META from '../seo-meta.json';

export const SITE = 'https://guessmyanimal.com';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
// Hyphens become spaces first, or "snow-leopard" normalises to
// "snowleopard" and matches nothing - same rule as app.js/search-core.js.
export const slugify = (s) => norm(String(s || '').replace(/-/g, ' ')).replace(/ /g, '-');

export const entryFor = (slug) => META[slug] || null;

// A real 404 - the site's own 404 page with a 404 status - rather than the
// homepage served as a 200, which is what an unknown animal used to get.
export async function notFound(context) {
  const { request, env } = context;
  const page = await env.ASSETS.fetch(new URL('/404', request.url).toString());
  const headers = new Headers(page.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  return new Response(page.body, { status: 404, headers });
}

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
class SetHtml {
  constructor(value) { this.value = value; }
  element(el) { el.setInnerContent(this.value, { html: true }); }
}
class RemoveAttr {
  constructor(attr) { this.attr = attr; }
  element(el) { el.removeAttribute(this.attr); }
}
class SetAttrs {
  constructor(map) { this.map = map; }
  element(el) { for (const k in this.map) el.setAttribute(k, this.map[k]); }
}
class Retag {
  constructor(tag) { this.tag = tag; }
  element(el) { el.tagName = this.tag; }
}

// The homepage shell (index.html, straight from static assets - ASSETS
// never re-enters a Function) rewritten into this animal's page. Pure
// local templating; app.js re-renders the same content on top from the
// same render-data.js source, so there's nothing to reconcile.
export async function renderAnimal(context, slug, entry) {
  const { request, env } = context;
  const canonical = `${SITE}/animals/${slug}`;
  const shell = await env.ASSETS.fetch(new URL('/', request.url).toString());

  const rewriter = new HTMLRewriter()
    .on('title', new SetText(entry.title))
    .on('meta[name="description"]', new SetAttr('content', entry.description))
    .on('meta[property="og:title"]', new SetAttr('content', entry.title))
    .on('meta[property="og:description"]', new SetAttr('content', entry.description))
    .on('meta[property="og:url"]', new SetAttr('content', canonical))
    .on('link[rel="canonical"]', new SetAttr('href', canonical))
    .on('body', new SetAttr('class', 'view-animal'))
    .on('#home', new SetAttr('hidden', ''))
    // The splash's wordmark is the homepage's <h1>; on an animal page it's
    // hidden, and the animal's name is the one real <h1>. Same for Party's
    // lobby headline, hidden in its own view on this page. Both are
    // class-styled, so the tag swap changes nothing visually.
    .on('h1.wordmark', new Retag('p'))
    .on('h1.party-lobby-headline', new Retag('h2'))
    .on('#animalview', new RemoveAttr('hidden'))
    .on('#name', new SetText(entry.name))
    .on('#emoji', new SetText(entry.emoji))
    .on('#kicker', new SetText(entry.kicker))
    .on('#fact', new SetText(entry.fact))
    .on('#wiki', new SetAttr('href', entry.wikiHref))
    .on('#answers', new SetHtml(entry.answersHtml))
    .on('#glance', new SetHtml(entry.glanceHtml))
    .on('#related', new SetHtml(entry.relatedHtml));

  // Reviewed editorial content (tools/content.js), pre-rendered by the
  // build with the same sections() app.js uses. Each section is unhidden
  // only if it has something in it. The raw JSON goes in too, so app.js's
  // first render uses it instead of fetching it again.
  const c = entry.content;
  if (c) {
    if (c.overview) rewriter.on('#blurb', new SetAttrs({ class: 'blurb is-ov' })).on('#blurb', new SetText(c.overview));
    if (c.group) rewriter.on('#groupNote', new SetHtml(c.group)).on('#groupNote', new RemoveAttr('hidden'));
    if (c.profile) rewriter.on('#profile', new SetHtml(c.profile)).on('#profileSec', new RemoveAttr('hidden'));
    if (c.moreFacts) rewriter.on('#moreFacts', new SetHtml(c.moreFacts));
    if (c.confused) rewriter.on('#confused', new SetHtml(c.confused)).on('#confusedSec', new RemoveAttr('hidden'));
    if (c.sources) rewriter.on('#sources', new SetHtml(c.sources)).on('#sourcesSec', new RemoveAttr('hidden'));
    // "<" escaped so no string in the content can close the script tag.
    const json = c.json.replace(/</g, '\\u003c');
    rewriter.on('head', new AppendHead(`<script type="application/json" id="gma-content" data-slug="${slug}">${json}</script>`));
  }

  // The licensed lead photo and its credit, baked in from
  // tools/photos.json - so it starts loading with the HTML (it's the
  // page's largest paint) instead of after app.js and two API calls, and
  // every share preview gets it too, not just known bots. data-ssr tells
  // app.js this photo is already the right one.
  const photo = entry.photo;
  if (photo) {
    rewriter
      .on('#hero', new SetAttr('class', 'pcard has-photo'))
      .on('#photo', new SetAttrs({ src: photo.src, alt: entry.name, width: String(photo.width), height: String(photo.height), fetchpriority: 'high', 'data-ssr': slug }))
      .on('#photoBg', new SetAttr('src', photo.src))
      .on('#photoCredit', new SetHtml(photo.creditHtml))
      .on('meta[property="og:image"]', new SetAttr('content', photo.src))
      .on('meta[property="og:image:width"]', new SetAttr('content', String(photo.width)))
      .on('meta[property="og:image:height"]', new SetAttr('content', String(photo.height)));
  }
  return rewriter.transform(shell);
}

// HEAD gets the same status and headers as GET, just no body - so a
// link checker (or curl -I) sees the truth instead of falling through to
// static assets, where /animals/<slug> doesn't exist as a file.
export const headOf = (handler) => async (context) => {
  const res = await handler(context);
  return new Response(null, { status: res.status, headers: res.headers });
};

export class AppendHead {
  constructor(html) { this.html = html; }
  element(el) { el.append(this.html, { html: true }); }
}
