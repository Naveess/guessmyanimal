// Host-only: end the current round with no winner, without ending the
// whole party - the escape hatch a round that's run out of hints and
// nobody's guessing right used to be missing (see the party critique
// this closes; the only prior exit was end.js, which kills every
// player's session, not just the one stuck round).
//
// Sets last_winner to NULL rather than picking one - the client's
// existing "Round over." rendering (party.js's renderRound, the same
// branch a Twitch round's expiry-with-no-winner already uses) already
// handles a resolved round with nobody. The host still has to tap
// Next round afterwards, same as any other resolved round.
//
// No round_no check needed the way next()/guess() need one: the only
// writer here is the host's own hostKey-gated button, not a field of
// racing guesses, so a plain "AND resolved = 0" is enough to make a
// double-click a no-op instead of a double-write.

import { CODE_RE, HOST_KEY_RE, json } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const code = String(body.code || '').toUpperCase();
  const hostKey = String(body.hostKey || '');
  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);
  if (!HOST_KEY_RE.test(hostKey)) return json({ error: 'bad host key' }, 400);

  const session = await env.DB.prepare('SELECT host_key, resolved, round_no FROM party_sessions WHERE code = ?1').bind(code).first();
  if (!session) return json({ error: 'not found' }, 404);
  if (session.host_key !== hostKey) return json({ error: 'not the host' }, 403);

  if (session.resolved) return json({ resolved: true, roundNo: session.round_no });

  await env.DB
    .prepare('UPDATE party_sessions SET resolved = 1, last_winner = NULL, updated_at = ?1 WHERE code = ?2 AND resolved = 0')
    .bind(Date.now(), code)
    .run();

  return json({ resolved: true, roundNo: session.round_no });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
