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
broadly (435 animals) rather than a narrow curated list. It is deliberately
**not** a solver — nothing guesses the animal for the user, and there is no
mode that plays the game for you, because that would remove the only good
part of the game.

## Operating Context

- Played casually and socially, most often on mobile, often in a moving car
  or somewhere without reliable focus time — the lookup has to be fast and
  need no setup.
- No accounts, no login, no persistent per-user state beyond a local
  light/dark theme preference.
- Search-driven: a player types an animal name (including plurals, informal
  names, and common breed names like "husky" or "siamese") and expects a
  single confident result.
- Sharing happens mid-conversation (e.g. "look, here's the answer") via
  native share sheets or direct links to a specific animal.

## Capabilities and Constraints

- **Dataset**: 435 animals covering mammals, birds, fish, reptiles,
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
- **Privacy**: the site sets no cookies and tracks no users. This is a
  stated commitment in the About page's small print, not just a current
  implementation detail.
- **Monetization**: ads are a confirmed future plan to cover hosting costs,
  not yet implemented. Future design and layout work should stay compatible
  with inserting an ad slot without letting it interfere with the answers —
  the About page already commits to that priority in writing.
- **Hosting**: static site plus Cloudflare Pages Functions, deployed to
  Cloudflare Pages (production branch `main`), with a Cloudflare D1 database
  for reports.

## Brand Commitments

- Name: **Guess My Animal**.
- Mark: a drawn paw print (five overlapping ellipses), used as the home
  splash mark and the corner menu's back-link icon.
- Tone, as established in the About page copy: plain-spoken, a little wry,
  honest about the site's limits (it says outright that some judgment calls
  are arguable and may be wrong, and that it is an early, ongoing project).

## Evidence on Hand

- Live production site with the full 435-animal dataset, a working report
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
  questions, but must never guess or suggest the animal itself.
- Privacy by default: no accounts, no cookies, no tracking, no PII in the
  feedback pipeline — this is a standing constraint, not a placeholder.
- Broad, real coverage over a curated highlight reel: the dataset aims at
  "any animal someone might plausibly pick," not just crowd-pleasers.
