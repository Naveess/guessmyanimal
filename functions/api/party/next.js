// Host-only: new round. Picks a fresh target excluding everything
// already shown this session (falls back to the full pool once
// everything's been seen, same shrink-to-fit spirit as mystery.js's
// own recentNames window), resets shown/resolved, bumps round_no.

import { CODE_RE, HOST_KEY_RE, pickTarget, json } from './_lib.js';

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

  const session = await env.DB
    .prepare('SELECT host_key, category, shown_slugs, round_no FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);
  if (session.host_key !== hostKey) return json({ error: 'not the host' }, 403);

  let shownSlugs;
  try { shownSlugs = JSON.parse(session.shown_slugs) || []; } catch { shownSlugs = []; }

  const targetSlug = pickTarget(session.category, shownSlugs);
  const roundNo = session.round_no + 1;
  const now = Date.now();

  await env.DB
    .prepare('UPDATE party_sessions SET target_slug = ?1, shown_slugs = ?2, shown = 1, resolved = 0, round_no = ?3, updated_at = ?4 WHERE code = ?5')
    .bind(targetSlug, JSON.stringify(shownSlugs.concat(targetSlug)), roundNo, now, code)
    .run();

  return json({ targetSlug, shown: 1, resolved: false, roundNo });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
