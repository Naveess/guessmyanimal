// Full session state + scoreboard, polled every 1.2s by the host tab,
// the overlay tab, and every player's phone alike - the same poll-a-D1-row
// pattern stream.js already proved, just a richer payload and more readers.
//
// target_slug is sent to every poller, including players who haven't
// guessed yet - the target has to reach several separate devices somehow,
// and party mode's guess-matching is client-trusted the same way solo
// Mystery Animal's already is (see TODO.md). A determined player could
// read it from the network tab instead of guessing; that's an accepted
// trade-off for a casual party/stream game, not an oversight.

import { CODE_RE, json } from './_lib.js';

const SCORE_LIMIT = 50;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const code = (new URL(request.url).searchParams.get('code') || '').toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);

  const session = await env.DB
    .prepare('SELECT twitch_channel, category, target_slug, shown, resolved, round_no, updated_at FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);

  const { results } = await env.DB
    .prepare('SELECT player_name, source, score, rounds_won FROM party_scores WHERE session_code = ?1 ORDER BY score DESC, rounds_won DESC LIMIT ?2')
    .bind(code, SCORE_LIMIT)
    .all();

  return json({
    twitchChannel: session.twitch_channel,
    category: session.category,
    targetSlug: session.target_slug,
    shown: session.shown,
    resolved: !!session.resolved,
    roundNo: session.round_no,
    updatedAt: session.updated_at,
    scores: results.map((r) => ({
      playerName: r.player_name,
      source: r.source,
      score: r.score,
      roundsWon: r.rounds_won,
    })),
  });
}

export const onRequestPost = () => json({ error: 'method not allowed' }, 405);
