// Host-only: reveal the next hint. hostKey just needs to match what
// create.js handed back - enough friction, not a real security
// boundary, since the only thing at stake is what a party's hint list
// shows.

import { CODE_RE, HOST_KEY_RE, MAX_HINTS, json } from './_lib.js';

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

  const session = await env.DB.prepare('SELECT host_key, shown, resolved FROM party_sessions WHERE code = ?1').bind(code).first();
  if (!session) return json({ error: 'not found' }, 404);
  if (session.host_key !== hostKey) return json({ error: 'not the host' }, 403);

  // Round's already won - nothing to reveal, the host wants next() instead.
  if (session.resolved) return json({ shown: session.shown, resolved: true });

  const shown = Math.min(session.shown + 1, MAX_HINTS);
  await env.DB
    .prepare('UPDATE party_sessions SET shown = ?1, updated_at = ?2 WHERE code = ?3')
    .bind(shown, Date.now(), code)
    .run();

  return json({ shown, resolved: false });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
