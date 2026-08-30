# Guess My Animal

A cheat sheet for the guessing game. Type an animal, get the answers you'd
otherwise stop and google: carnivore, nocturnal, dangerous, hibernates, kept as
a pet, eaten, fur or feathers, how many legs.

Built to be read on a phone, mid-argument, in about four seconds.

## How it works

Static site. No build step, no backend, no dependencies at runtime.

- `animals.js` — the answers, hand-written. Wikipedia and Wikidata will give you
  a photo and a taxon but will not reliably tell you whether something is
  dangerous or nocturnal, so those are judgement calls written out by hand. It
  also means answers are instant, with nothing to wait for.
- Photos and the one-line summary come from the Wikipedia REST API at runtime.
  Free, no key, CORS-open.
- `?a=octopus` deep links straight to an animal.

## Adding an animal

One line in `animals.js`. The keys are documented at the top of that file.
`w` is the Wikipedia page title and defaults to the name; set it when they
differ (`Cougar` vs `Puma`). `a` is a list of other names people might type.

## Ads

`.adslot` in `index.html` reserves its height whether or not anything fills it,
so dropping a unit in later cannot shove the page around on load.

## Commands

    npm run og        regenerate the link-preview card
    npm run deploy    publish to Cloudflare Pages
