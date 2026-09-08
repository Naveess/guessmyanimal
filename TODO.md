# To-do

Backlog features from the growth-plan review, not yet started. Carried
over as concrete follow-up work rather than left as ideas in a report.

## Party mode (Twitch chat + local/QR play)

Looked at wos.gg as the closest existing example of this exact feature.
It runs two modes side by side — chat-based for streaming, and a local
QR-join mode for playing in person off a shared screen — and locks a
round the instant someone's right so the revealed answer can't be
copy-pasted into chat for extra points. Folding both into one plan below
rather than two separate features, since almost everything (the
session, the hints, the scoring, the lock) is identical between them —
only how a guess *arrives* differs.

**Still no new persistent infra needed.** Cloudflare Pages Functions are
request/response only, so nothing here can hold a live connection
server-side, and nothing needs to:

- **Twitch guesses**: Twitch's chat IRC (`wss://irc-ws.chat.twitch.tv:443`)
  allows **anonymous read-only** connections — join as `justinfanNNNNN`,
  no OAuth token, no Twitch Dev app registration, just a WebSocket the
  *browser* holds open. An **overlay tab** (OBS Browser Source, or any
  tab) connects anonymously, joins the streamer's channel by name typed
  in at setup, reads chat directly in JS, and runs the guess match
  itself — reusing `matches()`/`near()` from `mystery.js`, the same
  fuzzy-match logic solo mode already trusts client-side — POSTing only
  the winning name once a message matches.
- **Local guesses**: a player's phone is just another browser tab
  polling the same D1 row, same as the overlay. No listener needed at
  all — they type their guess straight into a page.
- **Host control tab** — reveal next hint, start next round, show the QR
  code. Gated by `host_key`, same spirit as Stream Mode's key. Twitch
  channel name is one optional field on it: leave it blank and the
  session is local-only, fill it in and the chat listener also runs —
  both can be live on the same session at once for free, since nothing
  about the schema or the guess endpoint cares where a guess came from.
- All tabs (host, overlay, every player's phone) sync through D1 via the
  same 1.2s poll loop as `stream.js` — no new sync mechanism, Stream
  Mode's proven pattern reused again, just with more readers.

**wos.gg's "padlock"** — round locks the instant someone's right, so a
chat message repeating the revealed answer, or a slower phone a second
behind, can't double-score — is just the atomic first-writer-wins update
already planned below (`UPDATE ... SET resolved=1 WHERE code=? AND
resolved=0`, check rows-affected). Not a separate mechanic to add, both
guess paths land on the same write.

**Not carrying over**: wos.gg's levels/progression-toward-a-group-goal
layer. Neat, but a separate feature sitting on top of a working
scoreboard, not part of getting this shipped — worth a look once the
core loop's live and actually used a few times, not before.

**Pre-build check, same discipline as the AdSense read for Teachers:**
confirm Twitch's current policy/behaviour for anonymous read-only IRC
still holds (long-standing, widely relied on by existing chat overlay
tools, but verify for real before building on it, not from memory).

**Proposed schema** (additive, doesn't touch `reports`/`stream_state`;
the identity column is widened since it's not Twitch-only anymore):

```sql
CREATE TABLE IF NOT EXISTS party_sessions (
  code           TEXT PRIMARY KEY,   -- short, typeable, shown as text + QR on the host tab
  host_key       TEXT NOT NULL,
  twitch_channel TEXT,               -- null/blank = local-only session
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
  player_name    TEXT NOT NULL,      -- a Twitch username or a locally-typed name, same column either way
  source         TEXT NOT NULL DEFAULT 'local',  -- 'twitch' | 'local' — cheap to keep, useful later
  score          INTEGER NOT NULL DEFAULT 0,
  rounds_won     INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (session_code, player_name)
);
```

**Proposed endpoints** (`functions/api/party/*.js`, same validation
style as `report.js`/`stream.js`):
- `POST /api/party/create` `{category, twitchChannel?}` — server picks
  the target, generates `code` (retry on collision) + `host_key`.
  `twitchChannel` omitted/blank → local-only session.
- `GET /api/party/session?code=` — full state + scoreboard, polled by
  the host tab, the overlay tab, and every player's phone alike.
- `POST /api/party/hint` `{code, hostKey}` — host-only, increments
  `shown`.
- `POST /api/party/guess` `{code, playerName, hintsShown}` — called by
  whichever client already matched the guess itself (overlay, reading
  chat, or a player's own phone) — same **atomic first-writer-wins**
  write either way: `UPDATE party_sessions SET resolved=1 WHERE code=?
  AND resolved=0`, check rows-affected before awarding the point, since
  a burst of near-simultaneous correct guesses right after a hint drops
  is the normal case here, not an edge case.
- `POST /api/party/next` `{code, hostKey}` — new round: fresh target
  (excluding targets already shown this session), reset
  `shown`/`resolved`, `round_no + 1`.

**Scoring**: first correct guess per round wins, scored via the existing
`pointsForHints()` curve on however many hints were showing when they
got it. Scoreboard accumulates across the whole session, keyed by
`player_name`. Display cap ~30-50 rows (top N + "…and N more").

**New client surface for local play** (the chat-only draft didn't need
this): a `.partyview` panel in `index.html`, routed via `?party=<code>`
in `app.js`'s `routeFromURL()` — same pattern as the existing
`?stream=1`/`?report=1` handling. Name entry once (saved to
localStorage), then hints + a guess box underneath, reusing Mystery
Animal's own rendering and matching — basically its guess box, pointed
at a shared target instead of a private one. Plus the QR code itself on
the host tab, pointing at `guessmyanimal.com/?party=<code>` — needs a
small vendored client-side QR-generation library, not a call to a
third-party QR image API (the site doesn't phone out to services it
doesn't need anywhere else, no reason to start here).

**Open items to confirm/verify during build, not decided here:**
1. Verify the anonymous Twitch IRC read-access assumption above for
   real before relying on it.
2. Public chat is noisier than a solo text box — people chatting about
   other things, emote spam, links. `matches()`/`near()` as-is may need
   a cheap pre-filter (skip messages with links/commands, skip wildly
   off-length messages) before running the real fuzzy match, so the
   overlay isn't scoring "lol" as a near-miss on a 3-letter animal.
3. Repeat-target avoidance within one session (don't reshow the same
   animal twice in one party/stream).
4. Both guess paths should pre-filter obviously-irrelevant input before
   ever calling the guess endpoint, not just rely on the D1 atomic
   update — that update stops double-scoring, it doesn't stop every
   chat line or keystroke from hitting the API.
5. Local names have no uniqueness check — two people could type the
   same name in one session and share a scoreboard row. Low-stakes for
   a party game, but worth a one-line "name taken, try another" rather
   than silently merging two people's scores.
6. Pick the vendored QR library (small, no network dependency at
   render-time).

**Rough build order**: schema → the four endpoints (the atomic guess
handler is still the one piece needing real care) → host control tab
(reveal hints, show QR + code, optional Twitch channel field) → overlay
tab (Twitch IRC listener) → `.partyview` local play panel (name entry +
hint/guess reuse) → the same critique → audit → polish pass Mystery
Animal already went through.

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
