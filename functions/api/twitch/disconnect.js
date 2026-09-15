// Clears the signed channel-proof cookie the callback set - "Not you?"/
// "Disconnect" on the connected screen. There's no token or session to
// revoke server-side by this point (callback.js already did that the
// moment it confirmed the channel); this just makes sure the proof
// cookie can't be used to start a session as this channel again, same
// as the state cookie's own clear-on-every-path pattern in _lib.js.

import { clearChannelCookie } from './_lib.js';

export async function onRequestPost({ request }) {
  return new Response(null, { status: 204, headers: { 'set-cookie': clearChannelCookie(request) } });
}

export const onRequestGet = () => new Response('method not allowed', { status: 405 });
