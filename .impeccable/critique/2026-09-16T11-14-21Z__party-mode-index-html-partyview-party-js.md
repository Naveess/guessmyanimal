---
target: "Party Mode (index.html #partyview, party.js) - lobby and live round"
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\Nav\\Documents\\guessmyanimal\\Party Mode (index.html #partyview, party.js)"
timestamp: 2026-09-16T11-14-21Z
slug: party-mode-index-html-partyview-party-js
---
Method: dual-agent (A: a56f8f210ddb42cf7 · B: ac8c6d223c97fd615)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Every join/heartbeat/rename call is silently `.catch(()=>{})`'d — no failure ever surfaces. |
| 2 | Match Between System & Real World | 4/4 | Plain, casual copy throughout ("whoever names it first takes the round"). |
| 3 | User Control and Freedom | 3/4 | Rename/cancel exist, but a stuck round has only "wait" or "End the whole party" — no per-round skip. |
| 4 | Consistency and Standards | 3/4 | Strong component reuse, undercut by `#partyName:focus{outline:none}` breaking the site's own focus rule. |
| 5 | Error Prevention | 2/4 | Name-collision check exists on manual join/rename but is silently skipped on cached-name auto-rejoin. |
| 6 | Recognition Rather Than Recall | 4/4 | Room code stays in the topbar always; your own row is always tinted and labeled. |
| 7 | Flexibility and Efficiency of Use | 2/4 | No host-side "reveal & move on" control — Mystery Animal has "Give up," Party Mode has nothing equivalent. |
| 8 | Aesthetic and Minimalist Design | 3/4 | Cabinet treatment is disciplined and on-brand; the live-round screen still stacks 7+ live zones in one scroll on mobile. |
| 9 | Error Recovery | 2/4 | Wrong/expired code is a dead end; a stale guess is mislabeled as a plain wrong answer. |
| 10 | Help and Documentation | 2/4 | The host gets a one-line pitch; a player arriving by QR/link gets none — straight to a name form. |
| **Total** | | **28/40** | **Good** |

No heuristics scored n/a — a live multiplayer tool plausibly needs both efficiency and in-context help, same reasoning as the Streamer critique.

## Design Specificity Verdict

**LLM assessment:** Party Mode reads as authored for this specific game, not a reskinned Kahoot template — the actual guess-the-animal loop (blurred photo, hint list, matching emoji vocabulary) is transplanted into a room, not abstracted into a generic buzzer game. It slips toward generic-template territory structurally, not visually: the join gate is pure name+icon collection with zero explanation of the game, and the leaderboard has no plan for a room that grows past a handful of players.

**Deterministic scan:** `impeccable detect --json index.html party.js` (exit 0) returned 14 advisory `gpt-thin-border-wide-shadow` findings and nothing else (`party.js`: zero findings). Assessment B traced these by hand (the tool gives no line numbers) to the same `--arc-*` Cabinet-glow token system now documented in DESIGN.md, applied identically across `#mysteryview`, `#partyview`, and Streamer. This is the same pattern reviewed and approved in the prior Streamer critique — a likely false positive as a fresh defect, not new drift. One genuine, if small, finding of its own: the project's `.impeccable/config.json` already has a dated `ignoreValues` approval for this exact mechanism under the rule id `dark-glow`, referencing a `design_handoff_mystery_party_consent/README.md` — but that file doesn't exist anywhere in the repo (dead reference), and the approval is filed under a different rule id than the one that actually fired (`gpt-thin-border-wide-shadow`), so it doesn't suppress today's findings. No `design-system-radius` finding fired this run — the 22px Cabinet-card radius documented after the Streamer critique is now correctly recognized as legitimate.

**Visual overlays:** Not available this session — no browser automation tool is exposed here.

## Overall Impression

Unlike Streamer, Party Mode's visual language isn't the problem — it's already consistent with the documented Cabinet system and the detector confirms it. The real issues here are functional and robustness gaps: a silent player-identity merge that can put two strangers' scores on one leaderboard row, a stuck round with no exit short of nuking the whole party, and a scoreboard with no cap while everything else on the surface was built to scale. These are quieter than a visual-language violation but arguably more consequential — one is a data-integrity bug live in front of a room of people.

## What's Working

1. **The atomic first-writer-wins guess** (`functions/api/party/guess.js`'s `WHERE code = ?3 AND round_no = ?4 AND resolved = 0`) plus the activity feed showing wrong guesses too — a burst of simultaneous guesses after a hint drop feels like a real race, not a coin-flip.
2. **In-place rename preserving score** (`functions/api/party/join.js` ~40-50) — fixing a typo'd name transfers `rounds_won`/score to the corrected name instead of orphaning a fresh 0-point row.
3. **Append-only hint/feed rendering** (`party.js`'s `renderedHints`/`renderedFeed`) — built specifically so `aria-live` doesn't re-announce the whole log every 1.2s poll and sighted readers' scroll position doesn't snap to top. A genuine screen-reader-first fix, not an afterthought.

## Priority Issues

**[P0] Silent identity/score merge on auto-rejoin**
- **What:** `openPartyPlayer()` (party.js ~830-838) joins directly using the sitewide cached name whenever one exists, skipping the `nameCollides()`/`nameTakenOnJoin()` checks that the manual join and rename forms both run.
- **Why it matters:** Display names are cached per-device and reused across every future room. Two different people using a common name ("Alex," "Mom") in different games can have a device silently share one `party_scores` row — merging guesses and points into a single line on the leaderboard the whole room is watching, with no warning to either person.
- **Fix:** Run the same collision check on the auto-rejoin path; fall back to the (pre-filled) name form on a collision instead of joining blind.
- **Suggested command:** `/impeccable harden`

**[P1] No visible keyboard focus on the join flow's first control**
- **What:** `#partyName:focus{outline:none}` (style.css:3439) and the identical pattern on `#partyJoinUrl:focus` (line 3873) override the sitewide `:focus-visible` outline rule outright.
- **Why it matters:** This directly contradicts DESIGN.md's own Inputs/Fields rule ("a border-strength change plus the standard 3px focus-visible outline"), and it hits the very first control every joining player touches.
- **Fix:** Drop `outline: none` on both, or add an explicit `:focus-visible` rule that restores it.
- **Suggested command:** `/impeccable harden`

**[P1] No escape hatch when a round is unwinnable**
- **What:** Once all hints are shown, `#partyHint` disables and the round just sits unresolved forever — there's no host control equivalent to Mystery Animal's "Give up, show the answer." The only exit is `#partyEnd`, which ends the entire party, not just the round.
- **Why it matters:** A host trying to keep momentum for friends watching has no way to move past a round nobody can crack without killing the whole session.
- **Fix:** Add a host "reveal & next round" control, mirroring Mystery Animal's give-up affordance.
- **Suggested command:** `/impeccable onboard` (recovery-path design) or `/impeccable harden`

**[P2] Wrong/expired room code shows a broken-looking flash before a dead end**
- **What:** `openPartyPlayer()` shows the full round scaffold (guess form included) before the first poll runs; only after ~1.2s does the 404 branch hide everything and show "That party has finished, or the code was wrong" — with no retry control, just the back button.
- **Why it matters:** A first-timer joining via QR can't tell whether to retry, ask the host, or give up.
- **Fix:** Validate the code before ever showing `#partyActive`; give the dead-end message a "try another code" control.
- **Suggested command:** `/impeccable clarify`

**[P2] Leaderboard has no height cap, unlike everything else built to scale**
- **What:** `.party-scores` has no `max-height`/`overflow` while `.party-feed` explicitly caps at 260px; the server returns up to 50 rows and all of them render.
- **Why it matters:** A real party-sized room grows the page indefinitely, breaking the desktop sticky column and forcing endless mobile scroll past it to reach the "End party" button.
- **Fix:** Cap `.party-scores` the same way `.party-feed` is capped, or truncate to "top N + your row."
- **Suggested command:** `/impeccable adapt`

## Persona Red Flags

**Jordan (First-Timer, joining via QR mid-conversation):** Lands on the name form with zero explanation of the game — no equivalent of the host's own one-line pitch. A mistyped code dead-ends with no retry, so Jordan can't tell whether to ask the host again or fix a typo.

**Sam (Accessibility-Dependent):** Loses visible keyboard focus on the very first control (P1 above). The presence dot is `aria-hidden` with online/offline conveyed only via a mouse-hover title — no per-row signal for a screen reader. The icon picker sets `role="radio"`/`aria-checked` on 20 buttons with no arrow-key roving-tabindex handler, so Sam must Tab through 20 stops individually instead of arrowing through the group the ARIA pattern promises.

**Casey (Distracted, on a phone, possibly patchy signal — PRODUCT.md names "a moving car" explicitly):** Every network failure in `poll()` is silently swallowed with no "reconnecting" indicator — Casey's screen just freezes. A guess that lands after Casey's phone has fallen behind the round returns `{stale:true}` from the server, but the client never reads that flag — it tells Casey they guessed wrong when their answer was never actually checked against the current target.

## Minor Observations

1. `slice(0, 24)` and `maxlength="24"` on the name field both truncate on UTF-16 code units — an emoji-heavy name can be cut mid-character.
2. DESIGN.md names `cabinet-card: 22px` as a token, but no `--r-cabinet` custom property exists — it's a repeated literal across five-plus selectors, risking drift if one is later tuned and the others aren't.
3. `#partyGuess`'s cabinet focus rule adds a Sun border+tint on top of the sitewide focus-visible outline rather than replacing it — two rings stack for keyboard users; not broken, just redundant.
4. `SCORE_LIMIT = 50` is a silent ceiling — a 51st scoring player never appears on the board or in the final recap, with no messaging that the room hit a cap.
5. The `dark-glow` ignoreValue approval in `.impeccable/config.json` cites a handoff README that doesn't exist in the repo, and is filed under a different rule id than the one that actually fires (`gpt-thin-border-wide-shadow`) — worth reconciling so future scans don't re-flag an already-approved pattern.

## Questions to Consider

1. If a room gets stuck on the last hint with nobody guessing right, is "end the entire party" really meant to be the only exit — or is a per-round skip simply the thing beta shipped without?
2. Display names are cached per-device and reused across every future room — is that the right identity model for a feature whose whole value is an accurate "who's ahead," now that the silent-merge case is visible in the code?
3. Was skipping the game explanation on the joiner's side a deliberate "speed over onboarding" call, or did the pitch simply never get written for that half of the flow?
