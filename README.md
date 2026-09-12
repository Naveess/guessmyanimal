# Guess My Animal

A cheat sheet for the guessing game. Type an animal, get the answers you'd
otherwise stop and google: carnivore, nocturnal, dangerous, hibernates, kept as
a pet, eaten, fur or feathers, how many legs.

Built to be read on a phone, mid-argument, in about four seconds.

Live at [guessmyanimal.com](https://guessmyanimal.com).

## What's in it

Three ways to use the site, all on one page:

- **Lookup** — the default. Search an animal, get Quick answers and At a glance.
- **Mystery Animal** — a solo round. A blurred photo sharpens as hints are spent.
- **Party Mode** *(beta)* — one host, everyone else on their own phone via a QR
  code or a five-character room code.

**Twitch stream mode** *(beta)* is its own page, `streamer.html` — one streamer,
their whole chat guessing. A session is either this or a phone party, never both.

## How it works

Vanilla JS, no framework, no bundler — files are served as written. There is a
small build step for generated artifacts, a Cloudflare Pages Functions backend
for the things a static file can't do, and one vendored runtime dependency.

- `animals.js` — the answers, hand-written, 438 of them. Wikipedia and Wikidata
  will give you a photo and a taxon but will not reliably tell you whether
  something is dangerous or nocturnal, so those are judgement calls written out
  by hand. It also means answers are instant, with nothing to wait for.
- `app.js` — search, routing, the animal view, theme. `render-data.js` and
  `related.js` render the fact sections; `menu.js` runs the nav on the static
  pages.
- `mystery.js` / `party.js` / `streamer.js` — the three game surfaces.
  `game-core.js` holds what they share: answer matching (including the
  sentence-scanning chat matcher the server uses too), and the real-thumbnail
  pixelation they all use to blur a photo without shipping the sharp one to the
  browser.
- `streamer.html` / `streamer.js` — Twitch stream mode. Reads the channel's chat
  straight from this tab over anonymous IRC-over-WebSocket, because Pages
  Functions can't hold a persistent connection. Closing the tab stops chat play;
  that's the hosting model, not a bug.
- `functions/` — Pages Functions. `api/report.js` takes problem reports;
  `api/party/*.js` runs party and stream sessions alike; `api/twitch/*.js` is
  the streamer's OAuth handshake and nothing else. All sit on a Cloudflare D1
  database whose schema is `schema.sql`. `index.js` injects per-animal SEO meta
  from the generated `seo-meta.json`.
- `vendor/qrcode.js` — the only runtime dependency, used for Party Mode's join
  code.
- `sw.js` — caches the app shell, so every animal stays available offline, not
  just ones visited before. Only the live Wikipedia photo and blurb need a
  connection.
- `?a=octopus` deep links straight to an animal; `?party=ABCDE` joins a room.

### Cache busting

`style.css`, `app.js`, `party.js` and the rest of the shell are loaded with a
hand-bumped `?v=` query string. **Change one of those files and you must bump
its `?v=` in every HTML file that loads it, plus `VERSION` and the matching
`SHELL` entry in `sw.js`** — otherwise returning visitors keep the stale copy
indefinitely.

## Twitch login

Twitch stream mode's "Connect with Twitch" needs an app registered at
[dev.twitch.tv](https://dev.twitch.tv/console/apps) with both redirect URLs:
`https://guessmyanimal.com/api/twitch/callback` and, for local work,
`http://localhost:8788/api/twitch/callback` — Twitch requires HTTPS for every
redirect URL *except* the literal hostname `localhost`, so `127.0.0.1` is
rejected.

Two variables, `TWITCH_CLIENT_ID` (not secret — it ends up in a redirect URL
the browser can see) and `TWITCH_CLIENT_SECRET` (a real Pages secret, set with
`npx wrangler pages secret put TWITCH_CLIENT_SECRET`). Locally both live in a
gitignored `.dev.vars` at the repo root, which `wrangler pages dev` reads on its
own. Without them the Connect button bounces back to `?twitcherror=config`.

The login only ever answers "which channel is this streamer's". Chat itself is
read anonymously and needs no token, so nothing about reading chat depends on
any of this.

## Adding an animal

One line in `animals.js`. The keys are documented at the top of that file.
`w` is the Wikipedia page title and defaults to the name; set it when they
differ (`Cougar` vs `Puma`). `a` is a list of other names people might type.

Run `npm run seo` afterwards so the new animal gets its meta tags.

## Ads

`.adslot` in `index.html` reserves its height whether or not anything fills it,
so dropping a unit in later cannot shove the page around on load. AdSense Auto
ads are live, behind a Funding Choices consent message.

## Commands

    npm run og        regenerate the link-preview card
    npm run seo       rebuild functions/seo-meta.json from animals.js
    npm run deploy    publish to Cloudflare Pages

Local dev is `npx wrangler pages dev . --port=8788`. Run it **without** a
`--d1=DB` flag: that flag makes wrangler invent a throwaway database ("local-DB")
instead of using the one `wrangler.toml` declares, so every party/stream endpoint
500s against tables that exist in the other file. Apply the schema to the local
database once with `npx wrangler d1 execute DB --local --file=schema.sql`.

`main` is the production branch and deploys automatically on push. `npm run
deploy` publishes straight from the working tree, bypassing git — useful if the
Pages Git integration is playing up, which it has.

## Docs

- `PRODUCT.md` — who this is for and what it refuses to do.
- `DESIGN.md` — the design system. Read the Named Rules before touching CSS.
- `TODO.md` — what's unfinished, and why.
- `TWITCH-REBUILD.md` — brief for the Twitch chat rebuild.
