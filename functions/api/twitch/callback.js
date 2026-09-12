// Step 2: Twitch sends the browser back here with a one-time code.
// Exchange it for an access token server-side - the client secret never
// reaches the browser - ask Get Users whose token it is, then throw the
// token away. The only thing that outlives this function is a plain
// channel-login string, handed to streamer.html in the redirect. See
// _lib.js's file comment for why this isn't a general sign-in: nothing
// here is stored in D1, a cookie, or anywhere else past this request.

import { TOKEN_URL, USERS_URL, STATE_COOKIE, readCookie, clearStateCookie, redirectUriFor } from './_lib.js';

function toStreamer(query, request) {
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL('/streamer.html' + query, request.url).toString(),
      'set-cookie': clearStateCookie(request),
    },
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = readCookie(request, STATE_COOKIE);

  // Cookie is cleared on every path below (toStreamer always sets it),
  // one-time use whether the login succeeds or not.
  if (!code || !state || !cookieState || state !== cookieState) {
    return toStreamer('?twitcherror=state', request);
  }
  if (!env.TWITCH_CLIENT_ID || !env.TWITCH_CLIENT_SECRET) {
    return toStreamer('?twitcherror=config', request);
  }

  let accessToken;
  try {
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.TWITCH_CLIENT_ID,
        client_secret: env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUriFor(request),
      }),
    });
    if (!tokenRes.ok) return toStreamer('?twitcherror=token', request);
    const token = await tokenRes.json();
    accessToken = token.access_token;
    if (!accessToken) return toStreamer('?twitcherror=token', request);
  } catch (err) {
    return toStreamer('?twitcherror=token', request);
  }

  let login;
  try {
    const usersRes = await fetch(USERS_URL, {
      headers: { authorization: 'Bearer ' + accessToken, 'client-id': env.TWITCH_CLIENT_ID },
    });
    if (!usersRes.ok) return toStreamer('?twitcherror=token', request);
    const users = await usersRes.json();
    login = users && users.data && users.data[0] && users.data[0].login;
  } catch (err) {
    return toStreamer('?twitcherror=token', request);
  }
  // accessToken deliberately goes out of scope here unused - it is
  // never written to a cookie, D1, or the redirect that follows.

  if (!login) return toStreamer('?twitcherror=token', request);

  return toStreamer('?tw_login=' + encodeURIComponent(login), request);
}

export const onRequestPost = () => new Response('method not allowed', { status: 405 });
