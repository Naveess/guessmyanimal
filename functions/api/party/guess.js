// Two very different callers land here, on separate code paths because
// they submit different things - but both are judged server-side, by
// the same matcher family, for the same reason: a party's whole point
// is that a "correct" claim in the room is worth trusting, so the
// server (not either kind of client) has to be the one deciding.
//
// - Local/QR players (source 'local') submit raw guess text. Every
//   submission - right or wrong - is logged to party_events so the
//   room can see a guess has already been tried.
// - Twitch chat (source 'twitch') also submits raw text now (the
//   streamer page's own chatMatches() pre-filter is a volume filter
//   only, keeping obviously-wrong chat lines from ever reaching this
//   endpoint - it is not treated as authoritative here). The chat
//   matcher (GameCore.chatMatches, via _lib.js) is deliberately
//   different from the local matcher: chat is sentence-shaped ("is it
//   a leopard?"), so it's scanned for the animal's name as a complete
//   word run on top of the normal typo-tolerant check - see game-core.js
//   for why that scan is exact, never fuzzy. Twitch guesses are logged
//   to party_events too, same as local ones.
//
// Either way the round-lock is the same atomic first-writer-wins
// update, not a read-then-write: a burst of near-simultaneous correct
// guesses right after a hint drops is the normal case here, not an
// edge case. roundNo is checked against the row, not just resolved=0,
// so a guess already in flight when the host called next() can't land
// against - and accidentally score into - the round that replaced it.
//
// A session is either a local/QR room or a Twitch-only one, never both
// (see party_sessions.twitch_channel) - the source on a guess must
// match which kind of session it's landing in, or it's rejected outright
// rather than silently scored into the wrong leaderboard.

import { CODE_RE, PLAYER_NAME_RE, SOURCE_RE, GUESS_TEXT_MAX, pointsForHints, matches, chatMatches, looksLikeAGuess, targetFor, cleanIcon, DEFAULT_TWITCH_ICON, hintsFromElapsed, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const code = String(body.code || '').toUpperCase();
  const playerName = String(body.playerName || '').trim();
  const roundNo = Number(body.roundNo);
  const source = SOURCE_RE.test(body.source) ? body.source : 'local';

  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!PLAYER_NAME_RE.test(playerName)) return json({ error: 'bad player name' }, 400);
  if (!Number.isInteger(roundNo) || roundNo < 1) return json({ error: 'bad round' }, 400);

  const session = await env.DB
    .prepare('SELECT round_no, resolved, shown, target_slug, twitch_channel, round_started_at, round_ends_at FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);

  // A guess's source has to match which kind of session it's landing
  // in - otherwise a stray local POST could score into a Twitch-only
  // room's leaderboard or vice versa.
  const isTwitchSession = !!session.twitch_channel;
  if ((source === 'twitch') !== isTwitchSession) return json({ error: 'wrong session type' }, 400);

  const now = Date.now();
  const text = String(body.text || '').trim().slice(0, GUESS_TEXT_MAX);
  if (!text || !looksLikeAGuess(text)) return json({ error: 'empty guess' }, 400);
  const icon = source === 'twitch' ? DEFAULT_TWITCH_ICON : cleanIcon(body.icon);

  if (session.round_no !== roundNo) {
    // Stale: the round moved on while this was in flight. Nothing to
    // log against a round nobody's playing any more.
    return json({ correct: false, won: false, stale: true });
  }

  const animal = targetFor(session.target_slug);
  const correct = !!animal && (source === 'twitch' ? chatMatches(text, animal) : matches(text, animal));

  await env.DB
    .prepare(
      'INSERT INTO party_events (session_code, round_no, kind, player_name, icon, text, correct, created_at) ' +
      "VALUES (?1, ?2, 'guess', ?3, ?4, ?5, ?6, ?7)"
    )
    .bind(code, roundNo, playerName, icon, text, correct ? 1 : 0, now)
    .run();

  // Timed (Twitch) rounds only - local/QR has no deadline, round_ends_at
  // is null there and this never trips. A guess is still logged above
  // either way (right or wrong is chat history), it just can't win a
  // round whose time is already up - that's the host's "time's up,
  // reveal, Next round" moment now, not a photo finish.
  const expired = !!(session.round_ends_at && now >= session.round_ends_at);
  if (!correct || session.resolved || expired) {
    return json({ correct, won: false, expired });
  }

  const update = await env.DB
    .prepare('UPDATE party_sessions SET resolved = 1, last_winner = ?1, updated_at = ?2 WHERE code = ?3 AND round_no = ?4 AND resolved = 0')
    .bind(playerName, now, code, roundNo)
    .run();

  if (!update.meta.changes) {
    // Right, but someone else's guess landed first between the read
    // above and here.
    return json({ correct: true, won: false });
  }

  // Same clock-boosted hint count session.js reports to viewers, not
  // just whatever the host's manual button last wrote - a guess landing
  // after the clock has already revealed hint 4 is worth hint-4 points,
  // even if nobody happened to press the button that far yet.
  const effectiveShown = session.round_ends_at
    ? Math.max(session.shown, hintsFromElapsed(now - session.round_started_at, session.round_ends_at - session.round_started_at))
    : session.shown;
  const points = pointsForHints(effectiveShown);
  await env.DB
    .prepare(
      'INSERT INTO party_scores (session_code, player_name, source, score, rounds_won, icon, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6) ' +
      'ON CONFLICT(session_code, player_name) DO UPDATE SET score = score + ?4, rounds_won = rounds_won + 1, icon = ?5, updated_at = ?6'
    )
    .bind(code, playerName, source, points, icon, now)
    .run();

  return json({ correct: true, won: true, points });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
