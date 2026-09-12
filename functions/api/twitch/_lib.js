// Shared by the two Twitch OAuth endpoints (login.js, callback.js).
// Filename starts with an underscore so Pages Functions' file-based
// router skips it - not a route itself, same convention as
// functions/api/party/_lib.js.
//
// The whole handshake here exists for one narrow purpose: let a
// streamer prove which Twitch channel is theirs so streamer.html can
// skip typing it in. It is not a general sign-in - see callback.js,
// which discards the access token the moment it's used once. Chat
// itself is still read anonymously, same as it always was - this OAuth
// dance never touches that.

export const AUTHORIZE_URL = 'https://id.twitch.tv/oauth2/authorize';
export const TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
export const USERS_URL = 'https://api.twitch.tv/helix/users';

export const STATE_COOKIE = 'tw_oauth_state';
const STATE_MAX_AGE = 300; // 5 minutes: long enough for a real login, short enough that a stale one is worthless to replay

export function newState() {
  return crypto.randomUUID();
}

// This cookie is the entire CSRF defence, standing in for server-side
// session state Pages Functions has nowhere to keep between requests -
// scoped to /api/twitch so it's never sent anywhere else, and Secure is
// dropped for a plain-http request (wrangler pages dev on localhost),
// where a Secure cookie is silently never set and would otherwise break
// the whole local OAuth loop with no visible error.
export function stateCookie(value, request) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [`${STATE_COOKIE}=${value}`, 'Path=/api/twitch', 'HttpOnly', 'SameSite=Lax', `Max-Age=${STATE_MAX_AGE}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearStateCookie(request) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [`${STATE_COOKIE}=`, 'Path=/api/twitch', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function readCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// Derived per-request rather than an env var, so the same code serves
// both the localhost and production redirect URIs registered with
// Twitch without needing to know which one it's running as.
export function redirectUriFor(request) {
  return new URL(request.url).origin + '/api/twitch/callback';
}
