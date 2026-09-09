# To-do

Backlog features from the growth-plan review, not yet started. Carried
over as concrete follow-up work rather than left as ideas in a report.

## Party mode (Twitch chat + local/QR play)

**Local/QR play is built and working**, on branch `party-mode-page`
(pushed to origin, not yet merged to `main` — the live site is
unaffected until that merge happens). Twitch chat mode is also built
(anonymous IRC overlay in the host's own tab, see `party.js`) but has
had no polish pass since the original build — see "Not done yet"
below.

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

**Not done yet / known gaps:**
- **Twitch mode is the next piece of work** - see `TWITCH-REBUILD.md`
  for the full brief. It's still the original build: no presence, no
  feed, no rename, and guesses are client-trusted rather than
  server-authoritative the way local play now is. Direction confirmed
  2026-09-09: it becomes a **genuinely separate streamer surface**, not
  local play with the same patterns extended onto it (Navee: "the
  streamer element should branch off... I want it to work differently").
  Don't reuse `.party-score`/presence/rename wholesale - one host plus
  hundreds of chat viewers is a different problem from six people in a
  room, and per-viewer presence dots make no sense there.
- Since it's reachable on the live site and works well enough to look
  ready, the Twitch field now sits inside an on-screen "under
  construction" panel (`.wip`, see DESIGN.md) telling streamers not to
  run it live. The input is deliberately **left enabled** - it has to
  stay testable during the rebuild. Take the panel down when the rebuild
  ships, not before.
- The standalone Stream Mode feature (OBS Browser Source overlay,
  `stream.html`/`stream.js`/`functions/api/stream.js`, its own
  `stream_state` D1 table) was removed entirely 2026-09-09 - Navee is
  consolidating the streaming angle into Party Mode's Twitch-chat path
  above instead of maintaining two separate surfaces. The
  `stream_state` table itself was only dropped from `schema.sql`
  (fresh-install source), not from the live D1 database - worth a
  manual `DROP TABLE stream_state` there if it's not wanted kept around.
- Rename silently no-ops into "join as new identity" if the target name
  is already taken by someone else in the same session (avoids a
  merge-two-people's-scores bug, but the user gets no message saying
  why). Fine for now, worth a one-line explanation if it comes up.
- `party-mode-page` branch not yet merged to `main` - that's a decision
  to make once this has had real playtesting, not a leftover task.
- Verified end-to-end with Playwright (host+2 players, wrong/right
  guesses, rename, presence aging out, desktop grid) - not manually
  played by an actual group of people yet.

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
