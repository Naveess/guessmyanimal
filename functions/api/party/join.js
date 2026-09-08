// Registers a player as present the moment they pick a name - before
// they've guessed anything - so the scoreboard doubles as a join roster
// for colleagues/friends playing off one shared screen, not just a list
// of who's scored. Twitch viewers aren't tracked this way: there's no
// way to know who's watching without reading every chat line, and their
// first correct guess already adds them via guess.js.

import { CODE_RE, PLAYER_NAME_RE, cleanIcon, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const code = String(body.code || '').toUpperCase();
  const playerName = String(body.playerName || '').trim();
  const icon = cleanIcon(body.icon);
  const previousName = String(body.previousName || '').trim();
  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!PLAYER_NAME_RE.test(playerName)) return json({ error: 'bad player name' }, 400);

  const session = await env.DB.prepare('SELECT code, round_no FROM party_sessions WHERE code = ?1').bind(code).first();
  if (!session) return json({ error: 'not found' }, 404);

  const now = Date.now();

  // A "change your name" edit (see party.js) sends the name it's
  // replacing. Rename the existing row in place - score and rounds_won
  // travel with it - rather than falling through to the plain upsert
  // below, which would leave the old name behind as a second, orphaned
  // 0-point row and fire a spurious "X joined the party" for what's
  // really the same person. Guarded so a name collision (someone else
  // already claimed the new name) just falls through to the normal
  // join-as-that-identity path instead of silently merging two people.
  if (previousName && PLAYER_NAME_RE.test(previousName) && previousName !== playerName) {
    const renamed = await env.DB
      .prepare(
        'UPDATE party_scores SET player_name = ?1, icon = ?2, updated_at = ?3 ' +
        'WHERE session_code = ?4 AND player_name = ?5 ' +
        'AND NOT EXISTS (SELECT 1 FROM party_scores WHERE session_code = ?4 AND player_name = ?1)'
      )
      .bind(playerName, icon, now, code, previousName)
      .run();
    if (renamed.meta.changes) return json({ joined: true, renamed: true });
  }

  const existing = await env.DB
    .prepare('SELECT 1 FROM party_scores WHERE session_code = ?1 AND player_name = ?2')
    .bind(code, playerName)
    .first();

  await env.DB
    .prepare(
      'INSERT INTO party_scores (session_code, player_name, source, score, rounds_won, icon, updated_at) VALUES (?1, ?2, ?3, 0, 0, ?4, ?5) ' +
      'ON CONFLICT(session_code, player_name) DO UPDATE SET icon = ?4, updated_at = ?5'
    )
    .bind(code, playerName, 'local', icon, now)
    .run();

  // Only announce a genuinely new face - a page refresh or a reopened
  // tab re-runs this same call to keep icon/presence fresh, and that
  // shouldn't spam the feed with "X has joined" every time.
  if (!existing) {
    await env.DB
      .prepare('INSERT INTO party_events (session_code, round_no, kind, player_name, icon, created_at) VALUES (?1, ?2, \'join\', ?3, ?4, ?5)')
      .bind(code, session.round_no, playerName, icon, now)
      .run();
  }

  return json({ joined: true });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
