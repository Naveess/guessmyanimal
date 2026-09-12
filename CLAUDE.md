# CLAUDE.md

Guidance for future Claude Code sessions working in this repo. Keep this
file accurate and short — it's an orientation map, not a copy of the
real docs. When architecture changes, update this file in the same
change.

## Project purpose

Guess My Animal ([guessmyanimal.com](https://guessmyanimal.com)) is a
reference site for the classic verbal animal-guessing game: type an
animal, get the specific yes/no facts that game produces (nocturnal?
dangerous? kept as a pet?) in seconds. It is deliberately **not a
solver** — it must never guess the animal for the player. Three play
modes ship alongside the core lookup: Mystery Animal (solo), Party Mode
(local/QR multiplayer, beta), and Twitch stream mode (a streamer's whole
chat plays, beta). Full product reasoning lives in `PRODUCT.md` — read
it before changing scope, tone, or what the site is "for."

## Architecture

Vanilla JS, no framework, no bundler, no build step for the app itself —
every file is served as written. Cloudflare Pages hosts the static site;
Cloudflare Pages Functions (`functions/`) provide the small bits a
static file can't (reports, party/stream sessions, Twitch OAuth);
Cloudflare D1 backs the Functions. One vendored runtime dependency
(`vendor/qrcode.js`, MIT). `package.json` has no dependencies — only
script shortcuts.

Four HTML entry points: `index.html` (the SPA: lookup + Mystery Animal +
Party Mode, swapped by `hidden` attributes, not routed) and three
standalone pages — `about.html`, `browse.html`, `privacy.html`,
`streamer.html` (Twitch stream mode — its own page, not a view inside
`index.html`, because a chat of hundreds needs none of Party Mode's
presence/rename machinery).

## Important directories/files

| Path | What it is |
|---|---|
| `animals.js` | The dataset — 438 hand-written animals, fixed schema. Field meanings documented at the top of the file. |
| `game-core.js` | Shared logic with **no DOM, no state** — loaded as a browser global (`GameCore`) and via `import`/`require` from Node/Pages Functions. Answer matching, `hintsFor`, round timer math, the chat-guess matcher. If a surface needs matching/hinting/timing logic, it goes here, not duplicated per-page. |
| `app.js` / `mystery.js` / `party.js` | Views inside `index.html`. `app.js` owns search/routing/theme and exposes `window.GMA` (push/goHome/setMenu/loadSummary/openReport/sfx) for the other two to call into. |
| `streamer.js` / `streamer.html` | Twitch stream mode, standalone — does not load `app.js`, has no `window.GMA`. |
| `sfx.js` | The sound engine (synthesised tones, not samples) plus the one delegated `pointerdown` tap-sound listener. Loaded by every page. |
| `menu.js` | Nav/theme/sound-toggle wiring for the four standalone pages only (`index.html` has its own nav logic in `app.js`). |
| `functions/api/party/*.js` | Party + Twitch session backend — create/session/hint/next/guess/join, sharing `_lib.js`. |
| `functions/api/twitch/*.js` | The Twitch OAuth handshake only (`_lib.js`, `login.js`, `callback.js`). Unrelated to reading chat. |
| `schema.sql` | Fresh-install D1 schema (`CREATE TABLE IF NOT EXISTS`). Also the living record of every manual migration — see Database below. |
| `tools/*.js` | Node build scripts (`npm run og` / `npm run seo`) — not part of the served site. |
| `README.md` / `PRODUCT.md` / `DESIGN.md` / `TODO.md` / `TWITCH-REBUILD.md` | The real docs. Read before touching their areas; don't duplicate them here. |

## Development / run commands

```
npx wrangler pages dev . --port=8788
```
Run **without** `--d1=DB` — that flag makes wrangler invent a throwaway
local database instead of the one `wrangler.toml` declares, and every
party/stream endpoint 500s. First time, apply the schema locally:
```
npx wrangler d1 execute DB --local --file=schema.sql
```
(`DB` — the Worker **binding** name from `wrangler.toml` — works for
`--local`. It does **not** work for `--remote`; see Database below.)

Twitch login locally needs `.dev.vars` (gitignored) with
`TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` — see README's "Twitch
login" section. Without them the Connect button just bounces to
`?twitcherror=config`; nothing else breaks.

`npm run og` — regenerate the link-preview card.
`npm run seo` — rebuild `functions/seo-meta.json` + `sitemap.xml` +
`browse.html` from `animals.js`. Run after adding an animal.
`npm run deploy` — publish straight from the working tree, bypassing
git (useful when the Pages Git integration is misbehaving).

On Windows, `wrangler pages dev` spawns a process tree
(`npx`→`wrangler.js`→`cli.js`→`workerd.exe`). Killing only `workerd.exe`
just gets it respawned by its still-alive parent. To actually stop it,
find the root `npx-cli.js` node process and kill the whole tree:
```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*wrangler pages dev*' }
```
then `taskkill //PID <root> //T //F`.

## Testing / lint / build

**There is no test suite, linter, or build step.** `package.json` has
no dependencies and no `test`/`lint`/`build` scripts. Treat these as the
real validation tools for this repo, in order of usefulness:
1. `node --check <file>` on every changed `.js` file (catches syntax
   errors in both browser globals and the ESM-syntax Functions files).
2. A live smoke test against `wrangler pages dev` + local D1 — create a
   session, guess right/wrong, reveal a hint, advance a round, hit the
   Twitch OAuth endpoints. This is the closest thing to an integration
   test this project has; prefer it over reasoning from the diff alone
   for anything touching `functions/api/`.
3. Manual check in an actual browser for anything CSS/layout/animation —
   there is no visual regression tooling.

Don't invent a test framework, linter config, or CI pipeline unless
explicitly asked — that would be a scope decision for the project owner,
not a cleanup task.

## Key Twitch/session architecture

Trace: **Connect button → `/api/twitch/login`** (redirects to Twitch,
sets a 5-minute httpOnly anti-forgery cookie) **→ Twitch consent →
`/api/twitch/callback`** (verifies the cookie's state, exchanges the
code for a token server-side, calls Get Users once, discards the token
immediately, redirects to `streamer.html?tw_login=<channel>`) **→
`streamer.js`** reads `tw_login`, shows the "Go live" category picker
**→ `/api/party/create`** with `twitchChannel` set **→ gameplay.**

Critical facts:
- **The OAuth login is not chat access.** Chat is always read anonymously
  over Twitch IRC (`justinfan<N>` nick, no token) directly in the
  streamer's own browser tab (`streamer.js`) — Cloudflare Pages
  Functions can't hold a persistent connection, so the tab *is* the
  reader. Closing it stops chat play; that's the hosting model, not a
  bug.
- **Nothing from the OAuth handshake is ever stored** — not in D1, not
  in a cookie, not in localStorage. Only a plain channel-login string
  survives, and only in the `tw_login` redirect param.
- **A session is local/QR-only or Twitch-only, never both**
  (`party_sessions.twitch_channel` decides). `guess.js` rejects a guess
  whose `source` doesn't match the session kind.
- Chat guesses are **server-judged**, not client-trusted: `streamer.js`'s
  `chatMatches()`/`looksLikeAGuess()` are a volume filter only (don't
  POST every line of chat to D1); `guess.js` re-runs the real check.

## Important game logic (`game-core.js`)

- **`matches()`** — typo-tolerant matching for a solo guess box.
  **`chatMatches()`** — `matches()` plus an exact (never fuzzy) scan for
  the animal's name as a complete word run inside a longer sentence
  ("is it a leopard?"). Deliberately exact, not fuzzy, inside a
  sentence — the pool has animals named Swift, Crane, Seal, Ray, and
  fuzzy-matching those against ordinary chat would end rounds nobody was
  guessing in. **Do not loosen this.**
- **`hintsFor(animal, skipCategory)`** — seeded (slug-seeded
  `mulberry32`), tiered pick (broad → specific → the fact), not a fixed
  field order. Deterministic so two tabs building the same round's hint
  list independently (party/stream host vs. the server) never disagree.
  `skipCategory` drops the class hint entirely when a single-category
  filter already told the player the class.
- **`roundSeconds(roundNo)`** / **`hintsFromElapsed(elapsed, duration)`**
  — Twitch-only server-authoritative round timer. `roundSeconds` clamps
  45–90s, tightening as the stream goes on. `hintsFromElapsed` derives
  how many hints *should* be visible from elapsed time alone; callers
  take `max(this, whatever's stored)` so a manual hint press can pull
  ahead of the clock but the clock can never regress a manual reveal.
  Local/QR play has no deadline — both are no-ops there
  (`round_started_at`/`round_ends_at` stay null).
- **`pointsForHints(hintsShown)`** — 100 down a step of 20 per hint, floor
  10 (never reached in practice; 5 hints lands on 20).
- Every guess, right or wrong, is **server-decided and logged** to
  `party_events` — the activity/chat feed depends on the server knowing
  wrong guesses happened, not just right ones.

## Design conventions

Full system in `DESIGN.md` — read the Named Rules before touching CSS.
The ones most likely to matter to a change:
- **One-Yellow Rule**: at most one solid-Sun (`--sun`) element per
  non-splash screen. Everything else uses a tint
  (`color-mix(in srgb, var(--sun) 14%, transparent)`).
- **Border-Or-Shadow Rule**: a surface gets a `--line` border (flush in
  flow) *or* `--shadow-l` (floating), never both.
- **Fixed-Sun Rule**: `--sun`/`--on-sun` never change between themes;
  every other colour token is redefined in *both* the
  `prefers-color-scheme` block and the `[data-theme="dark"]` block, or
  the toggle and system-default drift apart.
- One shared z-index scale (`--z-sticky` 20 → `--z-chrome` 60) — new
  overlapping chrome should use these tokens, not an ad-hoc number. If
  two elements collide at the same z-index band, that's almost always a
  layout/stacking-context problem (e.g. two independently-centred fixed
  elements occupying the same rectangle) — fix the position, don't just
  raise the z-index.
- **Cache-busting discipline**: `style.css`, and every shared `.js`
  (`game-core.js`, `sfx.js`, `app.js`, `party.js`, `mystery.js`,
  `menu.js`) are loaded with a hand-bumped `?v=`. Changing one of these
  files means bumping its `?v=` in **every HTML file that loads it**,
  plus `sw.js`'s `VERSION` and the matching `SHELL` entry if it's
  precached — otherwise returning visitors keep the stale cached copy
  indefinitely. `sw.js` only precaches what `index.html` loads; the
  standalone pages (about/browse/privacy/streamer) and anything only
  they load (`menu.js`, `streamer.js`) are deliberately not precached.

## Database / D1 setup and migration conventions

**There is no migrations framework** (no `migrations/` dir, no wrangler
D1 migrations config). The convention is:
1. `schema.sql` holds `CREATE TABLE IF NOT EXISTS` statements — the
   fresh-install shape only.
2. A column added later gets a one-line comment in `schema.sql`
   documenting the exact `ALTER TABLE` that was (or needs to be) run by
   hand against local and production D1 — e.g. `party_scores.icon`,
   `party_sessions.round_started_at`/`round_ends_at`. `schema.sql`'s
   `CREATE TABLE` block is **not** kept in sync with these after the
   fact for existing deployments; it's a record for anyone re-running a
   fresh install.
3. Apply locally: `npx wrangler d1 execute DB --local --file=schema.sql`
   (or `--command` for a single `ALTER TABLE`).
4. Apply to production: **`npx wrangler d1 execute <database> --remote
   --command "..."`.**

**Gotcha that will waste your time**: the `<database>` argument to
`wrangler d1 execute` must be the actual D1 **database name** (or UUID)
— the one `npx wrangler d1 list` shows (`guessmyanimal`,
`20fafa53-448d-4406-aa71-1364cedd3de6`) — **not** the Worker/Pages
*binding* name (`DB` from `wrangler.toml`'s `[[d1_databases]] binding =
"DB"`). `DB` happens to work for `--local` (wrangler just needs some
string to key a local sqlite file, and cross-references `wrangler.toml`
for display) but fails for `--remote` with a misleading "Authentication
error [code: 10000]" — the literal string `DB` ends up in the Cloudflare
API request path and doesn't resolve to anything, which is not actually
an auth problem. Always use `guessmyanimal` (or the UUID) for `--remote`.

**Never run a `--remote` D1 command — schema change or otherwise —
without the project owner's explicit go-ahead in that moment.** Read
queries are fine for diagnosis; anything that writes or alters
production schema/data is a human decision, every time.

## Constraints future agents should not break

- **Never make the site solve the game.** No feature may guess the
  animal for the player, even indirectly.
- **No accounts, no tracking beyond the documented exceptions**
  (session-scoped party display names; the streamer's one-time,
  nothing-stored Twitch OAuth). Don't add persistence that outlives a
  session or a device without raising it as a product-principle change
  first — see `PRODUCT.md`'s Product Principles.
- **Server-authoritative guessing.** Local/QR and Twitch guesses are
  both judged by `guess.js`, never trusted from the client. Don't
  reintroduce client-side win/lose decisions for either path.
- **A session is one mode or the other.** Don't let `twitch_channel`
  and local/QR play coexist in the same `party_sessions` row again —
  that was deliberately un-done (see `TWITCH-REBUILD.md`).
- **`chatMatches()` stays exact-inside-a-sentence, never fuzzy.** This
  was a considered call; "improving" it to plain fuzzy matching
  reintroduces a worse failure mode (ending a round nobody was
  guessing in).
- **Keep the cache-busting ritual.** A shell-file edit with no `?v=`
  bump (and no matching `sw.js` update if the file is precached) ships
  a silent stale-cache bug to returning visitors.
- **`streamer.js` has no `window.GMA`.** It's a standalone page loading
  `sfx.js` directly — call `window.GMA_SFX.sfx(name)`, not `GMA.sfx(name)`
  (that pattern is only valid inside `index.html`'s views).
- **Don't add a migrations framework or test/lint tooling unproductively.**
  If one is genuinely needed, raise it as a decision — it's not implied
  by "cleanup" or "fix a bug."
