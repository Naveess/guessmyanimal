---
target: "individual animal page (index.html #animalview, app.js, render-data.js)"
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\Nav\\Documents\\guessmyanimal\\individual animal page (index.html animal view, app.js, render-data.js)"
timestamp: 2026-09-16T11-57-56Z
slug: ex-html-animal-view-app-js-render-data-js-7742b4d5
---
Method: dual-agent (A: a9ef5ad170123137c · B: a728e890697afb43f)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Loading pulse + honest "No photo on file" are strong for sighted users, but the whole fallback block is `aria-hidden`. |
| 2 | Match Between System & Real World | 4/4 | Pills state answers in plain words first ("Can be," "In places," "Sometimes"), never jargon or false precision. |
| 3 | User Control and Freedom | 3/4 | Back button, docked search, "Another animal," Wikipedia link all work; no way to correct a spotted error in-context. |
| 4 | Consistency and Standards | 4/4 | `.pcard`/`.btn`/`.pill` and the icon vocabulary reused verbatim across every game mode. |
| 5 | Error Prevention | 3/4 | Honeypot + min-length on reports, graceful `onerror` photo fallback — but a mismatched photo has no preventive or flagging mechanism at all. |
| 6 | Recognition Rather Than Recall | 3/4 | Related-animal chips and word-first pills help sighted users; no equivalent aid for screen-reader users. |
| 7 | Flexibility and Efficiency of Use | 3/4 | Alias-tolerant search, dice/random, deep-linkable URLs serve power users; nothing offers a denser view for repeat lookups. |
| 8 | Aesthetic and Minimalist Design | 3/4 | The Quick-answers/At-a-glance split is genuinely restrained, but the full scroll runs long for a "field guide, not encyclopedia" page. |
| 9 | Error Recovery | 2/4 | The one error mode PRODUCT.md explicitly names — a wrong photo — has no passive signal, and its fix path sits five sections down. |
| 10 | Help and Documentation | 3/4 | Wikipedia link and About page cover sourcing, but nothing on-page contextualizes it at the point of doubt. |
| **Total** | | **31/40** | **Good** |

No heuristic scored n/a — this page has live async state (photo fetch) and a real user action (report), so all 10 are meaningfully assessable.

## Design Specificity Verdict

**LLM assessment:** The Photo Card genuinely earns "signature component" status — it matches DESIGN.md point for point (blurred/darkened backdrop, gradient scrim, the single `deal` animation) and isn't a generic hero-image template. More importantly, `app.js`'s `show()` renders Quick answers and At a glance from local data before either Wikipedia request resolves — the four-second promise never actually depends on network latency, only the decorative photo does. The one place the signature moment underdelivers: PRODUCT.md names mismatched Wikipedia photos as a known risk, and the site's whole amber "honest middle" language exists specifically to mark this kind of uncertainty — but the photo is the one place that honesty doesn't reach. The card is authored; its honesty layer isn't.

**Deterministic scan:** `impeccable detect --json index.html app.js render-data.js` (exit 0) returned 14 advisory `gpt-thin-border-wide-shadow` findings. Assessment B traced every single one to Mystery Animal / Party Mode / Streamer-scoped selectors — zero trace to `.pcard`/`#animalview`/`.pill`/`.glance*`. The animal page correctly never reaches for the Cabinet treatment's border+glow combo. One recurring config note (seen in a prior critique too): the project's `ignoreValues` approvals for this pattern are filed under a rule id (`dark-glow`) different from the one that actually fires (`gpt-thin-border-wide-shadow`) — a documentation gap worth closing generally, not specific to this page.

**Visual overlays:** Not available this session — no browser automation tool is exposed here.

## Overall Impression

This is the best-executed surface reviewed so far — the signature visual moment is real, and the core promise (fast, network-independent facts) is structurally guaranteed, not just claimed. The gap is specific and fixable: the one failure mode the product openly admits to (a wrong photo) gets no visual honesty treatment and its correction path is buried at the bottom of a long page, exactly backwards for someone trying to resolve it fast.

## What's Working

1. **`app.js`'s `show()` decouples the answer from the network** — Quick answers/At a glance/fact populate synchronously from the local dataset before `loadSummary`/`loadMedia` return, so the four-second promise never depends on Wikipedia's latency.
2. **`render-data.js`'s amber "Can be"/"Sometimes"/"In places" treatment** is a real, structurally-encoded execution of "honest about uncertainty" — not just asserted in PRODUCT.md's prose.
3. **The Photo Card's loading→arrival sequence never leaves a broken-image state** — transparent placeholder → pulsing emoji → real photo or an honest "No photo on file" caption, matching DESIGN.md's spec exactly.

## Priority Issues

**[P1] The report trigger is contextually orphaned from the thing it corrects** — `index.html`'s own code comment claims the report button is "contextual: a wrong photo is noticed here, not in a menu," but it actually sits in `.actions`, after Quick answers, At a glance, Did you know, Related, and the Play CTA band. The person who just saw a wrong photo has to scroll past five unrelated sections to act on it.
- **Fix:** add a quiet secondary trigger near the photo card itself, wired to open the report flow pre-filled for a photo issue.
- **Suggested command:** `/impeccable clarify` or `/impeccable layout`

**[P1] No visual signal distinguishes a possibly-wrong photo from a confident one** — the photo always renders with full visual authority; nothing analogous to the amber pill treatment exists for photo confidence, despite PRODUCT.md naming mismatched photos as a known risk.
- **Fix:** a small Meta-styled "Photo via Wikipedia" caption under the photo that both credits the source and primes the reader that it's automated, not curated.
- **Suggested command:** `/impeccable clarify`

**[P2] Screen-reader structure breaks down on the core surface** — once the home screen hides, the animal name is an `<h2>` with no preceding `<h1>`, and the answer/glance sections are plain `<div>`s with no list semantics.
- **Fix:** promote the animal name to (or add a visually-hidden) `<h1>` when the animal view is active; wrap the fact rows in list semantics.
- **Suggested command:** `/impeccable harden`

**[P2] Quick answers can sit mostly below the fold on short phones** — the photo card's fixed 4:5 aspect ratio plus the page's top padding can consume most of a short viewport before the answers even appear.
- **Fix:** a compressed aspect ratio or scrim height under a `max-height` media query so a sliver of the answers is always visible as a scroll cue.
- **Suggested command:** `/impeccable adapt`

**[P3] The Bad pill's light-mode contrast sits right at the AA floor** — `--bad` on `--bad-bg` computes to ~4.58:1, versus ~5.25:1 for Good and ~4.98:1 for Warn — the "danger" signal, tied to physical safety, has the thinnest accessibility buffer of the three.
- **Fix:** darken `--bad` or lighten `--bad-bg` slightly to match the other pairs' margin.
- **Suggested command:** `/impeccable harden`

## Persona Red Flags

**Casey (Distracted, Mobile, Social Pressure):** The photo card's fixed aspect ratio can push the answers mostly below the fold on short screens — the fact needed to win an argument requires a scroll before it's even visible. If Casey notices a wrong photo mid-argument, the fix-it button is five sections away, contradicting the page's own design intent.

**Sam (Accessibility-Dependent):** The entire photo-fallback block, including the honest "No photo on file" caption, is `aria-hidden` — a screen-reader user never learns there's no photo where a sighted user gets an explicit note. The answer/glance sections have no list semantics, so the count and grouping a sighted user reads off the card shape is invisible to AT.

**Riley (Stress-Tester):** Nothing distinguishes a confidently-correct photo from a mismatched one, despite PRODUCT.md naming this explicitly. `loadSummary`/`loadMedia` resolve independently and can update the hero photo twice for the same view — the photo can visibly change under someone who already started reading it.

## Minor Observations

1. `.pcard-sub` renders in the fixed brand yellow as plain scrim text — not a fill, so not a literal One-Yellow Rule breach, but a second "spend" of the accent inside the one component DESIGN.md singles out for restraint.
2. The extra in-article photos fail silently on error with no "no extra photos" caption the way the hero gets — their disappearance is unexplained if noticed.
3. `summaryCache`/`mediaCache` are unbounded `Map`s for the session — harmless at 438 animals, but worth noting.
4. `firstSentence()` truncates the Wikipedia blurb at ~190 chars if no sentence-ending punctuation appears first — could produce an awkward mid-clause cut, untested against all 438 titles.
5. The `.actions` grid gives Wiki/Share/Report/Another equal visual weight — the most trust-relevant action (Report) carries no more visual priority than the low-stakes shuffle button.

## Questions to Consider

1. If the text answers are already instant and network-independent, why does the one authored motion moment (the Photo Card) still lead the page, ahead of the content that actually fulfills the "four second" promise?
2. Given the product openly admits some Wikipedia photos will be wrong, should "photo confidence" become a visible signal the way Good/Warn/Bad already is for facts?
3. Is a single long scroll still "the field guide, not the encyclopedia," or has the animal page quietly grown into the encyclopedic experience the product positions itself against?
