# To-do

Backlog features from the growth-plan review, not yet started. Carried
over as concrete follow-up work rather than left as ideas in a report.

## Party mode (Twitch chat guessing)

Decided against the device-join ("everyone scans a room code") version —
for a streamer, the players are already in one place: Twitch chat. No
join step, no room code for viewers to type, no separate player screen.
The streamer reveals hints on stream; chat guesses like it normally
would; first correct guess wins the round and scores.

**Architecture — no new persistent infra needed.** Cloudflare Pages
Functions are request/response only, so nothing here can hold a live
connection server-side, and nothing needs to: Twitch's chat IRC
(`wss://irc-ws.chat.twitch.tv:443`) allows **anonymous read-only**
connections — join as `justinfanNNNNN`, no OAuth token, no Twitch Dev
app registration, just a WebSocket the *browser* holds open. So the
listener lives entirely client-side, in a browser tab:

- **Overlay tab** (opened as an OBS Browser Source, or any tab) connects
  to Twitch IRC anonymously, joins the streamer's channel by name typed
  in at setup, and reads chat messages directly in JS. It runs the guess
  match itself — reusing `matches()`/`near()` from `mystery.js` against
  the live target, the exact fuzzy-match logic solo mode already trusts
  client-side — and POSTs only the winning username once a message
  matches.
- **Host control tab** — reveal next hint, start next round. Gated by
  `host_key` in the URL/localStorage, same "enough friction, not a real
  boundary" spirit as Stream Mode's key. Can be the same physical tab as
  the overlay for a single-monitor streamer, but kept as separate
  concerns in the code.
- Both tabs sync through D1 via the same 1.2s poll loop as `stream.js` —
  no new sync mechanism, just Stream Mode's proven pattern reused again.

**Pre-build check, same discipline as the AdSense read for Teachers:**
confirm Twitch's current policy/behaviour for anonymous read-only IRC
still holds (it's long-standing and widely relied on by existing chat
overlay tools, but verify for real before building on it, not from
memory).

**Proposed schema** (additive, doesn't touch `reports`/`stream_state`;
renamed from the old `party_rooms`/`party_players` draft since there's
no viewer "join" left to model):

```sql
CREATE TABLE IF NOT EXISTS party_sessions (
  code           TEXT PRIMARY KEY,   -- short, typeable, shown on the host tab only
  host_key       TEXT NOT NULL,
  twitch_channel TEXT NOT NULL,
  category       TEXT,               -- a CATEGORY_BUCKETS key, null = All
  target_slug    TEXT NOT NULL,
  shown          INTEGER NOT NULL DEFAULT 1,
  resolved       INTEGER NOT NULL DEFAULT 0,
  round_no       INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS party_scores (
  session_code   TEXT NOT NULL REFERENCES party_sessions(code),
  twitch_username TEXT NOT NULL,     -- identity is just whoever typed it in chat, no accounts
  score          INTEGER NOT NULL DEFAULT 0,
  rounds_won     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (session_code, twitch_username)
);
```

**Proposed endpoints** (`functions/api/party/*.js`, same validation
style as `report.js`/`stream.js`):
- `POST /api/party/create` `{category, twitchChannel}` — server picks
  the target, generates `code` (retry on collision) + `host_key`.
- `GET /api/party/session?code=` — full state + scoreboard, polled by
  both tabs every 1.2s (the `stream.js` pattern, richer payload).
- `POST /api/party/hint` `{code, hostKey}` — host-only, increments
  `shown`.
- `POST /api/party/guess` `{code, twitchUsername, hintsShown}` — called
  by the overlay only, once it has already matched a chat message
  client-side. **Must be an atomic first-writer-wins update** —
  `UPDATE party_sessions SET resolved=1 WHERE code=? AND resolved=0`,
  check rows-affected before awarding the point — since a burst of
  near-simultaneous correct guesses right after a hint drops is the
  normal case here, not an edge case, and the DB write is the only
  thing that can't race.
- `POST /api/party/next` `{code, hostKey}` — new round: fresh target
  (excluding targets already shown this session), reset
  `shown`/`resolved`, `round_no + 1`.

**Scoring**: first correct guess per round wins, scored via the existing
`pointsForHints()` curve on however many hints were showing when they
got it. Scoreboard accumulates across the whole session (not just the
round), keyed by Twitch username since there's no join step to attach a
score to otherwise. Display cap ~30-50 rows (top N + "…and N more") —
this is a running-session cap now, not a per-round player cap, since
identity is just "whoever's typed a winning guess in this chat so far."

**Open items to confirm/verify during build, not decided here:**
1. Verify the anonymous Twitch IRC read-access assumption above for
   real before relying on it.
2. Public chat is noisier than a solo text box — people chatting about
   other things, emote spam, links. `matches()`/`near()` as-is may need
   a cheap pre-filter (skip messages with links/commands, skip wildly
   off-length messages) before running the real fuzzy match, so the
   overlay isn't scoring "lol" as a near-miss on a 3-letter animal.
3. Repeat-target avoidance within one session (don't reshow the same
   animal twice on the same stream).
4. The overlay should pre-filter obviously-irrelevant chat messages
   before ever calling the guess endpoint, not just rely on the D1
   atomic update — that update stops double-scoring, it doesn't stop
   every single chat line during a busy stream from hitting the API.

**Rough build order**: schema → the four endpoints (the atomic
first-writer-wins guess handler is the one piece needing real care) →
host control tab (reuses Mystery Animal's hint-list rendering) →
overlay tab (Twitch IRC WebSocket client + scoreboard, reusing
`pointsForHints()`/`matches()`/`near()`) → a short in-app note on adding
it as an OBS Browser Source → the same critique → audit → polish pass
Mystery Animal already went through.

## Teachers outreach

Twenty questions is a classroom staple, a wet-break filler and a
car-journey standard. A teacher needs exactly what this site already is:
instant, honest answers about an animal, and a game that runs on the
whiteboard with no setup or login. The Daily fits a form-time slot almost
too neatly — no product changes are needed to start this, it's a
distribution task, not a build task.

**Blocking, do this first:** AdSense is live, and Google has extra
obligations for child-directed content. Read Google's actual
family/child-directed policy before posting anywhere aimed at primary
classrooms — the site itself likely isn't "child-directed" in the
policy's sense (general-audience reference tool, not marketed or
designed specifically for children, collects nothing from anyone), but
that's a real read, not an assumption to skip.

**Messaging, by community** (lead with the classroom use, never the
URL first):
- r/Teachers, r/ScienceTeachers — the wet-break-filler / form-time
  angle, framed as "built this for my own car journeys, turns out it
  works on a classroom whiteboard too."
- TES — a resource-share post; the site is already en-GB throughout
  (spelling, "Would you find one in Britain?" as an existing Quick
  Answer), so it doesn't need re-framing for a UK teaching audience.
- Primary teaching Facebook groups — casual, screenshot-led, matches
  how those groups actually get used.

**Cadence**: stagger over 1-2 weeks rather than posting everywhere at
once, and reply to every comment — the first Reddit launch's real value
came from the replies, not the post itself. Note which post drove any
traffic spike the same day it happens, the same "write it down" habit
the growth plan's own "What to watch" section already recommends —
otherwise a month from now it's unclear whether the good Tuesday was the
subreddit or the Facebook group.
