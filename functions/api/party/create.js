// Starts a party session: host picks a category, plus a Twitch channel
// if this is a Twitch-only session (set only by streamer.js, after its
// own OAuth handshake confirms the channel - see functions/api/twitch/).
// Blank means an ordinary local/QR room; the two never mix in one
// session, see schema.sql. Picks the first target, generates a short
// code (retried on the rare collision) and a host_key the host's
// browser keeps to gate hint/next-round calls later.

import { CATEGORY_RE, TWITCH_CHANNEL_RE, pickTarget, randomCode, randomHostKey, roundDeadline, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const category = String(body.category || 'all');
  if (!CATEGORY_RE.test(category)) return json({ error: 'bad category' }, 400);

  const twitchChannelRaw = String(body.twitchChannel || '').trim();
  if (twitchChannelRaw && !TWITCH_CHANNEL_RE.test(twitchChannelRaw)) return json({ error: 'bad twitch channel' }, 400);
  const twitchChannel = twitchChannelRaw ? twitchChannelRaw.toLowerCase() : null;

  const targetSlug = pickTarget(category, []);
  const hostKey = randomHostKey();
  const now = Date.now();
  const { roundStartedAt, roundEndsAt } = roundDeadline(twitchChannel, 1, now);

  // Collisions are astronomically unlikely at 33^5 codes, but the retry
  // is cheap insurance against the one-in-a-lot chance that isn't zero.
  // Only a UNIQUE-constraint failure on the code itself is worth retrying -
  // anything else (a missing table, a locked database, ...) will fail
  // identically on every attempt, so burning all 5 just delays a real
  // error and then reports the wrong one.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    try {
      await env.DB
        .prepare(
          'INSERT INTO party_sessions (code, host_key, twitch_channel, category, target_slug, shown_slugs, shown, resolved, round_no, round_started_at, round_ends_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, 0, 1, ?7, ?8, ?9, ?9)'
        )
        .bind(code, hostKey, twitchChannel, category, targetSlug, JSON.stringify([targetSlug]), roundStartedAt, roundEndsAt, now)
        .run();
      return json({ code, hostKey, category, twitchChannel, targetSlug, shown: 1, roundNo: 1, roundEndsAt, serverNow: now });
    } catch (err) {
      const message = String((err && err.message) || err);
      const isCodeCollision = /unique constraint/i.test(message);
      if (isCodeCollision && attempt < 4) continue;
      console.error('party/create: insert failed —', message);
      return json(
        { error: isCodeCollision ? 'could not allocate a room code' : 'could not start the session' },
        500
      );
    }
  }
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
