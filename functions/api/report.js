// Receives problem reports from the site: a wrong photo, a wrong fact, a
// missing animal.
//
// The endpoint is public and unauthenticated, because the whole point is
// that someone's mum can report a wrong picture without making an account.
// That means it has to defend itself, so everything below is a cheap filter
// that costs a real person nothing and costs a naive bot the submission:
// a honeypot field no human ever sees, a minimum time-on-form, hard length
// caps, and a fixed set of allowed categories.
//
// Nothing identifying is stored. No IP address, no cookie, no user agent.

const KINDS = ['photo', 'facts', 'missing', 'other'];

const MAX_BODY = 4096;      // bytes
const MAX_MESSAGE = 1000;   // characters
const MAX_ANIMAL = 80;
const MIN_DWELL = 1500;     // ms the form must have been open

function done(status) {
  return new Response(null, { status, headers: { 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return done(503);

  const type = request.headers.get('content-type') || '';
  if (!type.includes('application/json')) return done(415);

  const raw = await request.text();
  if (!raw || raw.length > MAX_BODY) return done(413);

  let body;
  try { body = JSON.parse(raw); } catch { return done(400); }
  if (!body || typeof body !== 'object') return done(400);

  // A field hidden from people and left empty by them. Anything in it is
  // a form-filling bot, so accept the request and store nothing.
  if (body.website) return done(204);

  if (!(Number(body.dwell) >= MIN_DWELL)) return done(400);

  const kind = String(body.kind || '');
  if (!KINDS.includes(kind)) return done(400);

  const message = String(body.message || '').trim();
  if (message.length < 3 || message.length > MAX_MESSAGE) return done(400);

  const animal = String(body.animal || '').trim().slice(0, MAX_ANIMAL) || null;

  try {
    await env.DB
      .prepare('INSERT INTO reports (animal, kind, message) VALUES (?1, ?2, ?3)')
      .bind(animal, kind, message)
      .run();
  } catch {
    return done(500);
  }

  return done(204);
}

// Methods are declared one at a time rather than through a catch-all
// onRequest, which would take over from onRequestPost instead of sitting
// beside it. A method with no handler here does not get an automatic 405:
// it falls through to the static handler and answers with the site's HTML,
// which is a confusing thing for an API path to return.
export const onRequestGet = () => done(405);
