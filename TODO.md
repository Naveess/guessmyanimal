# To-do

Backlog features from the growth-plan review, not yet started. Carried
over as concrete follow-up work rather than left as ideas in a report.

## Party mode (local/QR play) and Twitch stream mode

**Local/QR play is built, working and on `main`** — the
`party-mode-page` branch it was written on is fully merged (checked
2026-09-11: zero commits ahead of `main`), so the "not yet merged,
decide after playtesting" note that used to sit here was simply stale.
Twitch chat play has since moved off this page onto `streamer.html`
entirely — see the 2026-09-11 note below.

What's actually there, as of 2026-09-08:
- `functions/api/party/{create,session,hint,next,guess,join}.js` +
  `_lib.js`. Schema is `party_sessions`, `party_scores` (now with an
  `icon` column) and `party_events` (join/guess/round-divider log) in
  `schema.sql` — applied to both the live D1 database and local dev D1
  already, no migration needed to resume work.
- Everyone who joins locally shows up on the leaderboard immediately at
  0 points (`join.js`), not just once they score - it doubles as a join
  roster.
- Every local guess - right or wrong - is logged to `party_events` and
  rendered as a chat-style Activity feed, so a room full of people can
  see an answer's already been tried. This required making local
  guesses **server-authoritative**: `guess.js` now runs the match
  itself (`GameCore.matches` against the session's own `target_slug`)
  instead of trusting whatever the client already decided. The Twitch
  path is untouched and still client-decided (see `chatMatches()` in
  `party.js`) - deliberately out of scope so far.
- The host can join in and guess too via an inline "play too" prompt
  (not a blocking gate - the QR/code has to show up immediately). Both
  roles can rename afterwards via "change" next to the You label -
  `join.js` renames the existing `party_scores` row in place
  (`previousName` param) rather than forking a duplicate.
- Presence: `join.js` doubles as a ~12s heartbeat while a tab stays
  open (piggybacked on the existing 1.2s poll loop, not a second
  timer), so the leaderboard shows a live "in the party" dot + count
  per player. No explicit "left" event - a closed tab just stops
  heartbeating and ages out after `ONLINE_WINDOW_MS` (20s) - more
  robust than trying to catch every way a tab can disappear.
- Small emoji icon per player, picked at join/rename time.
- Desktop layout (>=860px): leaderboard + Activity feed become a
  sticky side column instead of stacking full-width under the round.

**Twitch is done and is now its own page** (2026-09-11): `streamer.html`
+ `streamer.js`, with `functions/api/twitch/{login,callback}.js` behind
a "Connect with Twitch" button. All four gaps from `TWITCH-REBUILD.md`
are closed - chat guesses are server-judged (`guess.js` runs
`GameCore.chatMatches` itself now), logged to `party_events` right or
wrong, carry an icon, and the connection status waits for IRC's `366`
instead of going green the moment `JOIN` is sent. The `.wip` panel and
the `#partyTwitch` field are gone from index.html, and `party.js` is
local/QR only.

**Not done yet / known gaps:**
- **Nobody has run this on an actual live stream yet.** Everything below
  the OAuth handshake was verified against the local dev server and real
  endpoints, and the chat reader is the same technique that was already
  working, but a real channel with real viewers guessing is the test
  that matters and hasn't happened.
- A session is now strictly one kind or the other - `twitch_channel`
  set means Twitch-only, null means phones-only - and `guess.js`
  rejects a guess whose `source` doesn't match. Any session created
  before 2026-09-11 that happened to have both is unaffected but can't
  be made again.
- The streamer's Twitch login is deliberately not remembered: a refresh
  before going live means clicking Connect again. Resuming an
  already-live session does work (localStorage `gma-streamer-host`), so
  this only costs a click in the one place it's cheap.
- The standalone Stream Mode feature (OBS Browser Source overlay,
  `stream.html`/`stream.js`/`functions/api/stream.js`, its own
  `stream_state` D1 table) was removed entirely 2026-09-09. Note the
  2026-09-11 page above is *not* that coming back: it's a page the
  streamer themselves looks at, not an overlay captured into OBS, and it
  has no separate state table. The `stream_state` table was only dropped
  from `schema.sql` (fresh-install source), not from the live D1
  database - worth a manual `DROP TABLE stream_state` there if it's not
  wanted kept around.
- **Before this can go live**: `TWITCH_CLIENT_ID` and
  `TWITCH_CLIENT_SECRET` exist in local `.dev.vars` only. Production
  needs `npx wrangler pages secret put TWITCH_CLIENT_SECRET` (and the ID
  set as a plain env var) on the Pages project, plus
  `https://guessmyanimal.com/api/twitch/callback` registered as a
  redirect URL on the Twitch app. Without them the Connect button
  returns `?twitcherror=config`.
- Rename silently no-ops into "join as new identity" if the target name
  is already taken by someone else in the same session (avoids a
  merge-two-people's-scores bug, but the user gets no message saying
  why). Fine for now, worth a one-line explanation if it comes up.
- Verified end-to-end with Playwright (host+2 players, wrong/right
  guesses, rename, presence aging out, desktop grid) - not manually
  played by an actual group of people yet. Worth re-running now that
  `party.js` has been trimmed of its Twitch half.

**2026-09-12 update — session timer, hint rebuild, nav/spacing system, sound:**
- **Server-authoritative round timer, stream mode only.** `party_sessions` gained
  two nullable columns, `round_started_at`/`round_ends_at` (ms epoch) - null for
  local/QR play, set by `create.js`/`next.js` only when `twitch_channel` is
  present. `roundSeconds(n) = clamp(90 - (n-1)*5, 45, 90)` in `game-core.js`.
  `session.js` returns `roundEndsAt` **and** `serverNow` so the client corrects for
  a wrong viewer clock rather than trusting its own `Date.now()`; hint reveal is
  derived the same way (`hintsFromElapsed`), so a manual hint press and the clock
  can only ever push `shown` forward, never backward. Expiry is lazy (no cron) -
  `guess.js` just refuses to score a correct-but-late guess, still logs it.
  **Before this is live on Twitch: the production D1 database still needs the
  two `ALTER TABLE party_sessions ADD COLUMN round_started_at/round_ends_at
  INTEGER;` statements run against it** (see `schema.sql`'s own note) - `local`
  D1 has them, production does not, and `create.js`/`next.js` will error without
  them.
- **Hints rebuilt as a tiered, deterministic pool** (`GameCore.hintsFor`,
  seeded from the animal's slug so party/stream tabs never disagree). Was a flat
  5-field list where hint #1 was the animal's class - `It's a mammal.` for 48% of
  the dataset, and the literal answer for Sea sponge/Tardigrade. `mystery.js`'s
  own fork of `hintsFor` is gone; Daily/Endless now call `GameCore.hintsFor` too.
- **Sound extracted to `sfx.js`**, loaded on all five pages (`menu.js` itself has
  no audio code) - previously only `index.html` had a working click sound at all.
  Fixed two real bugs in the move: `resume()` on a suspended `AudioContext` is now
  awaited before scheduling a tone, and the trigger moved from `click` to
  `pointerdown` so a same-tab navigation doesn't tear down the tone mid-play.
- **Nav/spacing tokens added** (`--nav-h`, `--page-top`, the `--z-*` scale) so
  page content clears the fixed nav by a shared rule instead of per-page magic
  numbers - fixes the animal page's search dropdown rendering under the nav
  (a `backdrop-filter`-created stacking trap, not a z-index fight) and the
  cramped/inconsistent top spacing on Party Mode and the streamer page. See
  `DESIGN.md`'s Stacking section.
- **Streamer pre-connect screen rebuilt** into an actual pitch (reassurance
  points, a 3-step how-it-works, a You/Chat breakdown) instead of one paragraph
  and a button. Platforms render from one array in `streamer.js` (`PLATFORMS`) -
  YouTube/Kick show as inert "Coming soon" cards with no backend at all; a real
  second platform is one array entry plus a `functions/api/<key>/{login,callback}.js`
  pair, not a redesign.

**Operational gotcha hit tonight, worth remembering**: `wrangler pages
dev` spawns a full process tree (`npx` → `wrangler.js` → `cli.js` →
`workerd.exe`). Killing only the `workerd.exe` leaves the parent chain
alive, which just respawns a fresh `workerd.exe` - looks like a
zombie/respawning process but is actually the supervisor doing its job.
To actually stop one: find the root `npx-cli.js` node.exe PID (`Get-
CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object
{ $_.CommandLine -like '*wrangler pages dev*' }` in PowerShell) and
`taskkill //PID <root> //T //F` (bash) to kill the whole tree at once.

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
