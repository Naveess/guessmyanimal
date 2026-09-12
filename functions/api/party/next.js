// Host-only: new round. Picks a fresh target excluding everything
// already shown this session (falls back to the full pool once
// everything's been seen, same shrink-to-fit spirit as mystery.js's
// own recentNames window), resets shown/resolved, bumps round_no.
//
// The UPDATE is locked to the round_no this request read (same
// first-writer-wins shape guess.js uses for scoring), not a plain
// WHERE code=?. Two near-simultaneous calls - a host double-clicking
// "Next round" is the realistic trigger - would otherwise both pick a
// fresh target and both write, the second silently clobbering the
// first's with a different animal and logging a duplicate 'round'
// divider, at which point the round the first call started never
// actually got played. A losing call now gets back the state the
// winner already wrote, instead of corrupting it.

import { CODE_RE, HOST_KEY_RE, pickTarget, roundDeadline, json } from './_lib.js';

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
    .prepare('SELECT host_key, category, shown_slugs, round_no, twitch_channel FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);
  if (session.host_key !== hostKey) return json({ error: 'not the host' }, 403);

  let shownSlugs;
  try { shownSlugs = JSON.parse(session.shown_slugs) || []; } catch { shownSlugs = []; }

  const fromRound = session.round_no;
  const targetSlug = pickTarget(session.category, shownSlugs);
  const roundNo = fromRound + 1;
  const now = Date.now();
  const { roundStartedAt, roundEndsAt } = roundDeadline(session.twitch_channel, roundNo, now);

  const update = await env.DB
    .prepare('UPDATE party_sessions SET target_slug = ?1, shown_slugs = ?2, shown = 1, resolved = 0, last_winner = NULL, round_no = ?3, round_started_at = ?4, round_ends_at = ?5, updated_at = ?6 WHERE code = ?7 AND round_no = ?8')
    .bind(targetSlug, JSON.stringify(shownSlugs.concat(targetSlug)), roundNo, roundStartedAt, roundEndsAt, now, code, fromRound)
    .run();

  if (!update.meta.changes) {
    // Lost the race - another next() already advanced this session past
    // the round we read. Report what's actually there now rather than
    // returning the target we picked and never wrote.
    const fresh = await env.DB
      .prepare('SELECT target_slug, shown, resolved, round_no, round_ends_at FROM party_sessions WHERE code = ?1')
      .bind(code)
      .first();
    return json({
      targetSlug: fresh.target_slug, shown: fresh.shown, resolved: !!fresh.resolved,
      roundNo: fresh.round_no, roundEndsAt: fresh.round_ends_at, serverNow: now,
    });
  }

  // A divider in the activity feed so old guesses read as belonging to
  // a finished round rather than sitting there looking like live,
  // still-untried guesses for the new target.
  await env.DB
    .prepare("INSERT INTO party_events (session_code, round_no, kind, created_at) VALUES (?1, ?2, 'round', ?3)")
    .bind(code, roundNo, now)
    .run();

  return json({ targetSlug, shown: 1, resolved: false, roundNo, roundEndsAt, serverNow: now });
}

export const onRequestGet = () => json({ error: 'method not allowed' }, 405);
