// Two very different callers land here, deliberately kept on separate
// code paths rather than unified:
//
// - Local/QR players (source 'local'): this endpoint is the authority
//   on whether a guess is correct, not just who won. Every submission -
//   right or wrong - is logged to party_events so the room can see a
//   guess has already been tried, which only works if the server (not
//   each player's own client) is the one deciding correct/incorrect.
// - The Twitch chat overlay (source 'twitch'): unchanged from the
//   original design - the host's tab already ran GameCore's matches()
//   plus its own sentence-scanning chatMatches() before ever calling
//   this, because a public chat's "is it a leopard?" phrasing needs
//   tolerance this endpoint's plain matches() doesn't attempt. Not
//   logged to the feed - see TODO.md, Twitch mode isn't getting this
//   pass yet.
//
// Either way the round-lock is the same atomic first-writer-wins
// update, not a read-then-write: a burst of near-simultaneous correct
// guesses right after a hint drops is the normal case here, not an
// edge case. roundNo is checked against the row, not just resolved=0,
// so a guess already in flight when the host called next() can't land
// against - and accidentally score into - the round that replaced it.

import { CODE_RE, PLAYER_NAME_RE, SOURCE_RE, GUESS_TEXT_MAX, pointsForHints, matches, targetFor, cleanIcon, json } from './_lib.js';

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
    .prepare('SELECT round_no, resolved, shown, target_slug FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);

  const now = Date.now();

  if (source === 'twitch') {
    const hintsShown = Math.min(Math.max(Number(body.hintsShown) || 1, 1), 5);
    if (session.round_no !== roundNo || session.resolved) return json({ won: false });

    const update = await env.DB
      .prepare('UPDATE party_sessions SET resolved = 1, last_winner = ?1, updated_at = ?2 WHERE code = ?3 AND round_no = ?4 AND resolved = 0')
      .bind(playerName, now, code, roundNo)
      .run();
    if (!update.meta.changes) return json({ won: false });

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

  // -- Local/QR play: server decides correct/incorrect itself. --------
  const text = String(body.text || '').trim().slice(0, GUESS_TEXT_MAX);
  const icon = cleanIcon(body.icon);
  if (!text) return json({ error: 'empty guess' }, 400);

  if (session.round_no !== roundNo) {
    // Stale: the round moved on while this was in flight. Nothing to
    // log against a round nobody's playing any more.
    return json({ correct: false, won: false, stale: true });
  }

  const animal = targetFor(session.target_slug);
  const correct = !!animal && matches(text, animal);

  await env.DB
    .prepare(
      'INSERT INTO party_events (session_code, round_no, kind, player_name, icon, text, correct, created_at) ' +
      "VALUES (?1, ?2, 'guess', ?3, ?4, ?5, ?6, ?7)"
    )
    .bind(code, roundNo, playerName, icon, text, correct ? 1 : 0, now)
    .run();

  if (!correct || session.resolved) {
    return json({ correct, won: false });
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

  const points = pointsForHints(session.shown);
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
