// Called by whichever client already matched the guess itself - the
// overlay, reading Twitch chat, or a player's own phone in local/QR
// play. Either way this is the one write that can't race: a burst of
// near-simultaneous correct guesses right after a hint drops is the
// normal case here, not an edge case, so the round-lock has to be an
// atomic first-writer-wins update, not a read-then-write.
//
// roundNo is checked against the row, not just resolved=0, so a guess
// that was already in flight when the host called next() can't land
// against - and accidentally score into - the round that replaced it.

import { CODE_RE, PLAYER_NAME_RE, SOURCE_RE, pointsForHints, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const code = String(body.code || '').toUpperCase();
  const playerName = String(body.playerName || '').trim();
  const hintsShown = Math.min(Math.max(Number(body.hintsShown) || 1, 1), 5);
  const roundNo = Number(body.roundNo);
  const source = SOURCE_RE.test(body.source) ? body.source : 'local';

  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!PLAYER_NAME_RE.test(playerName)) return json({ error: 'bad player name' }, 400);
  if (!Number.isInteger(roundNo) || roundNo < 1) return json({ error: 'bad round' }, 400);

  const session = await env.DB.prepare('SELECT round_no, resolved FROM party_sessions WHERE code = ?1').bind(code).first();
  if (!session) return json({ error: 'not found' }, 404);

  if (session.round_no !== roundNo || session.resolved) {
    return json({ won: false });
  }

  const now = Date.now();
  const update = await env.DB
    .prepare('UPDATE party_sessions SET resolved = 1, last_winner = ?1, updated_at = ?2 WHERE code = ?3 AND round_no = ?4 AND resolved = 0')
    .bind(playerName, now, code, roundNo)
    .run();

  if (!update.meta.changes) {
    // Someone else's guess landed first between the read above and here.
    return json({ won: false });
  }

  const points = pointsForHints(hintsShown);
  await env.DB
    .prepare(
      'INSERT INTO party_scores (session_code, player_name, source, score, rounds_won, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5) ' +
      'ON CONFLICT(session_code, player_name) DO UPDATE SET score = score + ?4, rounds_won = rounds_won + 1, source = ?3, updated_at = ?5'
    )
    .bind(code, playerName, source, points, now)
    .run();

  return json({ won: true, points });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
