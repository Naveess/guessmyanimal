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
export const REVOKE_URL = 'https://id.twitch.tv/oauth2/revoke';
export const USERS_URL = 'https://api.twitch.tv/helix/users';

// The channel-proof cookie (see below) is the one thing that outlives
// the handshake, so it needs its own signing key - derived from the
// client secret rather than a second env var, so there's nothing extra
// to configure or rotate separately from Twitch's own secret.
export const CHANNEL_COOKIE = 'tw_channel';
const CHANNEL_MAX_AGE = 900; // 15 minutes: long enough to pick a category and go live, short enough that a stale proof is worthless to replay
const KEY_INFO = new TextEncoder().encode('gma-channel-proof-v1');

async function signingKey(clientSecret) {
  const base = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(clientSecret), 'HKDF', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: KEY_INFO },
    base,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function toBase64Url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// "<login>.<expiryMs>.<mac>" - the login and expiry travel in plain
// text (a channel name and a timestamp are not secrets) so verify()
// can check the expiry without needing to unwrap anything first; the
// mac is what makes the whole thing unforgeable without the client
// secret, since a cookie is otherwise just client-supplied text.
export async function signChannel(login, clientSecret, now) {
  const expiry = now + CHANNEL_MAX_AGE * 1000;
  const payload = `${login}.${expiry}`;
  const key = await signingKey(clientSecret);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${toBase64Url(mac)}`;
}

// Returns the login the proof was signed for, or null if it's missing,
// malformed, expired, or doesn't verify against the current secret
// (which also naturally invalidates every outstanding proof the moment
// the secret is rotated).
export async function verifyChannel(value, clientSecret, now) {
  if (!value) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [login, expiryStr, mac] = parts;
  const expiry = Number(expiryStr);
  if (!login || !Number.isFinite(expiry) || now >= expiry) return null;

  let bin;
  try { bin = atob(mac.replace(/-/g, '+').replace(/_/g, '/')); } catch { return null; }
  const givenBytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) givenBytes[i] = bin.charCodeAt(i);

  const key = await signingKey(clientSecret);
  // subtle.verify does a constant-time comparison internally - avoids
  // re-deriving the mac and comparing strings by hand.
  const ok = await crypto.subtle.verify('HMAC', key, givenBytes, new TextEncoder().encode(`${login}.${expiry}`));
  return ok ? login : null;
}

export function channelCookie(value, request) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [`${CHANNEL_COOKIE}=${value}`, 'Path=/api', 'HttpOnly', 'SameSite=Lax', `Max-Age=${CHANNEL_MAX_AGE}`];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearChannelCookie(request) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [`${CHANNEL_COOKIE}=`, 'Path=/api', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

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
