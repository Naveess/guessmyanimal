// Stream Mode's sync channel. See schema.sql for why this exists at all:
// OBS's Browser Source is a separate browser process, so the only way
// for the streamer's own lookups to reach it is through here.
//
// GET  ?key=xxx  -> { slug, updatedAt } for the overlay's poll loop.
// POST { key, slug } -> the control page (the site, used normally with
// Stream Mode on) calls this on every animal it shows.
//
// No accounts: the key is a random string generated client-side and
// carried in a URL, not a login. It is not a security boundary against
// a determined attacker - guessing a 12-character random key is
// impractical for casual abuse, which is all this needs to resist,
// since the only thing at stake is what a stream overlay displays.

const KEY_RE = /^[a-z0-9]{8,24}$/i;
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const key = new URL(request.url).searchParams.get('key') || '';
  if (!KEY_RE.test(key)) return json({ error: 'bad key' }, 400);

  const row = await env.DB.prepare('SELECT slug, updated_at FROM stream_state WHERE key = ?1')
    .bind(key)
    .first();

  if (!row) return json({ slug: null, updatedAt: null });
  return json({ slug: row.slug, updatedAt: row.updated_at });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'unavailable' }, 503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return json({ error: 'bad content-type' }, 415);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!body) return json({ error: 'bad json' }, 400);

  const key = String(body.key || '');
  const slug = String(body.slug || '');
  if (!KEY_RE.test(key)) return json({ error: 'bad key' }, 400);
  if (!SLUG_RE.test(slug)) return json({ error: 'bad slug' }, 400);

  await env.DB
    .prepare('INSERT INTO stream_state (key, slug, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET slug = excluded.slug, updated_at = excluded.updated_at')
    .bind(key, slug, Date.now())
    .run();

  return json({ ok: true });
}
