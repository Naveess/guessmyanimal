# To-do

Backlog features from the growth-plan review, not yet started. Carried
over as concrete follow-up work rather than left as ideas in a report.

## Shared-room party mode

A room code, a handful of players guessing the same animal, and a
scoreboard — the version of this that gets played at a party and
screenshotted afterwards. Flagged in the growth plan as the
highest-ceiling idea here and also the one most likely to eat real time —
do the cheap backlog items first if anything else is still open.

**Reuse, not new infrastructure.** Stream Mode already proved the whole
sync pattern this needs: a D1-backed key→state row, polled every 1.2s
from the client (`stream.js`'s `poll()`), no websockets, no Durable
Object, nothing that can silently drop — see `functions/api/stream.js`
and `schema.sql`'s `stream_state` table for the exact shape to copy.
Mystery Animal already has the hint list, the photo-card reveal, the
category buckets (`CATEGORY_BUCKETS` in `mystery.js`), and the
hints-used scoring curve (`pointsForHints()`) — party mode is mostly
these two things wired together with a room in between, not a build
from scratch.

**Proposed schema** (additive — new tables only, doesn't touch
`reports`/`stream_state`):

```sql
CREATE TABLE IF NOT EXISTS party_rooms (
  code         TEXT PRIMARY KEY,   -- short, typeable (e.g. 4-5 chars)
  host_key     TEXT NOT NULL,      -- random token, kept client-side, gates host-only actions
  target_slug  TEXT NOT NULL,
  category     TEXT,               -- a CATEGORY_BUCKETS key, null = All
  shown        INTEGER NOT NULL DEFAULT 1,
  resolved     INTEGER NOT NULL DEFAULT 0,
  round_no     INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS party_players (
  room_code    TEXT NOT NULL REFERENCES party_rooms(code),
  player_id    TEXT NOT NULL,      -- random, client-generated, stored per-room in localStorage
  name         TEXT NOT NULL,
  score        INTEGER NOT NULL DEFAULT 0,
  solved_round INTEGER,
  joined_at    INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL,
  PRIMARY KEY (room_code, player_id)
);
```

**Proposed endpoints** (`functions/api/party/*.js`, same validation style
as `report.js`/`stream.js` — regex-checked inputs, no accounts):
- `POST /api/party/create` — host picks a category (or All), server
  picks the target from the existing `ANIMALS` pool, generates a room
  code (retry on collision) and `host_key`, inserts the row.
- `GET /api/party/room?code=` — full room state + player list for the
  poll loop (the `stream.js` pattern, richer payload).
- `POST /api/party/hint` `{code, hostKey}` — host-only, increments
  `shown`. Needs `hostKey` to match, same "not a real security
  boundary, just enough friction" spirit as Stream Mode's key.
- `POST /api/party/guess` `{code, playerId, name, hintsShown}` — client
  validates the guess itself first (reusing `matches()`/`near()` from
  `mystery.js` — the animal data is public in `animals.js` anyway, and
  score/streak in solo mode is already entirely client-trusted, so this
  stays consistent rather than duplicating fuzzy-match logic
  server-side for a stakes-free party scoreboard) and only POSTs once
  it's already confirmed correct.
- `POST /api/party/next` `{code, hostKey}` — new round: fresh target,
  reset `shown`/`resolved`, `round_no + 1`.

**Client**: two roles, not one screen. A host view (create room, reveal
hints — reusing Mystery Animal's own hint-list and photo-card rendering
almost directly — watch the scoreboard fill in) and a player view (enter
a room code or open a `?code=` link, pick a name, see the same hints via
polling, type guesses, watch the scoreboard). Entry point matches Stream
Mode's: a corner-menu item + desktop-footer link once built.

**Open decisions to confirm at kickoff, not made here:**
1. **Hint pacing** — host presses "next hint" manually (matches solo
   mode, simplest), or the server auto-reveals on a timer so it's
   uniform regardless of who's watching the host's screen? Leaning
   host-controlled.
2. **Scoring model** — first-correct-only (Kahoot-style, competitive), or
   everyone scores by hints-used when *they* solve it (closer to solo
   mode, lower-pressure, matches the "party," not "tournament," framing
   in the growth plan)? Leaning the latter.
3. **Room lifecycle** — codes should retry on collision at creation; no
   explicit "close room" needed (a host walking away just goes stale).
   Worth a scheduled cleanup of old rows eventually, but `reports` and
   `stream_state` don't have one either today, so not a launch blocker.
4. Max players per room — no hard limit needed technically, but worth
   picking a sane display cap for the scoreboard UI.

**Rough build order**: schema → the four endpoints → host view (reusing
existing Mystery Animal rendering) → player view/join flow → menu/footer
entry point → the same critique → audit → polish pass Mystery Animal
already went through.

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
