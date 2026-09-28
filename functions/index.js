// The homepage, plus the redirect that keeps every old animal link alive.
//
// Animals used to live at /?a=<slug> - one homepage document rewritten per
// animal. They now have their own address, /animals/<slug> (see
// functions/animals/[slug].js). Every old link, share and bookmark gets a
// permanent redirect there, forever; an unknown ?a= gets a real 404 rather
// than the homepage served as a 200.
//
// Everything else at / is the static homepage, untouched - its own
// <link rel="canonical"> already points at /, which covers ?mystery=1,
// ?party=1 and ?report=1 (the same page opened in a particular state).

import { slugify, entryFor, notFound, headOf, AppendHead } from './_shared/animal-page.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.has('a')) {
    const slug = slugify(url.searchParams.get('a'));
    // Same-origin, so a preview deploy or local dev stays on itself; the
    // canonical tag on the destination is what names the real address.
    if (entryFor(slug)) return Response.redirect(new URL('/animals/' + slug, url).toString(), 301);
    return notFound(context);
  }

  const res = await env.ASSETS.fetch(request);

  // A party's join link (?party=ABCDE) is a room that stops existing when
  // the party ends - worth keeping out of search results entirely, not
  // just canonicalised to the homepage.
  const party = url.searchParams.get('party');
  if (party && party !== '1') {
    return new HTMLRewriter()
      .on('head', new AppendHead('<meta name="robots" content="noindex">'))
      .transform(res);
  }
  return res;
}

export const onRequestHead = headOf(onRequestGet);
