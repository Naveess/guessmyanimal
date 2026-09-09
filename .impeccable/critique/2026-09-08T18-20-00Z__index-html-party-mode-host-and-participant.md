---
target: Party Mode (host + participant, index.html/party.js/style.css)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
timestamp: 2026-09-08T18-20-00Z
slug: index-html-party-mode-host-and-participant
---
Method: dual-agent (Assessment A: independent design-review sub-agent · Assessment B: detector + live-browser evidence sub-agent, both isolated, no visibility into each other or into the polish pass done earlier this session)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Round/hint counter and "Checking…" feedback are solid; the switch to a new round briefly shows the bare paw-print fallback with no explicit "loading next animal" cue |
| 2 | Match Between System and Real World | 3 | Plain, in-voice copy throughout ("Not that one — keep going."); docked because the invite panel's own instructions describe a join path that doesn't exist (see P0) |
| 3 | User Control and Freedom | 2 | Renaming has a clean Cancel; "End party" is one tap, unconfirmed, and ends the session for every participant instantly with no recap |
| 4 | Consistency and Standards | 2 | Two real inputs (`#partyGuess`, `#partyPlayTooName`) have no `font-family` rule at all and silently render in the browser's default Arial instead of the site's Onest — confirmed live via computed-style scan, not just a static-CSS guess |
| 5 | Error Prevention | 2 | Twitch-channel validation is specific and pre-submit; nothing stops two different people from claiming the same display name, and the destructive end-party action has no confirmation |
| 6 | Recognition Rather Than Recall | 3 | "Playing as X" and hints persist on screen; docked slightly since mobile requires scrolling past the whole round to check the leaderboard |
| 7 | Flexibility and Efficiency of Use | 2 | Genuine credit for resume-on-refresh via `localStorage` (host and player identity survive a reload); no credit for a typed-code path, because none exists — QR/exact-link is the only way in |
| 8 | Aesthetic and Minimalist Design | 3 | Individual cards are clean and restrained; the host's active-round screen stacks ~7 simultaneous focal regions (invite box, round head, photo, hints, play-too card, guess form, leaderboard, feed) with no de-emphasis |
| 9 | Help Recognizing/Recovering from Errors | 2 | The Twitch-channel error is specific and actionable; the invalid-code message ("That party has finished, or the code was wrong.") offers no retry affordance and only appears after the user has already picked a name and icon |
| 10 | Help and Documentation | 2 | One rules line teaches the host on setup; a participant arriving cold via QR gets zero in-context explanation of how scoring or rounds work |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict

**Independent design review**: The core round is genuinely authored for this product, not generic party-game scaffolding — the photo card reveals hint-by-hint through real thumbnail pixelation (the same `pixelStepFor`/`thumbAtWidth` mechanism the solo game uses, not a CSS blur), the win moment reuses the site's one authored reveal animation, and the winner's result pill is the *only* Sun-tinted surface on screen, exactly matching DESIGN.md's One-Yellow Rule. Where it slips into "could be any party app" territory is the chrome around that round: a generic 20-slot Unicode emoji picker (lion, tiger, unicorn, dinosaur…) with no connection to the site's own 435-species dataset or its drawn paw mark; a monospace join-code/URL treatment that quietly introduces the system's only second typeface with no documented exception to DESIGN.md's One-Family Rule; and a lobby/leaderboard/activity-feed vocabulary that reads as standard multiplayer-quiz boilerplate rather than "field guide" flavored. Roughly 80% specifically authored (the round itself), 20% generic multiplayer chrome (the room around it).

**Deterministic scan**: The static CLI scan (`detect.mjs` against `index.html`) came back clean — exit 0, zero findings, re-confirmed with config-ignore bypassed to rule out suppression. That result is real but incomplete: a static markup/CSS scanner can only flag a *wrong* value, not the *absence* of one. The live-browser detector (computed styles in an actual running page) caught what the static pass structurally couldn't: `#partyGuess` (the main guess input) and `#partyPlayTooName` (the inline "want to play too" name field) carry no `font-family` rule anywhere in style.css and render in Arial, confirmed both via the detector's own "24% of text is Arial" flag and independently via `getComputedStyle`. This is the one place in the review the detector caught something the design-review pass missed entirely — a real, fixable inconsistency, not a style preference.

**Visual overlays**: Injection succeeded and the finding above is real, but there's no overlay currently visible anywhere you can look — the evidence-gathering agent ran a headless browser inside its own isolated sandbox, read the console output, and (correctly, per this workflow's own rule about not leaving stray processes running) tore down the live-server it started before reporting back. Nothing is left running for you to inspect visually; the finding is reported as text evidence instead.

## Overall Impression

The round itself — reveal, guess, win — is the best-executed part of the whole site's newest feature and clearly built with care. The problems cluster around the edges of that round: getting people *into* it (no typed-code path, despite the invite text promising one), what happens when two people collide on a detail the system didn't anticipate (same name, a destructive one-tap exit), and two small but real consistency slips (an accidental font fallback, an unread-aloud-forever activity feed). None of these touch the core loop's quality — they're all in the surrounding scaffolding, which tracks with the specificity verdict above.

## What's Working

1. **Resume-on-refresh via `localStorage`** (`HOST_STORE`/`NAME_STORE` in party.js) — a host or guest who refreshes or backgrounds their phone doesn't lose the party or their identity. This is exactly the resilience a no-login, "phone passed around a room" product needs, and it's easy to overlook how much friction it quietly removes.
2. **Pixelation tied to the real hint count, not a CSS filter** — reusing `pixelStepFor`/`thumbAtWidth` from the solo game means the photo visibly sharpens hint-by-hint using genuinely smaller source images, not a blur filter a curious player could defeat from devtools. Smart as both a mechanic and an engineering choice.
3. **The activity feed logs wrong guesses, not just joins and wins** — a deliberate, documented decision that makes a room feel socially alive and gives a late joiner context. Most party-quiz clones settle for a bare scoreboard; this one chose the harder, more social option.

## Priority Issues

**[P0] The invite panel's own instructions describe a join path that doesn't exist.**
- **Why it matters**: The host screen tells everyone to "Join at guessmyanimal.com with code XXXXX" — but there is no code-entry field anywhere on the site. Verified directly: `openPartyPlayer()` is only ever called from one place (`app.js`, parsing a `?party=CODE` URL parameter), and there is no matching text input in `index.html` or anywhere else in the repo. Anyone told the code out loud instead of handed the QR/link, or who follows the instructions literally and opens guessmyanimal.com fresh, hits a dead end with no way forward.
- **Fix**: Add a lightweight "Have a code? Enter it here" input + submit on the home screen that routes to `?party=<code>`, matching the format the invite text already promises.
- **Suggested command**: `/impeccable harden` (this is a real gap in the join flow, not a cosmetic issue)

**[P1] Two players who pick the same name silently share one identity and one score.**
- **Why it matters**: Verified in `functions/api/party/join.js` — a brand-new join (no `previousName`) does a plain `INSERT ... ON CONFLICT(session_code, player_name) DO UPDATE`, with no check for whether that name is already claimed by someone else in the session. Note this is a *different* gap from the already-known rename-collision protection (renaming *does* correctly guard against overwriting someone else's row, lines 40-50 of join.js) — this is two different people's very first name entry colliding, which has no guard at all. In a casual room, two "Alex"es or two "Sam"s is a completely plausible collision, and the second person to submit silently takes over the first person's score row with no warning to either.
- **Fix**: Before submitting a chosen name, check it against the current `state.scores` list client-side and reject or auto-suffix a collision, or move to a random per-device id as the real key and treat `player_name` as a pure display label.
- **Suggested command**: `/impeccable harden`

**[P1] The activity feed is read aloud in full, every ~1.2 seconds, for the entire round.**
- **Why it matters**: `#partyFeed` carries `aria-live="polite"` (index.html), but `renderFeed()` tears down and fully rebuilds the entire list on every poll regardless of whether anything actually changed. The hint list solved this exact problem — appending only new rows instead of rebuilding — but the fix was never carried over to the feed. A screen-reader user on this surface gets the whole activity log re-announced nonstop during a live round; a sighted user who scrolls up to reread an earlier guess gets snapped back down on the next poll.
- **Fix**: Diff against the last-rendered event, append-only, same pattern already proven in `renderHintList()`.
- **Suggested command**: `/impeccable audit` (accessibility-flagged) then `/impeccable polish`

**[P1] Two real inputs fall back to the browser's default Arial instead of the site's Onest.**
- **Why it matters**: Confirmed via live computed-style scan and independently via a direct grep — `style.css` has zero rules matching `#partyGuess`, and `#partyPlayTooName` only gets `min-height`/`font-size`, never `font-family`. Every sibling input in Party Mode (`#partyName`, `.party-select`, `#partyTwitch`, `#partyJoinUrl`) correctly inherits Onest; these two don't. It's a small thing that's very visible: the guess box — the single most-used control in the whole feature — sets its placeholder text in a different typeface than the button right next to it.
- **Fix**: Add `font: inherit;` (or the explicit Onest stack) to both selectors, matching how `#mysteryGuess` already handles the equivalent control in the solo game.
- **Suggested command**: `/impeccable typeset`

**[P2] "End party" is a one-tap, unconfirmed action that ends the session for everyone with no recap.**
- **Why it matters**: It sits in the same full-width button stack as routine actions ("Reveal next hint," "Next round"), 22px below them, at equal visual weight — nothing distinguishes "this is destructive and irreversible for every participant" from "this just advances the game." Firing it produces no final standings, no closing beat, just a silent return to the blank setup screen, which is also the flattest moment in the whole flow (right after the game's actual best moment — the win reveal).
- **Fix**: Add a confirm step, and a short final-standings/recap screen before returning to setup — turns an accidental-tap risk into the second peak the peak-end rule wants.
- **Suggested command**: `/impeccable harden`, then `/impeccable delight` for the recap moment

## Persona Red Flags

**Jordan (First-Timer)**: Hits the P0 above directly — told to "join at guessmyanimal.com with code," finds no code field anywhere. Also gets zero in-context rules explanation on the name-gate screen (no note on how points or hints work) if the host didn't already explain it out loud.

**Sam (Accessibility-Dependent)**: The aria-live feed spam (P1 above) makes the Activity panel actively hostile during a live round for anyone using a screen reader — the entire log re-announces every 1.2 seconds. The icon picker (`role="radiogroup"`/`role="radio"`, 20 options) has no arrow-key roving-tabindex behavior, so a keyboard user must Tab through up to 20 stops instead of arrowing through the group the way that ARIA pattern implies. (One thing that checked out *fine* for Sam: real Tab-driven keyboard testing confirmed the guess input, "Reveal next hint," and "change" rename link all show a clear, high-contrast focus ring on both host and participant views — an initial test using programmatic `.focus()` wrongly suggested otherwise, a Chromium `:focus-visible` quirk that was caught and corrected before landing in this report.)

**Casey (Distracted Mobile User)**: At the app's own 24-character name limit, `.party-roundhead`'s flex row has no wrap/shrink handling, and a long name can squeeze "Round 1" itself into two stacked lines. The join-URL row in the invite box also has no responsive stacking below its fixed layout, truncating the visible link to roughly the first 11 characters on a 390px-wide phone screen.

## Minor Observations

- Renaming shifts your leaderboard rank purely because the tiebreaker is `updated_at ASC` and a rename refreshes your timestamp — two 0-point players can reorder for a reason that has nothing to do with score.
- The monospace font on `.party-codeval`/`#partyJoinUrl`/`.party-join-code` introduces the system's only second typeface with no documented exception against DESIGN.md's One-Family Rule.
- Icon buttons are 42×42px in a 20-up grid — just under the 44px touch-target guideline, in exactly the kind of dense grid where that margin matters most.
- The host's "want to play too?" card auto-injects itself mid-round, competing for attention at the exact moment hints are counting down.
- The invalid-code error gives no retry control — the user's only path forward is remembering the back arrow exists.

## Questions to Consider

- What if the win moment had a beat for the *room*, not just the winner — everyone sees something resolve together, instead of the winner getting the one Sun-tinted pill and everyone else getting the same flat grey line they'd get for a wrong guess?
- What if "End party" produced a five-second recap (final standings, who got the most, what was played) before returning to setup — turning the flattest moment in the flow into a second peak?
- What if the icon picker pulled from the site's actual 435-animal dataset instead of generic Unicode emoji — turning the one clearly "any party app" element into something only this site could ship?
