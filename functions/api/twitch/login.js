// Step 1 of Connect with Twitch: send the browser to Twitch's own
// consent screen. Scope is deliberately empty - Get Users (see
// callback.js) returns the token holder's own profile without any
// scope at all, and asking for nothing beyond identity is exactly what
// streamer.html promises a host before they click through.

import { AUTHORIZE_URL, newState, stateCookie, redirectUriFor } from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.TWITCH_CLIENT_ID) {
    return new Response('Twitch login is not configured on this deploy.', { status: 503 });
  }

  const state = newState();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', env.TWITCH_CLIENT_ID);
  url.searchParams.set('redirect_uri', redirectUriFor(request));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', '');
  url.searchParams.set('state', state);

  return new Response(null, {
    status: 302,
    headers: { location: url.toString(), 'set-cookie': stateCookie(state, request) },
  });
}

export const onRequestPost = () => new Response('method not allowed', { status: 405 });
