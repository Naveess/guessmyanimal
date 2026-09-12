# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary user is someone playing the classic verbal guessing game (one
person thinks of an animal, everyone else asks yes/no questions to work out
what it is) — either the picker, who has to answer questions about an animal
honestly and often doesn't know the answer, or another player trying to
settle a dispute afterwards. The typical situation is casual and social: a
car journey, a pub table, a kids' game night, phone in hand, needing an
answer in seconds without breaking the flow of the game.

## Product Purpose

Guess My Animal exists to stop the game from grinding to a halt. Someone
picks an obscure animal, gets asked "is it nocturnal?", and has no idea —
so everyone reaches for their phones and starts reading different Wikipedia
articles and arguing. This site fixes that: type the animal, get the answers
to the specific questions this game actually produces, on one screen, in
about four seconds. Success is measured by how fast and how confidently a
player can answer a question mid-game.

## Positioning

General reference sites (Wikipedia, animal-fact databases) answer
encyclopedic questions but not game questions — no source has a field for
"would people eat this," "could you keep one as a pet," or "does it have
more than four legs." Guess My Animal's mechanism is a hand-curated set of
game-relevant judgment calls (Quick answers / At a glance) layered on top of
live Wikipedia photos and summaries, covering land, sea, and bird species
broadly (438 animals) rather than a narrow curated list. It is deliberately
**not** a solver — nothing guesses the animal for the user, because that
would remove the only good part of the game. The site does now ship games of
its own (see Modes below), but they are games to *play*, not machines that
play the guessing game on the user's behalf; the rule is unchanged.

## Modes

The site began as lookup only. Two games now ship alongside it, and the
lookup remains the default and the reason people arrive.

- **Lookup** — the original and still the core: search an animal, get Quick
  answers and At a glance.
- **Mystery Animal** — a solo round against a blurred photo that sharpens as
  hints are spent. Built on the same dataset, no extra content needed.
- **Party Mode** *(beta)* — one host on a big screen, everyone else joining
  from their own phone by QR code or a five-character room code. Phones
  only; a room is either this or a stream, never both.
- **Twitch stream mode** *(beta)* — its own page (`streamer.html`), for one
  streamer whose whole chat plays along. The streamer connects their Twitch
  account so the channel fills itself in, and chat guesses by typing the
  animal. Built as a separate surface rather than Party Mode with a Twitch
  field, because an anonymous chat of hundreds has no presence to show, no
  names anyone can fix, and no "which one is me".

## Operating Context

- Played casually and socially, most often on mobile, often in a moving car
  or somewhere without reliable focus time — the lookup has to be fast and
  need no setup.
- No accounts anywhere, and one narrowly-scoped login. Lookup and Mystery
  Animal keep nothing beyond local light/dark and sound preferences. Party
  Mode is the one server-side exception: a room's code, chosen display names,
  emoji, scores and guess log live in D1 for the life of the session, because
  several devices have to see the same room. Still no account, no email, no
  identity that outlives the party.
- The single login on the site is **Twitch stream mode's optional "Connect
  with Twitch"**, and it is the streamer's alone — never a viewer's. It asks
  Twitch for no permissions at all, is used once to read back which channel
  is theirs, and the access token is discarded in the same request that
  fetched it: nothing is stored, and there is no account to come back to.
  The only cookie involved is a short-lived (5 minute), httpOnly one holding
  a random anti-forgery value during the handshake, cleared the moment it's
  checked. People guessing in chat authenticate nothing and are as anonymous
  as they have always been.
- Search-driven: a player types an animal name (including plurals, informal
  names, and common breed names like "husky" or "siamese") and expects a
  single confident result.
- Sharing happens mid-conversation (e.g. "look, here's the answer") via
  native share sheets or direct links to a specific animal.

## Capabilities and Constraints

- **Dataset**: 438 animals covering mammals, birds, fish, reptiles,
  amphibians, and invertebrates, each with a fixed schema of hand-written
  gameplay-relevant fields (habitat, diet, danger, domesticability, edibility,
  conservation status, size, group name, sound, lifespan, etc.), plus alias
  matching for breeds and informal names.
- **Content sourcing**: photos and one-line summaries come live from the
  Wikipedia REST API at lookup time (no local image hosting). The
  gameplay-relevant fields are hand-written judgment calls, not sourced from
  any database, because no reference source tracks them; some are genuinely
  ambiguous and phrased as "can be" / "sometimes" rather than asserted as
  fact. a-z-animals.com was used only as a name/coverage checklist during
  dataset-building — its photos are licensed stock and must never be used.
- **Feedback loop**: a public, unauthenticated "report a problem" pipeline
  (wrong photo, wrong fact, missing animal) backed by Cloudflare D1. Stores
  no IP address, cookie, or user agent — only the report content.
- **Privacy**: the site tracks no users and sets no cookies of its own, with
  one exception that proves the shape of the rule — the 5-minute httpOnly
  anti-forgery cookie during a streamer's Twitch sign-in, which holds a
  random value, identifies nobody, and is cleared on use. This is a stated
  commitment in the About page's small print, not just a current
  implementation detail.
- **Monetization**: AdSense Auto ads are live, behind a Funding Choices
  consent message, to cover hosting costs. Design and layout work must keep
  ads from interfering with the answers — the About page commits to that
  priority in writing, and `.adslot` reserves its height whether or not a
  unit fills it so nothing shifts on load.
- **Hosting**: static site plus Cloudflare Pages Functions, deployed to
  Cloudflare Pages (production branch `main`), with a Cloudflare D1 database
  for reports and party sessions.

## Brand Commitments

- Name: **Guess My Animal**.
- Mark: a drawn paw print (five overlapping ellipses), used as the home
  splash mark and the corner menu's back-link icon.
- Tone, as established in the About page copy: plain-spoken, a little wry,
  honest about the site's limits (it says outright that some judgment calls
  are arguable and may be wrong, and that it is an early, ongoing project).

## Evidence on Hand

- Live production site with the full 438-animal dataset, a working report
  pipeline (tested end-to-end, including a real submitted-then-deleted test
  report), and a published About page explaining the game, the site's
  purpose, and its sourcing honestly.
- No testimonials, press, case studies, or usage metrics exist yet and
  should not be fabricated.

## Product Principles

- Speed over completeness: a confident answer in seconds beats a thorough
  one that takes longer to find.
- Honest about uncertainty: where a fact is genuinely ambiguous, say so
  ("can be," "sometimes," "in places") rather than asserting false
  precision.
- Never solve the game for the player: the product answers factual
  questions, but must never guess or suggest the animal itself. Shipping
  games of its own doesn't change this — a game the user plays is not a
  machine that plays for them.
- Privacy by default: no accounts, no tracking, no PII in the feedback
  pipeline — this is a standing constraint, not a placeholder. A party
  session's display names are user-chosen and session-scoped, which is the
  most identity the site is ever allowed to hold. A streamer's Twitch sign-in
  is the one authenticated act on the site and is held to the same line: no
  permissions requested, nothing stored, no account created, and no viewer
  ever asked to sign in to anything. If a future feature needs a token kept
  or an identity remembered, that is a change to this principle and has to
  be argued as one, not slipped in as an extension of this.
- Broad, real coverage over a curated highlight reel: the dataset aims at
  "any animal someone might plausibly pick," not just crowd-pleasers.
