// One address for the site: guessmyanimal.com.
//
// Cloudflare Pages also serves every deployment on guessmyanimal.pages.dev
// (production) and <hash-or-branch>.guessmyanimal.pages.dev (previews).
// Those are copies a search engine could index alongside the real site, so
// any request to them gets a permanent redirect to the same path and query
// on the address in functions/_shared/site.json. Every other host (the
// real domain, localhost under `wrangler pages dev`) passes straight
// through, untouched.
//
// This is the root middleware, so it runs before every route, static files
// included. Deployments made before it existed run their own older code
// and can't be redirected; Cloudflare already sends them
// X-Robots-Tag: noindex.

import SITE_JSON from './_shared/site.json';

const PAGES_DEV = 'guessmyanimal.pages.dev';

export function onRequest({ request, next }) {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();
  if (host === PAGES_DEV || host.endsWith('.' + PAGES_DEV)) {
    return Response.redirect(SITE_JSON.url + url.pathname + url.search, 301);
  }
  return next();
}
