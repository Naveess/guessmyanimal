---
target: "Mystery Animal page (index.html #mysteryview)"
total_score: 35
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-08T10-07-19Z
slug: index-html-mysteryview-mystery-animal-page
---
Method: dual-agent (A: a2c3134faaff67516 · B: a91c725fd74c1448e)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | New hint content is never announced to non-visual users |
| 2 | Match System / Real World | 4 | Plain party-game language throughout ("Next hint," "Give up, show the answer") |
| 3 | User Control and Freedom | 3 | Switching Daily→Endless→Daily mid-round silently discards revealed hints |
| 4 | Consistency and Standards | 3 | Next hint/Give up contradict DESIGN.md's own written Button spec without the spec being amended |
| 5 | Error Prevention | 4 | Typo-tolerant guess matching, give-up double-tap confirm, honeypot report field |
| 6 | Recognition Rather Than Recall | 4 | Stats and revealed hints stay persistently visible |
| 7 | Flexibility and Efficiency | 4 | Next-hint button, desktop two-column layout, viewport-scaled type for streaming |
| 8 | Aesthetic and Minimalist Design | 3 | Real progress on six-boxes-to-two, but a missing margin puts a visible seam right where it most needs to look clean |
| 9 | Error Recovery | 4 | Non-judgmental wrong-guess copy, graceful clipboard fallback |
| 10 | Help and Documentation | 3 | The streak/miss-a-day rule is explained exactly once, ever, with no way to resurface it |
| **Total** | | **35/40** | **Good** |

## Design Specificity Verdict

**LLM assessment (Assessment A)**: Grounded, not generic. The pixelated-thumbnail reveal (genuinely tiny Wikimedia thumbnails, not a CSS blur, specifically to defeat devtools cheating), the deterministic date-hashed Daily puzzle, the win celebration built from the actual solved animal's own emoji, and the two-tap give-up calibrated to the real stake (a day's streak) are decisions that could only belong to this product. The container language of the recent two-card rework (hairline dividers, a segmented tab with a sliding thumb) is systemic reuse from the site's own existing patterns (the theme toggle, the fact-card tint idiom), not an unrelated import — specific where it counts, appropriately systemic where it's structural.

**Deterministic scan (Assessment B)**: `node detect.mjs --json index.html` — exit code 0, findings `[]`, clean. Zero mechanical issues. Nothing to flag as a false positive since nothing was flagged; one pre-emptive note: if the detector's ruleset ever adds a generic "borderless button" check, the deliberately-borderless Next-hint/Give-up rest state would need an explicit context exception, since it's an intentional design choice with documented reasoning in the CSS.

**Visual overlays**: Not available — no browser-automation tool is exposed in this environment, so no live overlay was generated. Assessment B instead fetched the served page directly (`http://127.0.0.1:8788/?mystery=1`) and confirmed the markup byte-matches source on disk (structural confirmation only, no visual/layout conclusion drawn from it).

## Overall Impression

The six-boxes-to-two-cards rework is a real improvement that both assessments independently corroborate: Assessment A judged the hierarchy of Guess → Next hint → Give up → Report as "thoughtfully graduated," and Assessment B confirmed the technical execution is clean — no contrast regression, no shrunk touch targets, no broken `[hidden]` handling anywhere in the changed elements. The single biggest opportunity is that the rework's visual execution has one loose end (a missing margin between the two cards) sitting exactly where the redesign most needs to look deliberate, and its biggest open question is whether removing all resting-state affordance from two frequently-used buttons (Next hint, Give up) traded one legibility problem (too boxy) for a smaller one (do these still read as clickable at a glance, especially on the touch devices this product runs on primarily).

## What's Working

1. **The streak's size-only distinction** (36px vs. 24px siblings, hairline-divided, no color or box) solves "how do we keep the streak feeling important without a colored box" through type scale alone — the right answer under the site's own One-Yellow Rule, and it directly resolved the specific miss from the previous attempt (a coloured streak number that "just looked like a mistake" without a box to justify it).
2. **Give-up's double-tap confirm, mirrored in the screen-reader announcement** (`"Tap again to confirm — you won't get another animal today."`) — both visual and non-visual users get the same warning at the one moment on this page where a slip actually costs something (a whole day's puzzle).
3. **Technical execution of the rework is genuinely clean**: Assessment B independently verified all four contrast pairs touched by the change clear WCAG AA (5.84:1–15.85:1 across both themes), touch targets kept their full 48px height, and the `[hidden]`/`display` override pattern (a documented recurring bug class in this codebase) was correctly re-applied on every changed element.

## Priority Issues

**[P1] Zero-gap seam between the two reworked cards**
- **Why it matters**: `.mystery-panel-top` has no `margin-bottom` and the photo card's own spacing only handles the gap *below* it, not above — on mobile (plain stacked divs, no flex/grid gap) the tabs/stats card's bottom edge and the photo card's top edge sit with nothing between them. This lands the one visible seam exactly where the "two cards, not six boxes" rework most needs to read as deliberate. Assessment B independently corroborated the same gap from source (no `margin-top`/`margin-bottom` between the two `.mystery-panel-*` siblings anywhere in the stylesheet), flagging it as worth a visual check.
- **Fix**: Add `.mystery-panel-top { margin-bottom: 18px }` (matching the existing hero→round spacing already used elsewhere on this page).
- **Suggested command**: `/impeccable polish`

**[P1] Next hint / Give up read as inert text at rest, not buttons**
- **Why it matters**: Both buttons have no border, fill, icon, or underline at rest — their only affordance is a `:hover` fill, which doesn't exist on touch devices, the primary use case per PRODUCT.md ("most often on mobile"). Sitting directly beneath a solid-yellow Guess CTA, bold "Next hint" plausibly reads as a caption rather than a control to a first-time player. This is a pure interaction-design/legibility concern, not a technical one — Assessment B confirmed contrast (15.85:1/5.89:1) and touch target (48px, full width) are both fine, so nothing is technically broken, but visual affordance at rest is genuinely reduced. It also silently diverges from DESIGN.md's own written Button spec ("Secondary (default): Card background, Ink text, Line border") without the spec being updated to describe this as an intentional exception.
- **Fix**: Add a minimal persistent affordance (a chevron icon, an underline, or a subtle always-on tint) to at least "Next hint" (the more frequently pressed of the two), and/or formally document a new "ghost/tertiary button" variant in DESIGN.md so this doesn't read as spec drift the next time a similar action gets added.
- **Suggested command**: `/impeccable polish`

**[P2] New hint content is never announced to screen readers**
- **Why it matters**: `#mysteryHints` carries no `aria-live`/`role`, confirmed by Assessment B via source. A sighted player sees the new hint rise in on both the wrong-guess path and the "Next hint" button path; a screen-reader user gets no announcement of what the new hint actually says and must manually re-navigate to the hint list every time. (Mitigating: `#mysteryFeedback`, which is `aria-live="polite"`, does announce the win/loss outcome text — the gap is specifically the hint content itself, not overall silence on the page.)
- **Fix**: Make the newest `.mystery-hint` (or `#mysteryHints` itself) `aria-live="polite"`, or fold the new hint's text into the existing `#mysteryFeedback` announcement.
- **Suggested command**: `/impeccable harden`

**[P2] Closing the Daily archive drops keyboard focus to `<body>`**
- **Why it matters**: `closeArchive()` hides `#mysteryArchive`, which contains the just-focused "Back to today" button, with no explicit `.focus()` call afterward — a keyboard-only user's focus falls back to the top of the document, forcing a restart of tabbing from page top instead of landing back in the round they returned to.
- **Fix**: Explicitly focus the guess input (or the archive-open button) when the archive closes.
- **Suggested command**: `/impeccable harden`

**[P3] Endless mode's filter row exceeds the working-memory guideline**
- **Why it matters**: `CATEGORY_BUCKETS` presents 6 simultaneous filter chips (All, Mammals, Birds, Reptiles & Amphibians, Fish & Sea Life, Bugs & Crawlers) at one decision point — past the ≤4-item guideline for a single visible choice group, though a real workaround (scroll/scan) exists, keeping this a P3 rather than higher.
- **Fix**: Group into fewer top-level choices (e.g. a smaller default set with an overflow), or accept the tradeoff explicitly since the categories are all genuinely distinct and low-stakes to mis-tap.
- **Suggested command**: `/impeccable layout`

## Persona Red Flags

**Jordan (First-Timer)**: No visual cue distinguishes "Next hint" from static status text at rest (P1 above); the entire explanation of the streak/miss-a-day rule (`#mysteryDailyIntro`) is shown exactly once, ever, for that browser, with no way to resurface it later if skimmed past.

**Sam (Accessibility-Dependent)**: No live announcement of actual hint content on either reveal path (P2 above, confirmed via source by Assessment B — `#mysteryHints` has no `aria-live`); focus drops to `<body>` on closing the archive (P2 above); Next hint/Give up rely on `:hover` for their only non-text affordance, which does nothing before `:focus-visible` arrives via keyboard. Note: everything else Assessment B checked for Sam specifically — tab-group ARIA, decorative-icon `aria-hidden`, focus-visible outline never suppressed, all four contrast pairs, `[hidden]` handling — came back clean.

**Casey (Distracted Mobile User)**: The give-up arm auto-reverts after exactly 4 seconds with no re-announcement — a player distracted by the road or a passenger who taps "Give up" once, looks away, and taps again 5+ seconds later will silently re-arm instead of confirming, a small but real friction loop in precisely the "moving car" context PRODUCT.md names as the primary use case.

## Minor Observations

- The dark-mode border-tint fix on the tabs' sliding thumb (from the previous pass) is confirmed still correctly in place and working — worth noting as a process strength, not a new finding.
- The Daily archive list is a flat scroll capped at `min(60vh, 520px)` with no search/jump-to-date — fine today, but will mean scrolling several hundred hairline rows once the puzzle has run that long.
- `.mystery-report`'s underline-only treatment is arguably the inverse problem of Next hint/Give up (possibly *too* subtle), but it's defensibly the least important action on the screen, so the demotion direction is likely correct even if the specific "how subtle" varies across the three tiers.
- Mode-switching mid-round (Daily→Endless→Daily) silently re-picks and resets hint progress on the same deterministic animal — not destructive to score, but a confusing silent state change (P3, not included above to keep the priority list focused).
- No `min-width:0`/wrap safeguard is visible on `.mystery-result-card` against very long animal names (e.g. "Aldabra giant tortoise") — worth a manual check against the dataset's longest entries.

## Questions to Consider

1. If a box-in-a-box was the reason Next hint/Give up lost their borders, why wasn't DESIGN.md's own Button spec updated to name this as a real variant — is it a documented "ghost button," or a one-off exception waiting to drift the next time a third action gets added to this card?
2. The streak is explicitly "the one number this mode is built around," yet losing a 3-day streak and a 400-day streak get byte-for-byte the same sentence. At what streak length, if any, should the emotional weight of the copy actually change?
3. The rework's own reasoning says two cards beat "no card anywhere" in a side-by-side test — was one card (rather than two) ever tried, given the floating photo card already sits between them as a third, differently-treated surface?
