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
export const GUESS_TEXT_MAX = 60;

export const slugify = GameCore.slugify;
export const pointsForHints = GameCore.pointsForHints;
export const matches = GameCore.matches;
export const looksLikeAGuess = GameCore.looksLikeAGuess;
export const chatMatches = GameCore.chatMatches;
export const MAX_HINTS = GameCore.MAX_HINTS;
export const hintsFromElapsed = GameCore.hintsFromElapsed;

const BY_SLUG = new Map(ANIMALS.map((a) => [slugify(a.n), a]));

// Server-side lookup for the local/QR guess path, which - unlike the
// Twitch chat path - trusts its own match check rather than the
// client's, so the same round can't be scored two different ways by
// two different surfaces. See guess.js.
export function targetFor(slug) {
  return BY_SLUG.get(slug) || null;
}

// A player-picked emoji, kept loose since real emoji can be several
// UTF-16 code units (skin tones, ZWJ sequences) - just capped and
// trimmed, not pattern-matched. Empty/missing collapses to null so it
// reads the same as "no icon set" everywhere it's stored.
export function cleanIcon(v) {
  const s = String(v || '').trim().slice(0, 8);
  return s || null;
}

// A chat guesser never picks an icon the way a local/QR player does -
// this is what the streamer leaderboard renders instead so the row
// isn't blank.
export const DEFAULT_TWITCH_ICON = '💬';

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

// The round timer, Twitch sessions only - a null twitchChannel (local/QR
// play) always gets {null, null} back, which is exactly what
// round_started_at/round_ends_at should be for a mode with no deadline.
// Shared so create.js (round 1) and next.js (every round after) can't
// drift on how a deadline gets computed.
export function roundDeadline(twitchChannel, roundNo, now) {
  if (!twitchChannel) return { roundStartedAt: null, roundEndsAt: null };
  return { roundStartedAt: now, roundEndsAt: now + GameCore.roundSeconds(roundNo) * 1000 };
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
