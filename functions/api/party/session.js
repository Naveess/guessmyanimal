// Full session state + scoreboard, polled every 1.2s by the host tab,
// the overlay tab, and every player's phone alike - a poll-a-D1-row
// pattern, just with a richer payload and more readers than a single
// value.
//
// target_slug is sent to every poller, including players who haven't
// guessed yet - the target has to reach several separate devices somehow,
// and party mode's guess-matching is client-trusted the same way solo
// Mystery Animal's already is (see TODO.md). A determined player could
// read it from the network tab instead of guessing; that's an accepted
// trade-off for a casual party/stream game, not an oversight.

import { CODE_RE, json } from './_lib.js';

const SCORE_LIMIT = 50;
const EVENT_LIMIT = 80;

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const code = (new URL(request.url).searchParams.get('code') || '').toUpperCase();
  if (!CODE_RE.test(code)) return json({ error: 'bad code' }, 400);

  const session = await env.DB
    .prepare('SELECT twitch_channel, category, target_slug, shown, resolved, last_winner, round_no, updated_at FROM party_sessions WHERE code = ?1')
    .bind(code)
    .first();
  if (!session) return json({ error: 'not found' }, 404);

  // updated_at ASC as the tiebreaker keeps a cluster of just-joined,
  // still-0-point players in join order instead of reshuffling on every
  // poll - matters more now that joining alone (not just scoring) adds
  // a row, see join.js.
  // updated_at is also sent per row - it's the only signal the client
  // has for "is this player actually here right now", since join.js
  // gets called again as a heartbeat while a tab stays open (see
  // party.js). A closed tab just stops refreshing it, so it ages out
  // on its own without needing an explicit "left" event.
  const { results } = await env.DB
    .prepare('SELECT player_name, source, score, rounds_won, icon, updated_at FROM party_scores WHERE session_code = ?1 ORDER BY score DESC, rounds_won DESC, updated_at ASC LIMIT ?2')
    .bind(code, SCORE_LIMIT)
    .all();

  // Most-recent EVENT_LIMIT rows, sent back oldest-first so the client
  // can just append them in order - a chat log reads top-to-bottom.
  const events = await env.DB
    .prepare('SELECT id, kind, player_name, icon, text, correct, round_no, created_at FROM party_events WHERE session_code = ?1 ORDER BY id DESC LIMIT ?2')
    .bind(code, EVENT_LIMIT)
    .all();

  return json({
    twitchChannel: session.twitch_channel,
    category: session.category,
    targetSlug: session.target_slug,
    shown: session.shown,
    resolved: !!session.resolved,
    lastWinner: session.last_winner,
    roundNo: session.round_no,
    updatedAt: session.updated_at,
    scores: results.map((r) => ({
      playerName: r.player_name,
      source: r.source,
      score: r.score,
      roundsWon: r.rounds_won,
      icon: r.icon || null,
      updatedAt: r.updated_at,
    })),
    events: events.results.reverse().map((e) => ({
      id: e.id,
      kind: e.kind,
      playerName: e.player_name,
      icon: e.icon || null,
      text: e.text,
      correct: e.correct === null ? null : !!e.correct,
      roundNo: e.round_no,
      createdAt: e.created_at,
    })),
  });
}

export const onRequestPost = () => json({ error: 'method not allowed' }, 405);
