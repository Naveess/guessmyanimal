---
target: the entire site
total_score: 28
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 1
target_identity: "file:C:\\Users\\Nav\\Documents\\guessmyanimal\\the entire site"
timestamp: 2026-09-13T12-05-49Z
slug: the-entire-site
---
Method: dual-agent (A: a11719c33736bb91d · B: aae55a7b516084969)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Chat status now has a real waiting-to-live/down cycle instead of going green the instant a JOIN is sent. |
| 2 | Match System / Real World | 4 | Plain, honest copy throughout ("Hurry!", "Not you?", "Twitch says: ..." surfaced verbatim). |
| 3 | User Control and Freedom | 3 | In-page End-stream confirm+Cancel is solid; no undo on "Not you?" disconnect, but there's nothing to undo. |
| 4 | Consistency and Standards | 2 | Two divergent circle-badge treatments now visible together on the streamer pitch screen (confirmed), plus intentionally-duplicated search logic. |
| 5 | Error Prevention | 3 | Honeypot field, join-timeout, disabled buttons mid-request. |
| 6 | Recognition Rather Than Recall | 4 | Nav search reaches any animal from any page; aria-current="page" throughout. |
| 7 | Flexibility and Efficiency | 3 | Space/Enter shortcuts for streamer power users. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained overall; undercut by the badge-language sprawl. |
| 9 | Error Recovery | 3 | NOTICE text surfaced verbatim instead of swallowed; retry link on dead-end chat states. |
| 10 | Help and Documentation | n/a | Product is Operate-mode; About page + collapsible in-round help cover this contextually. |
| **Total** | | **28/36** | **Good (77.8%)** |

Cognitive load: 6/8 pass. The two failures: consistent patterns (the badge sprawl below) and working memory - a first-time streamer sees three separate "how this works" framings (reassurance points, numbered steps, You/Chat roles) stacked before ever pressing Connect.

## Design Specificity Verdict

**LLM assessment:** The system reads as genuinely authored, not templated - One-Yellow and Border-Or-Shadow hold across every surface traced, and the new nav search reuses .suggest/.noresult verbatim rather than inventing a second dropdown language. That discipline is real.

But one piece of today's own work breaks the pattern it sits inside. Verified directly: streamer.html's pitch screen now shows two different circle-badge treatments in the same scroll - the three reassurance cards use .streamer-point-n (22px, --muted, a checkmark character) while the three "How it works" steps three lines below use the new .streamer-step-icon (28px, --ink, a drawn SVG). (One assessment initially claimed a third clashing badge, .party-hint-n - checked directly, and that one only appears on the separate live-round screen, never co-visible with the pitch content, so that part doesn't hold. The two-badge inconsistency on the pitch screen itself is real and confirmed.) DESIGN.md's own Streamer surface section states this screen reuses ".party-hint-n's own circle... rather than a new icon language" - that line is now inaccurate.

**Deterministic scan:** impeccable detect --json across all five HTML files + style.css returns clean (exit 0, zero findings) under the project's own accumulated ignore-rules. Forcing --no-config surfaces one pre-existing, already-classified false positive (flat-type-hierarchy on streamer.html, tripped by a clamp()-sized heading the static analyzer can't resolve) - consistent with four other suppressions already on file for the same limitation elsewhere in the site. Nothing new.

**Structural verification (no browser available):** Had the second assessment independently recompute, from the literal CSS values, whether the nav-pill-clipping fix from earlier actually resolves. It does, cleanly: the pill's real rendered footprint lands at approximately 70px from viewport top at >=860px; the fixed .topbar clearance is 110px on every page using it. No overlap, on any surface. One real wrinkle: the fix is written on the bare .topbar class, which also silently touches Mystery Animal's and Party Mode's in-app headers (index.html's .mysteryview .topbar / .partyview .topbar - confirmed by grep, neither has its own override). That's very likely a bonus fix for a bug those two views probably already had, since the same formula was already proven correct for the Animal page's own topbar - but it was never visually confirmed on those two screens specifically, since nobody asked about them.

## Overall Impression

This is a mature, consistent design system carrying a large, mostly successful batch of changes well - the new nav search and the streamer surface's error-handling are real product improvements, not just visual churn. The one place quality slipped is the exact area most recently touched under time pressure: the pitch screen's icon redesign introduced a second badge idiom instead of extending the first.

## What's Working

1. The chat-status honesty fix - replacing an instant-green dot with a real waiting/live/down cycle, NOTICE text shown verbatim - is a trust improvement, not just a redesign.
2. search-core.js reuses the visual layer perfectly - the nav dropdown looks and behaves exactly like the home page's own search, because it's the same CSS classes, not an approximation.
3. The server-authoritative countdown (clockOffsetMs, frozen-at-resolution, transform-based bar) is careful, correct engineering protecting the UI from clock skew.

## Priority Issues

**[P1] Two divergent circle-badge treatments on one screen.** .streamer-point-n (reassurance checkmarks) and the new .streamer-step-icon (how-it-works steps) sit in adjacent cards on the same pitch screen with different sizes, colors, and content types - and DESIGN.md still claims this screen has no new icon language. Fix: either restyle the reassurance checkmarks onto the same .streamer-step-icon treatment, or fold the new icons back into .streamer-point-n's existing sizing, and correct DESIGN.md either way. Suggested command: /impeccable polish

**[P2] Browse's A-Z jump letters are 32x32px** (style.css:2318-2321), below the 44px touch target this system enforces everywhere else (.btn 48px min-height, .back 44px). Confirmed via direct read - genuinely undersized, pre-existing, not from today's changes. Suggested command: /impeccable adapt

**[P2] The .topbar fix's reach onto Mystery Animal and Party Mode was never visually confirmed**, only arithmetically verified. Almost certainly correct (same formula already shipped on the Animal page), but worth a real look before calling it done. Suggested command: /impeccable audit

**[P3] Intentional but real code duplication**: the typo-tolerant matching logic is now byte-for-byte identical in both app.js and search-core.js, acknowledged in a comment but still two places to remember to fix together. No immediate action; a documented tradeoff, not a bug.

## Persona Red Flags

**Casey (mobile, Browse -> animal page):** the undersized jump-letter targets above; also the nav search is a flyout nested inside the corner-menu flyout, never tested at 375px width.

**Alex (fast Twitch setup):** three stacked "how this works" framings (points -> steps -> roles) before the one Connect button reads as re-explaining, not reassuring, to someone trying to get live quickly - the cognitive-load finding above.

**Jordan (About -> Mystery Animal):** this journey is smooth - the ?mystery=1 link routing works cleanly and the copy stays honest and plain throughout.

## Minor Observations

- The timer bar's transform transition isn't gated by prefers-reduced-motion, unlike the rest of the system's motion vocabulary.
- Icon stroke-width is inconsistent site-wide (1.75 in some JS-drawn icons vs. 2 in hardcoded SVGs) - pre-existing, not from today.

## Questions to Consider

- If search-core.js is the canonical matcher now, why does app.js still carry its own copy - and what breaks the day they diverge?
- Is a 3-block pitch screen (points -> steps -> roles) actually faster to parse than a single, tighter framing?
- Now that the nav-clipping fix reaches Mystery Animal and Party Mode too, should that be confirmed visually before it's considered closed?
