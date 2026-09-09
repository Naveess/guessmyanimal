---
name: Guess My Animal
description: Type an animal, get the answers people ask mid-game — one photo card, then the facts.
colors:
  sun: "#ffce1f"
  sun-deep: "#e8b400"
  on-sun: "#1d1e19"
  paper: "#e9eae2"
  card: "#f8f9f3"
  ink: "#1d1e19"
  muted: "#5f6255"
  line: "#d7d9cc"
  good: "#0a6b3d"
  good-bg: "#dbe9dd"
  warn: "#8a5600"
  warn-bg: "#f4e6c9"
  bad: "#b8321a"
  bad-bg: "#f2ddd6"
  flat-bg: "#e4e6da"
  paper-dark: "#14150f"
  card-dark: "#1e2019"
  ink-dark: "#eef0e4"
  muted-dark: "#989c88"
  line-dark: "#2c2f25"
  good-dark: "#58cf9b"
  good-bg-dark: "#12301f"
  warn-dark: "#efbc63"
  warn-bg-dark: "#33270e"
  bad-dark: "#ff7f63"
  bad-bg-dark: "#3a1912"
  flat-bg-dark: "#262920"
typography:
  display:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(58px, 16vw, 150px)"
    fontWeight: 700
    lineHeight: 0.92
    letterSpacing: "-0.045em"
  headline:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(31px, 8.6vw, 42px)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  subhead:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "clamp(20px, 5vw, 24px)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  lede:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "18.5px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.011em"
  body:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.011em"
  control-label:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  meta:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  caption:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "normal"
  label:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  micro:
    fontFamily: "Onest, ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.09em"
rounded:
  focus: "5px"
  chip: "9px"
  row: "11px"
  compact: "12px"
  control: "13px"
  button: "14px"
  field: "15px"
  panel: "16px"
  splash-field: "18px"
  card: "20px"
  photo: "26px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "13px"
  md: "20px"
  lg: "30px"
components:
  button-primary:
    backgroundColor: "{colors.sun}"
    textColor: "{colors.on-sun}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-primary-hover:
    backgroundColor: "{colors.sun-deep}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 17px"
  button-secondary-hover:
    backgroundColor: "{colors.flat-bg}"
  card-surface:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.card}"
  pill-neutral:
    backgroundColor: "{colors.flat-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  pill-good:
    backgroundColor: "{colors.good-bg}"
    textColor: "{colors.good}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  pill-warn:
    backgroundColor: "{colors.warn-bg}"
    textColor: "{colors.warn}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  pill-bad:
    backgroundColor: "{colors.bad-bg}"
    textColor: "{colors.bad}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
---

# Design System: Guess My Animal

## Overview

**Creative North Star: "The Field Guide, Not the Encyclopedia"**

This is a pocket reference built for one specific moment: someone mid-game,
phone in hand, needing an answer in seconds. The visual language borrows
Fiasco's warm-bone-and-electric-yellow world and a Bumble-shaped structure
(a full-bleed brand-colour splash, then a photo card you scroll past into
facts) but exists to serve speed and confidence, not spectacle. Every
surface reads as considered rather than decorated: one accent colour used
sparingly, one authored motion moment, plain honest type.

Ground and ink come from the warm end deliberately — a bone paper (`#e9eae2`)
and an olive near-black (`#1d1e19`) rather than white-on-grey, so the sun
yellow reads as a decision instead of the only colour in the room. That
leaves green, amber, and red free to mean something specific on the answer
pills, instead of competing with a loud background.

The system rejects two things by construction: a cold neutral-grey palette
(every "grey" here is tinted from the ink, never a flat `#888`), and motion
as decoration. There are two authored animations, never on screen
together because they live on mutually exclusive screens — the photo card
arriving on the animal view (lifting and uncovering itself top-down), and
the paw stamping down on the splash, whose impact is what throws the
wordmark's letters — and everything else is quiet, functional feedback
(a rise-in, a scale-down on press).

**Key Characteristics:**
- Warm bone ground and olive-black ink, never cold neutral grey
- One electric-yellow accent (`--sun`), spent deliberately and rarely
- Two authored motion moments, one per screen (the card "deal", the splash's paw stamp); everything else is quiet feedback
- Pills state the answer in words first; colour is a second signal, never the only one
- Three-state theming (System / Light / Dark), with the splash intentionally *not* yellow in dark mode

## Colors

The palette pairs one loud, fixed brand colour with a warm neutral system that flips fully between light and dark.

### Primary
- **Sun** (`#ffce1f`): the one brand colour. Fixed — it does not change between light and dark themes, because it is the identity, not a surface. Used solid only for things you actually press: the home splash background (light theme only), the dice/shuffle button, and the one primary CTA per screen. Read-only content (the fact card) uses a tint, not a fill — see the One-Yellow Rule.
- **Sun Deep** (`#e8b400`): the hover/pressed state for anything built on Sun.
- **On Sun** (`#1d1e19`): the ink used on top of Sun. Also fixed across themes — text on yellow must never flip to a light colour, because yellow itself never darkens to compensate.

### Neutral
- **Paper** (`#e9eae2` light / `#14150f` dark): the page ground.
- **Card** (`#f8f9f3` light / `#1e2019` dark): raised surfaces — cards, dialogs, menus, the search box.
- **Ink** (`#1d1e19` light / `#eef0e4` dark): primary text.
- **Muted** (`#5f6255` light / `#989c88` dark): secondary text, placeholders, captions. Deliberately tinted from Ink rather than a neutral grey, so it stays warm instead of going cold and generic.
- **Line** (`#d7d9cc` light / `#2c2f25` dark): hairline borders and dividers.
- **Flat** (`#e4e6da` light / `#262920` dark): the resting fill for neutral pills and hover states — a step up from Paper without reaching for a border.

### Semantic (answers, not brand)
- **Good** (`#0a6b3d` on `#dbe9dd` / `#58cf9b` on `#12301f`): a "yes/safe/fine" answer pill.
- **Warn** (`#8a5600` on `#f4e6c9` / `#efbc63` on `#33270e`): an "it depends" answer pill.
- **Bad** (`#b8321a` on `#f2ddd6` / `#ff7f63` on `#3a1912`): a "no/danger" answer pill.

### Named Rules
**The Fixed-Sun Rule.** `--sun` and `--on-sun` never change value between themes. Everything else in the palette flips; these two don't, because Sun is the brand identity and On-Sun is the guarantee that text on it stays readable regardless of theme.

**The Tinted-Neutral Rule.** No neutral in this system is a flat, hue-less grey. Every "grey" token (Muted, Line, Flat) is mixed from Ink, so the whole neutral scale carries the same warm bias as the ground.

**The One-Yellow Rule.** Outside the splash, at most one solid-fill Sun element appears per screen. In practice that's the dice button and the one primary CTA — the fact card and the report dialog's selected-kind chip are read-only or state-only, not actions, so they use a tint (`color-mix(in srgb, var(--sun) 16%, var(--card))`) or an ink-toned selection instead of a fill. Sun's rarity is what makes it read as an accent rather than a theme colour; this rule was violated in practice before the fact card and the selected-kind chip were corrected to tints.

## Typography

**Body/Display Font:** Onest (self-hosted variable font, weights 300–800) with `ui-sans-serif, system-ui, 'Segoe UI', sans-serif` fallback.

**Character:** A single geometric-humanist grotesque carries the whole system — no serif, no mono, no second family. Tight negative tracking on large sizes (`-0.04em`) gives headlines a compressed, confident set; body copy relaxes to `-0.011em`. Variable-weight means the same face does the work a font pairing would elsewhere: 700 for anything that announces, 400–500 for anything that explains.

### Hierarchy
- **Display** (700, `clamp(58px, 16vw, 150px)`, line-height 0.92): the home wordmark only — sized to be the biggest thing on the page, not merely the biggest on the splash. Full-bleed (breaks out of `.home-in`'s 460px reading column to span the true viewport width) rather than sharing that column's measure the way every other splash element does; nothing else on the site gets either treatment.
- **Headline** (700, `clamp(31px, 8.6vw, 42px)`, line-height 1.02): the animal's name on the photo card. At the 620px breakpoint this fixes to 46px rather than continuing to scale with viewport, since the card itself stops being phone-shaped there. The About page `<h1>` uses its own, slightly taller clamp (`clamp(31px, 8vw, 44px)`) because it is the single biggest text on that page rather than sharing a screen with a photo — same role, a 2px-taller ceiling for a quieter context.
- **Subhead** (700, `clamp(20px, 5vw, 24px)`): About page `<h2>` section headings.
- **Title** (700, 22px): dialog titles.
- **Lede** (400, 18.5px, Muted): the About page's opening paragraph — one step up from body, one step down from Subhead.
- **Body** (400, 16–16.5px, line-height 1.45–1.6): blurb text, prose paragraphs. Prose copy caps at 62ch measure. The splash search field bumps this to 17px — a single deliberate exception, sized for the one input that has an entire screen to itself.
- **Control label** (500, 15px): button, chip, and menu-item text.
- **Meta** (400, 14.5px): dialog subtitles, field labels, glance-chip values, the "no results" note.
- **Caption** (400, 13.5px): footers, figure captions, inactive theme-toggle labels.
- **Section label** (600, 12.5px, `0.08em` tracking, uppercase): "Quick answers", "At a glance" — quiet category markers, always Muted-coloured. The home screen's "Try one of these" label runs the same treatment half a step larger (13px) because it sits on Sun rather than Paper and needed the extra weight to hold up against a louder background.
- **Micro** (600, 11.5px, `0.09em` tracking, uppercase): the smallest label in the system — the theme-toggle's own "Appearance" heading.
- **Decorative glyph sizes** (not typography): the per-animal emoji is set at 21px in a search row and 96px as the full-bleed photo fallback. These size an emoji as a picture standing in for a missing photo, not as text, and sit outside the type ramp on purpose.
- **Mystery Animal presentation scale** (desktop only, from 860px): this one mode scales its own type with the viewport instead of holding a fixed size, because it is routinely played to an audience — someone runs it on a desktop while other people watch a compressed video of that screen, often on a phone, and the hints are the entire game. Each step is a clamp from its documented base to a ceiling reached around 1600px, since a maximised window on a 1080p panel is the most common thing it is played on: hints 16→21px, guess field 16→19px, stat values 24→32px, streak value 36→48px, result name 20→28px. The ceilings hold the same proportions as the bases — the streak stays 1.5× the other stat values, the result name stays below the photo card's Headline — so the hierarchy scales rather than reshuffling. Nothing outside this mode scales: the animal page is a reference lookup read from the viewer's own keyboard.

### Named Rules
**The One-Family Rule.** Every piece of type on the site is Onest. Hierarchy comes from size, weight, and tracking, never from switching typefaces.

**The Fine-Tuned Rule.** Sizes are tuned per component in small (0.5–1px) steps within a contextual band — micro/meta/caption cluster from 11.5–15px, body/lede from 16–18.5px, headline/subhead/display from 20px up — rather than snapped to a strict ratio ramp. A new component's size should match the nearest existing use in its band, not invent a new one; but exact half-pixel alignment to an existing token is not required the way colour or radius reuse is.

## Layout

Single-column, phone-first, capped for reading rather than stretched to the viewport. The feed maxes out at 560px; prose pages at 640px with a 62ch text measure inside that. At 620px+ the photo card's aspect ratio relaxes from portrait (4:5) to landscape (3:2) and the answer rows go two-up in a grid, but the container width stays capped — this is a mobile product that tolerates a wider window, not a desktop layout that shrinks down.

Four views inside one page, swapped by `hidden` rather than routed: `.home` (a full-bleed centered splash), the animal view (a sticky top bar over a scrolling feed), `#mysteryview`, and `#partyview`. Home and the animal view are the spine — the search box physically moves between them, living centered in the hero on `.home` and relocating into the sticky top bar once an animal is showing, so the "look something else up" affordance never disappears. The two game views are destinations reached from the nav (see Navigation below) and each own the full screen while they're up; neither is a layer over the feed.

The nav bar this implies is a late addition, and deliberately thin — it exists because four destinations stopped fitting in a corner dropdown on desktop, not because the product became a multi-page site. The lookup is still the default and the reason people arrive.

Spacing runs on an 8px-family rhythm without being a rigid grid: 8/13/20/30px show up repeatedly (chip gaps, card padding, section gaps, row padding), tightened or loosened by feel rather than snapped to a stricter scale.

Safe-area insets (`env(safe-area-inset-*)`) are respected on every fixed or bottom-anchored surface — the home screen's bottom padding, the top bar's top padding, the prose footer — so nothing sits under a notch or a home indicator.

Past 900px, the content column stops filling the window and real empty margin opens up on either side. Rather than leave that flat, `body` and `.home` both get a faint (5% opacity) tiled scatter of the site's own paw mark (`--paw-field`), ink-coloured so it flips with the theme. It's a signal that the space is a choice, not an unstyled gap — never loud enough to compete with content, and absent entirely below 900px, where there's no empty space to fill in the first place.

## Elevation & Depth

Two-tier shadow system, both warm-tinted (never pure black) and both redefined for dark mode rather than just dimmed:

### Shadow Vocabulary
- **`--shadow`** (`0 1px 2px rgba(29,30,25,.05), 0 6px 18px -10px rgba(29,30,25,.24)` light / `0 6px 18px -10px rgba(0,0,0,.8)` dark): resting elevation for in-feed images (the extra photo shots).
- **`--shadow-l`** (`0 2px 6px rgba(29,30,25,.07), 0 22px 44px -22px rgba(29,30,25,.45)` light / `0 22px 44px -22px rgba(0,0,0,.9)` dark): lifted elevation for anything that floats above the page — the photo card, dropdown menus, the report dialog, the share panel, the splash's own search box.

### Named Rules
**The Border-Or-Shadow Rule.** A surface gets a 1px `--line` border when it sits flush in the flow (cards, rows, chips, buttons), or a `--shadow-l` when it floats above other content (dialogs, menus, the photo card). Never both — edge and elevation are two different ways of saying "this is a distinct surface," and combining them muddies which one is doing the work.

## Shapes

Radius scales with size and role through a full ladder, not a fixed multiplier:

| Radius | Role | Used by |
|---|---|---|
| `5px` | Focus ring | The site-wide `:focus-visible` outline corner |
| `9px` | Toggle segment | The theme switch's active pill |
| `11px` | List row | Search suggestions, menu items, share items |
| `12px` | Compact control | The dice/shuffle button, theme-toggle track |
| `13px` | Square control | Back button, menu button, textarea |
| `14px` | Button | `.btn` and its variants |
| `15px` | Text field | The search row |
| `16px` | Floating panel | Menu, share, and suggestion panels; "no results" note |
| `18px` | Splash field | The oversized search box on the home screen |
| `20px` (`--r-card`) | Card surface | Answer card, fact card, dialogs |
| `26px` (`--r-photo`) | Photo | The hero photo card and extra shots |
| `999px` | Pill | Chips, pills, the theme toggle's active segment |

No sharp corners anywhere in the system; a new surface should round to the nearest role above rather than pick an arbitrary value.

## Components

### Buttons
- **Shape:** 14px radius (`.btn`), 48px min-height (a real touch target).
- **Secondary (default):** Card background, Ink text, Line border. This is the default — most actions (back, share, menu items, report-dialog secondary actions) are secondary.
- **Primary (`.btn-solid`):** Sun background, On-Sun text, no border. Reserved for the one action per screen that matters most (Report a problem, dialog submit).
- **Hover:** background steps to Flat (secondary) or Sun Deep (primary). **Active:** `scale(.97)` — a physical press, not a colour change.

### Chips / Pills
- **Starter chips** (home screen quick-picks): outline-only on the splash — transparent fill, Home-Ink border at reduced opacity, because the splash ground is already a strong colour and a filled chip would compete with it.
- **Answer pills** (`.pill`): filled, never outlined. Flat-bg by default; Good/Warn/Bad backgrounds when the answer has a polarity. Text always states the answer in words — colour reinforces, never substitutes.

### Cards / Containers
- **Corner:** `--r-card` (20px) for the answer-list card, fact card, and dialogs; `--r-photo` (26px) for anything photographic.
- **Background:** Card surface, 1px Line border, no shadow at rest (flush-in-flow — see the Border-Or-Shadow Rule).
- **The photo card is the exception:** it floats (`--shadow-l`, no border) because it's the one element the whole screen is built around.

### Under-Construction Panel (`.wip`)
For a feature that's reachable but not finished — currently only Party Mode's Twitch chat field. The case it exists for is a feature that works *well enough to look ready*, which is the dangerous kind: someone could put it in front of an audience before it deserves one.
- **Register:** Warn, not Bad. This is a caution about timing, not a failure — nothing is broken yet. Warn text on Warn-bg clears AA at body size in both themes (4.98:1 light, 8.38:1 dark), so the whole panel including the note is readable, not just the heading.
- **Structure:** `.wip-head` (a mark, a name, and a `.wip-tag` pushed right on `margin-left: auto`), a `.wip-note` in plain language, then the live control it's warning about. Border, no shadow — it sits flush in the setup flow (see the Border-Or-Shadow Rule).
- **Never Sun.** Warn is the palette's *other* yellow-ish register, far enough from Sun in saturation that it never reads as brand — but a solid-Sun element in the same panel would break the One-Yellow Rule outright and make a warning look like a call to action.
- **The control stays live.** The panel is a sign, not a wall: a half-built path still has to be testable. Disabling the input is a separate decision, and a louder one.
- **Third-party marks** (the Twitch glyph, `.wip-mark`) are drawn with `currentColor` like every other icon on the site, so they take the Warn tone. Shipping a vendor's brand colour would put the only off-palette colour on the site inside a warning box.

### Inputs / Fields
- **Search box** (`.searchrow`): Card background, Line border that shifts toward Ink at 40% on focus — no glow, no colour-only focus ring, just a border-strength change plus the standard 3px focus-visible outline for keyboard users.
- **Textarea** (report dialog): Paper background (one step recessed from the dialog's Card background), same focus treatment.

### Navigation
- **Top bar:** sticky, frosted (`blur(14px)` over 84%-opacity Paper) rather than opaque, so the feed is still legible scrolling underneath it. Search box lives here once an animal is showing.
- **Corner menu:** on mobile, fixed top-right on every screen, drawn as an outline button on the splash and a filled Card button everywhere else — same position, different treatment, so it reads as "the same control" without breaking the splash's flatness. It opens a dropdown holding every option, including the three links and the theme switch that desktop moves elsewhere (see `.menu-desktop-hide`).
- **Sound toggle:** its own fixed icon button (speaker, waves swapped for a mute slash on `aria-pressed`), same `.menu-btn` treatment, one slot left of the corner menu on mobile and dropped into its vacated corner on desktop — not a dropdown item, since muting is a one-tap decision made mid-sound rather than a settings change.
- **Desktop nav bar (≥860px):** the corner button and its dropdown become a single always-visible bar — no reason to hide four options behind a click when there's width to just show them. Centred at the top of the page rather than pinned to a corner, and drawn as a glass pill (translucent Card tint + `blur(18px)`, no border — the Border-Or-Shadow Rule's `--shadow-l` alone defines the edge) rather than a solid one, the same frosted language the sticky top bar already spends over the feed. Three of the four labels (About, Browse, Party) shorten for the row; Mystery Animal has no shorter form to fall back to. Mobile's dropdown has the vertical room to spell every one out in full and never sees the short form. Sound is its own fixed icon button next to the corner menu, not a dropdown item — see the Sound Toggle entry below.

### Party Mode surface
Party Mode is the one screen designed to be looked at by several people on several devices at once, and its components exist to answer questions a solo screen never raises: who else is here, what have they already tried, which one am I.
- **Leaderboard rows** (`.party-score`): a rank, an emoji, a name, and tabular-nums points. Rows are separated by a 1px Line top-border rather than boxed individually — a roster is one object, not a stack of cards.
- **"Which one is me"** (`.party-score.is-mine`): a Sun tint at 14% plus a weight step on the name, never a solid fill — the same read-only tint language the fact card uses, and the same reason (this is state, not an action, so the One-Yellow Rule keeps it off a fill).
- **Presence dot** (`.party-score-dot`, `.is-online`): a Good-coloured dot, driven by a ~12s heartbeat and a 20s window. Absence is never drawn as an error — a closed tab just stops refreshing and the dot goes out.
- **Twitch names** (`.party-score-name.is-twitch`) carry a marker rather than an icon, because a chat viewer never picked one.
- **Activity feed** (`.party-feed`): every guess, right or wrong, as a chat-style log in Muted. It exists so a room can see an answer's already been tried — its job is suppressing repetition, so it must never out-shout the round itself.
- **Icon picker** (`.party-icon-picker`): a small emoji radiogroup at join/rename. The one piece of self-expression the product offers, deliberately tiny.
- **Invite panel** (`.party-codebox`): QR, room code, and a copyable link side by side, so whichever way a person prefers to join is already on screen. It shows immediately and never blocks behind a host's setup choices.
- **`.beta-tag`:** Micro type on Flat-bg, lifted off the baseline to sit with the cap height. Used where a surface is real but still moving.

### Photo Card (signature component)
The product's one authored visual moment. A blurred, 1.3×-scaled, saturated-and-darkened copy of the photo fills the card behind the real image (`object-fit: contain`), so a landscape photo in a portrait frame gets bands of its own colour instead of losing the animal to a hard crop. The name sits directly on the photo, bottom-aligned over a gradient scrim, so the first thing on screen reads as one object (an animal with its name), not two stacked elements. It arrives with the `deal` animation — lift, settle, uncover top-down — the single moment of drama the whole system allows itself.

### Emoji / Fallback System
Each animal carries one emoji, used only as a fallback (search-suggestion leading glyph, and the photo card's placeholder before/if a real photo fails to load) — never as a substitute for the photographic hero image, which always comes from a live Wikipedia fetch when available. Default fallback is 🐾.

## Do's and Don'ts

### Do:
- **Do** keep `--sun` and `--on-sun` identical in both themes — they are the one deliberately fixed pair.
- **Do** mix new neutrals from `--ink`, never introduce a flat hue-less grey.
- **Do** state every pill's answer in words before adding colour.
- **Do** give floating surfaces `--shadow-l` and flush surfaces a `--line` border — not both.
- **Do** respect `env(safe-area-inset-*)` on any new fixed or bottom-anchored surface.
- **Do** define new dark-mode tokens in both the `prefers-color-scheme` block and the `[data-theme="dark"]` block — they must move together or the toggle and system-default drift apart.

### Don't:
- **Don't** add a second typeface. Hierarchy comes from Onest's weight/size/tracking range, not a display face.
- **Don't** let more than one solid-Sun element appear on a single non-splash screen.
- **Don't** add a third authored animation moment. The card `deal` (animal view) and the paw stamp (splash) are the two beats this system spends, each scoped to a screen the other never appears on; everything else stays quiet (`rise`, scale-on-press, the `pulse` loading indicator on the photo fallback).
- **Don't** use emoji as the primary hero image — it's a fallback for a missing or unloaded photo only.
- **Don't** reach for a glow, gradient text, or a bounce easing — arrivals use `--ease` (`cubic-bezier(.16, 1, .3, 1)`), a confident settle with no overshoot. The splash stamp is not an exception to this: its weight comes from where its keyframes sit (a hard accelerating fall, a squash on contact, a decreasing rebound), not from an elastic curve smeared over a single move. Cartoon physics is authored frame by frame; an overshoot easing is the shortcut that reads as one.
