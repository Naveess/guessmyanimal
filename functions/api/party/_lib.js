// Shared by every functions/api/party/*.js endpoint. Filename starts with
// an underscore so Pages Functions' file-based router skips it - not a
// route itself, just the code the routes share.
//
// ANIMALS is pulled straight from animals.js, the same data the client
// already has - Wrangler bundles this at deploy time via esbuild, same
// as any other import, so there's no server/client copy to keep in
// sync by hand.

import { ANIMALS } from '../../../animals.js';
import GameCore from '../../../game-core.js';

export const CODE_RE = /^[A-Z0-9]{4,6}$/;
export const HOST_KEY_RE = /^[a-z0-9]{16,32}$/i;
export const CATEGORY_RE = /^(all|mammals|birds|reptiles|sea|bugs)$/;
export const TWITCH_CHANNEL_RE = /^[a-z0-9_]{1,25}$/i;
export const PLAYER_NAME_RE = /^.{1,24}$/;
export const SOURCE_RE = /^(twitch|local)$/;

export const slugify = GameCore.slugify;
export const pointsForHints = GameCore.pointsForHints;

// excludeSlugs: targets already shown this session, so a round doesn't
// repeat an animal the players just saw. Falls back to the full pool if
// everything in it has already been shown, same shrink-to-fit spirit as
// mystery.js's own recentNames window for Endless.
export function pickTarget(category, excludeSlugs) {
  const pool = GameCore.poolFor(category, ANIMALS);
  const fresh = pool.filter((a) => !excludeSlugs.includes(slugify(a.n)));
  const from = fresh.length ? fresh : pool;
  const a = from[Math.floor(Math.random() * from.length)];
  return slugify(a.n);
}

export function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I - read off a screen, typed on a phone
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomHostKey() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 24; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}
