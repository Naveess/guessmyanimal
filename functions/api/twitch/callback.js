// Step 2: Twitch sends the browser back here with a one-time code.
// Exchange it for an access token server-side - the client secret never
// reaches the browser - ask Get Users whose token it is, revoke the
// token immediately (it's done its one job), then hand the browser a
// signed, httpOnly proof that this channel was actually confirmed by
// Twitch. See _lib.js's file comment for why this isn't a general
// sign-in: nothing here is stored in D1 - the proof cookie is the only
// thing that outlives this request, and it expires in 15 minutes.

import { TOKEN_URL, REVOKE_URL, USERS_URL, STATE_COOKIE, readCookie, clearStateCookie, signChannel, channelCookie, redirectUriFor } from './_lib.js';

// Two cookies to set on the way out: always clear the one-time state
// cookie, and - only on a successful login - set the channel proof.
// Response headers can't repeat 'set-cookie' as one string, so this
// builds a Headers object and appends each cookie as its own header.
function toStreamer(query, request, extraCookie) {
  const headers = new Headers({ location: new URL('/streamer.html' + query, request.url).toString() });
  headers.append('set-cookie', clearStateCookie(request));
  if (extraCookie) headers.append('set-cookie', extraCookie);
  return new Response(null, { status: 302, headers });
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

  if (!login) return toStreamer('?twitcherror=token', request);

  // The token has done its one job (proving whose channel this is) -
  // tell Twitch to kill it now rather than leaving it valid until it
  // naturally expires. Best-effort: a failed revoke must never fail a
  // login that already succeeded, so this never touches the response.
  try {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: env.TWITCH_CLIENT_ID, token: accessToken }),
    });
  } catch (err) {
    // Nothing to do - the token still expires on its own, just not instantly.
  }
  // accessToken deliberately goes out of scope here unused past this
  // point - it is never written to a cookie, D1, or the redirect below.

  const now = Date.now();
  const proof = await signChannel(login, env.TWITCH_CLIENT_SECRET, now);
  return toStreamer('?tw_login=' + encodeURIComponent(login), request, channelCookie(proof, request));
}

export const onRequestPost = () => new Response('method not allowed', { status: 405 });
