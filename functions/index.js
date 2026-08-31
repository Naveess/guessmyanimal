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

export async function onRequestGet({ request, env }) {
  const res = await env.ASSETS.fetch(request);

  const url = new URL(request.url);
  const wanted = url.searchParams.get('a');
  if (!wanted) return res;

  const slug = slugify(wanted);
  const entry = META[slug];
  if (!entry) return res;

  const canonical = `https://guessmyanimal.com/?a=${slug}`;

  return new HTMLRewriter()
    .on('title', new SetText(entry.title))
    .on('meta[name="description"]', new SetAttr('content', entry.description))
    .on('meta[property="og:title"]', new SetAttr('content', entry.title))
    .on('meta[property="og:description"]', new SetAttr('content', entry.description))
    .on('head', new AddCanonical(canonical))
    .transform(res);
}
