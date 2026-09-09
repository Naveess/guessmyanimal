# Twitch chat play — rebuild brief

Written 2026-09-09 to be picked up cold, by someone (or some session) with no
memory of the conversation that produced it.

## Start here

> Read `TWITCH-REBUILD.md`. We're rebuilding Party Mode's Twitch chat path as a
> separate streamer surface. Don't start writing code — walk me through what you'd
> build first, and flag anything in the brief you disagree with.

Read `TODO.md`'s Party Mode section and `DESIGN.md`'s Named Rules before touching
anything. This codebase comments *why*, not *what* — the existing comments are the
real spec and are usually more current than any document, this one included.

---

## The constraint that shapes everything

**Cloudflare Pages Functions cannot hold a persistent connection.** No WebSocket
server, no long-lived process, no background worker. That single fact decides the
architecture, and it's why the current design looks the way it does — from
`party.js:801-807`:

> Twitch's chat IRC accepts anonymous read-only connections: connect as
> justinfanNNNNN, JOIN a channel, every message arrives as a PRIVMSG. No OAuth, no
> Twitch developer app - which is why this can live in an ordinary browser tab
> instead of needing a server that can hold a persistent connection (Cloudflare
> Pages Functions can't).

So the IRC connection lives in **the host's own browser tab**. Consequences that
are easy to forget and expensive to rediscover:

- Close the host tab and chat play stops. There is no server-side reader.
- The host's browser is the only thing that sees chat messages. Anything the
  server needs to know, the host tab has to tell it.
- Scaling is per-host, not per-viewer — one WebSocket regardless of audience size.

Moving off this (a Durable Object, a small VPS, Workers with a DO backend) is a
real option but it is a *hosting* decision, not a feature decision. Don't drift
into it by accident.

---

## What exists today

All of it works. None of it is finished.

### Connection — `party.js:809-874`
- `wss://irc-ws.chat.twitch.tv:443`, anonymous `justinfan<random 5 digits>`, `JOIN
  #channel`. No PASS, no CAP REQ.
- `PING` → `PONG :tmi.twitch.tv` keepalive (`party.js:857`).
- Messages parsed with one regex: `/^:([^!]+)![^ ]+ PRIVMSG #[^ ]+ :(.*)$/`.
- Reconnect with exponential backoff, 1s doubling to a 30s ceiling
  (`scheduleReconnect`, `party.js:870`).
- `ensureChat()` is called from the 1.2s poll loop, which doubles as the only
  connection watchdog.
- Status line `#partyChatStatus` — `is-live` (green dot) / `is-down` (red dot), set
  only by `setChatStatus` (`party.js:829`).

### Guess filtering — `party.js:880-913`
Two filters stand between chat and the scorer, and **both are deliberate**:

- `looksLikeAGuess()` rejects empty, >40 chars, leading `!` or `/`, URLs, leading `@`.
- `chatMatches()` is fuzzy-match **or** an exact whole-word scan. The comment at
  `party.js:896-900` explains why it is not simply fuzzy:

  > Deliberately exact inside a sentence, never fuzzy: the pool has animals called
  > Swift, Crane, Seal and Ray, and fuzzy-matching those against ordinary
  > conversation would end rounds nobody was guessing in - a much worse failure
  > than a missed phrasing, since first correct answer takes the round outright.

  **Do not "improve" this into plain fuzzy matching.** It was a considered call and
  the failure mode it prevents is the worst one available: ending a round nobody
  was playing.

### Scoring — `party.js:915-934` → `functions/api/party/guess.js:53-73`
Chat guesses POST to the same `/api/party/guess` endpoint as phones, with
`source: 'twitch'`. The server takes a **separate branch** that trusts the client's
verdict, then does a first-writer-wins `UPDATE ... AND round_no = ?4 AND resolved =
0` before upserting the score.

---

## The four real gaps

1. **Chat guesses are client-trusted.** The `source: 'twitch'` branch
   (`guess.js:53`) never checks the guess itself — the host tab says "this one
   won" and the server believes it. Local play was made server-authoritative
   (`guess.js:86-87` runs `matches()` against the session's own `target_slug`);
   Twitch never was. Anyone can POST a win directly. For a casual party game this
   is a smaller deal than it sounds, but it is a real asymmetry and the reason the
   next gap exists too.
2. **Chat guesses never reach the activity feed.** The Twitch branch writes no
   `party_events` row, so the feed a room relies on to see "that's been tried" is
   blind to chat entirely. Fixing gap 1 mostly fixes this one — the server can only
   log what it decides.
3. **No icon on the Twitch score upsert** (`guess.js:66` omits the column), so chat
   players render with a blank icon slot and a `.is-twitch` marker on the name.
4. **An invalid channel looks identical to a working one.** Nothing parses IRC
   `NOTICE`, `RECONNECT`, or the `366` end-of-names reply, so a typo'd channel joins
   "successfully" and sits on a green `is-live` dot forever, silently receiving
   nothing. This is the single most likely thing to make a streamer think the
   feature is broken.

---

## Direction: a separate streamer surface

Confirmed 2026-09-09. **Do not** extend local play's patterns onto the Twitch path
to reach parity — that was explicitly considered and rejected.

The reasoning: local play is *six people in a room*, and its whole design follows
from that — a roster you read top to bottom, a presence dot per person, a rename
affordance, an emoji you pick. Twitch is *one host and hundreds of viewers*. Those
are different problems, and the shared-component version serves neither well.

What that implies:

- **No per-viewer presence.** There is no tab to heartbeat from on a viewer's
  behalf (`party.js:278-280` already notes this), and a hundred dots is noise, not
  information.
- **A chat-native leaderboard**, not a roster. Probably top-N, probably weighted
  toward the current round rather than a running list of everyone who ever typed.
- **Built to be looked at on a stream** — read at distance, over a webcam overlay,
  by people who cannot interact with it.
- **Its own components.** Don't reuse `.party-score` wholesale. Do reuse the
  design system underneath it (see `DESIGN.md`) — new components, same rules.

### Open questions this direction leaves

These are genuinely unresolved. Decide them deliberately rather than by
implementation accident:

- **Does a mixed party still exist?** Phones and chat in one session is what the
  current code does. If the streamer surface is separate, is a mixed room still
  supported, or does a host pick one mode?
- **Does the streamer surface get its own route?** A separate page was just deleted
  (the old OBS overlay, removed 2026-09-09) precisely to stop maintaining two
  surfaces — so re-adding one needs a better reason than "it's different." A
  distinct *layout within* `#partyview` may be the answer.
- **Does fixing gap 1 change the trust model for everyone?** Making Twitch
  server-authoritative means the server must know the chat username, and the host
  tab is the only thing that can tell it. That's still client-reported — think
  about what's actually being guaranteed.
- **Is anonymous IRC still the right transport** given every gap above, or is this
  the moment to take the OAuth/EventSub path and accept needing a Twitch app?

---

## Ground rules

- The `#partyTwitch` field currently sits in a `.wip` under-construction panel
  (`index.html`, `.wip` in `style.css`, documented in `DESIGN.md`) warning
  streamers not to run it live. **Take the panel down when the rebuild ships, not
  before.** The input is intentionally left enabled so this stays testable.
- Bump `?v=` on every changed shell file *and* `sw.js`'s `VERSION` + `SHELL`, or
  returning visitors keep the stale copy. See README.
- `wrangler pages dev` spawns a process tree; killing `workerd.exe` alone just
  respawns it. `TODO.md` has the working kill command.
- The live D1 database still has an orphaned `stream_state` table from the deleted
  Stream Mode feature. Dropping it is a pending decision, unrelated to this work.
