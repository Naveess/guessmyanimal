// /animals on its own is the A-Z list's job - send it there rather than
// letting it 404, since it's the obvious "up one level" from any animal.

export const onRequestGet = ({ request }) => Response.redirect(new URL('/browse', request.url).toString(), 301);
export const onRequestHead = onRequestGet;
