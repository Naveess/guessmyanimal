// Host-only: end the session for real. Until now "End party"/"End
// stream" only forgot the session on the host's own device (see
// party.js/streamer.js) - nothing server-side was ever deleted, so a
// room's chat log and scoreboard outlived the stream it came from
// indefinitely. This is what privacy.html promises actually happens:
// deletes the session and everything logged against it.
//
// Best-effort from the caller's point of view - streamer.js/party.js
// already read what they need for the recap screen before calling this,
// so a failed delete here (a dropped connection, D1 briefly unavailable)
// just leaves a stale room to be swept up later by create.js's own
// opportunistic TTL cleanup rather than blocking anyone's "thanks for
// playing" screen.

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

  const session = await env.DB.prepare('SELECT host_key FROM party_sessions WHERE code = ?1').bind(code).first();
  // Already gone (or never existed) reads the same as "ended" to the
  // caller - either way there's nothing left to delete.
  if (!session) return json({ ended: true });
  if (session.host_key !== hostKey) return json({ error: 'not the host' }, 403);

  // Children first - party_sessions has no FK cascade (schema.sql), so
  // an interrupted delete between these three should still never leave
  // a session row pointing at nothing; deleting events/scores before
  // the session itself means the worst case is an orphaned session row
  // create.js's TTL sweep will still clean up, not orphaned chat rows
  // under a code that could get reused.
  await env.DB.prepare('DELETE FROM party_events WHERE session_code = ?1').bind(code).run();
  await env.DB.prepare('DELETE FROM party_scores WHERE session_code = ?1').bind(code).run();
  await env.DB.prepare('DELETE FROM party_sessions WHERE code = ?1').bind(code).run();

  return json({ ended: true });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
