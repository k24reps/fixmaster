---
name: FixMaster
description: Bench-instrument interface for gadget & electronics repair shops — graphite steel, safety amber, diagnostic cyan.
colors:
  safety-amber: "#f5a623"
  amber-lit: "#f7b733"
  amber-deep: "#e8920c"
  diagnostic-cyan: "#3dd9c4"
  cyan-lit: "#5fe6d4"
  graphite-base: "#0b0d10"
  graphite-app: "#111419"
  graphite-surface: "#191d23"
  graphite-raised: "#20252c"
  graphite-input: "#14181e"
  rail-chassis: "#15191f"
  rail-well: "#101318"
  rail-panel: "#1d2229"
  readout-base: "#090b0e"
  readout-surface: "#12161d"
  readout-text: "#f1f4f8"
  readout-muted: "#8b97a6"
  ink-primary: "#f1f3f6"
  ink-secondary: "#a7b0bc"
  ink-muted: "#8290a0"
  on-brand: "#1a1205"
  signal-good: "#34d399"
  signal-warn: "#fbbf24"
  signal-crit: "#f87171"
  signal-info: "#60a5fa"
typography:
  display:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "2.2rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 700
    letterSpacing: "0.07em"
  readout:
    fontFamily: "JetBrains Mono, SFMono-Regular, Consolas, monospace"
    fontSize: "1.4rem"
    fontWeight: 700
    lineHeight: 1.2
    fontFeature: "tabular-nums"
rounded:
  xs: "5px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  full: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  10: "40px"
  12: "48px"
  16: "64px"
components:
  button-primary:
    backgroundColor: "{colors.safety-amber}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
    height: "44px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.amber-lit}"
    textColor: "{colors.on-brand}"
  button-secondary:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.sm}"
    padding: "9px 18px"
    height: "44px"
  input:
    backgroundColor: "{colors.graphite-input}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "46px"
  input-focus:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.ink-primary}"
  card:
    backgroundColor: "{colors.graphite-surface}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge-brand:
    backgroundColor: "{colors.graphite-raised}"
    textColor: "{colors.amber-lit}"
    rounded: "{rounded.full}"
    padding: "4px 9px"
    typography: "{typography.label}"
  instrument-well:
    backgroundColor: "{colors.readout-base}"
    textColor: "{colors.readout-text}"
    rounded: "{rounded.lg}"
    padding: "20px 24px"
---

# Design System: FixMaster

## Overview

**Creative North Star: "The Precision Electronics Bench"**

The interface is a technician's bench, not a dashboard. Every surface behaves like a piece of shop equipment: a graphite chassis with things mounted on it, instruments that read out in monospace, status carried by lit indicators rather than by words, and seams that look machined rather than drawn. The operator is standing at a counter with a customer waiting and a device in one hand — so the system favors the glance over the read, and the exact number over the friendly approximation.

Three pillars carry the whole palette. **Graphite steel** is the neutral ground: cool, slightly blue, never warm grey and never office-paper white. **Safety amber** (`#f5a623`) is the single brand voice — the color of a machine that is powered and doing something. **Diagnostic cyan** (`#3dd9c4`) is the instrument voice — measurement, liveness, information that the machine reports about itself.

Both themes are first class and neither is a tint of the other. Dark is "Graphite Workshop"; light is "Bright Workshop Steel" — cool anodized metal, deliberately not a bright paper document. A component is finished only when it has been judged in both.

The confirmed anti-reference is generic SaaS: stock component-library chrome, a padlock glyph for a gated feature, a soft rounded card with a pastel icon standing in for content. If an element could be lifted into an unrelated product without feeling out of place, it is not finished.

**Key Characteristics:**
- Monospace for every number, ID, code, and status readout — the single strongest signal that this is instrumentation
- Status is a lit LED plus a value, never a word alone
- Colored spine on the leading edge of cards and rows, not a full colored surface
- Dotted and perforated seams instead of solid rules
- Machined radii (5/8/12/16/24px) — never fully rounded except for pills and indicators
- Two themes at equal weight, guaranteed by tokens rather than by review

## Colors

A cool graphite field with exactly two chromatic voices and a four-color signal set, all resolved through tokens so the two themes stay in lockstep.

Frontmatter values are the dark theme. The light theme re-binds the same token names; its counterparts are named below where they differ meaningfully.

"Default" here means the token layer only: bare `:root` is dark. At runtime the app follows `prefers-color-scheme` (`src/stores/theme.ts`), so a first-time visitor on a light-set OS lands in light. Neither theme is the one users see — test both.

### Primary
- **Safety Amber** (`--brand`): The brand voice and the "this is live / this is the action" color. Primary buttons, active navigation channel, the brand mark, the focus ring, the featured plan. Light theme deepens it to `#d9820a` for contrast against pale steel, and text-on-amber uses the deep bitumen `--on-brand` (`#1a1205`) in both themes — amber never carries white text.
- **Amber Lit** (`--brand-text` in dark): The readable amber for text and iconography on dark surfaces. In light theme `--brand-text` drops all the way to `--brand-900` (`#7c4d12`) because bright amber on pale steel fails contrast.

### Secondary
- **Diagnostic Cyan** (`--accent`): The instrument voice — liveness, measurement, "the machine is reporting". Online LEDs, section labels, trace lines, the "PALING LENGKAP" marker. Light theme uses `--accent-600` with a much darker text pair (`#08645d`).

### Tertiary
The **signal set** — a fixed four-color status vocabulary shared by every module, so a green means the same thing on the dashboard as it does in inventory.
- **Signal Good** (`--success`): completed, paid, in stock, present.
- **Signal Warn** (`--warning`): needs attention, running low, awaiting confirmation.
- **Signal Crit** (`--danger`): failed, overdue, out of stock, destructive action.
- **Signal Info** (`--info`): neutral in-progress state and non-urgent classification.

### Neutral
- **Graphite Base / App / Surface / Raised** (`--bg-base` → `--bg-elevated`): A four-step tonal ladder that does the work shadows do elsewhere. Light theme inverts the ladder to cool steel (`#d7dee4` → `#ffffff`), and notably `--bg-base` is *darker* than `--bg-app` in light mode — recessed wells stay recessed in both themes.
- **Rail family** (`--rail-bg`, `--rail-well`, `--rail-panel`, `--rail-control`): A separate chassis palette for the app shell so the sidebar reads as mounted hardware rather than as another card.
- **Readout family** (`--readout-base`, `--readout-surface`, `--readout-text`, `--readout-muted`): **Theme-independent.** These six values are defined once and never re-bound per theme — this is what makes an instrument well look identical in dark and light.
- **Ink** (`--text-primary`, `--text-secondary`, `--text-muted`): Never pure white or pure black in either theme.
- **Grid line** (`--grid-line`): The faint blueprint/PCB grid on `body::before` at 30px pitch, plus two large radial washes of amber and cyan. This is the bench surface everything else sits on.

### Named Rules

**The Token-Only Rule.** No hex, `rgb()`, or `hsl()` literal ever appears in feature CSS. Every color resolves through `var(--token)` from `src/styles/tokens.css`. This is not a style preference — it is the mechanism that guarantees both themes are correct without anyone checking. The one sanctioned exception is the readout family, which is *already* theme-independent by design.

**The One Amber Rule.** Safety amber marks the single most important action or the single active state in a view. Two ambers competing on one screen means neither is the answer. Cyan is not a second brand color to reach for when amber feels repetitive — it means "instrument reading", and using it decoratively drains it.

**The Lit-Signal Rule.** A status is an LED plus a value, never a word alone and never a color alone. The LED is 7–9px, filled with the signal color, and carries a matching `box-shadow` glow at 6–9px blur. A colorblind operator reads the value; a glancing operator reads the light.

## Typography

**Display Font:** Space Grotesk (fallback Inter, sans-serif)
**Body Font:** Inter (fallback system sans)
**Readout / Label Font:** JetBrains Mono (fallback SFMono-Regular, Consolas, monospace)

**Character:** Space Grotesk's slightly mechanical letterforms give headings the feel of equipment silkscreen without tipping into novelty; Inter carries prose invisibly; JetBrains Mono is the system's actual voice. The mono is not a costume for "technical" — it is used where digits must align and be compared, which on this product is most of the screen.

### Hierarchy
- **Display** (Space Grotesk, 700, `--text-3xl` 2.2rem, lh 1.25, ls -0.01em): Page titles and landing headlines. On marketing surfaces it scales with `clamp()`; in-app it does not.
- **Headline** (Space Grotesk, 700, `--text-xl` 1.4rem): Section heads inside a page.
- **Title** (Space Grotesk, 700, `--text-md` 1rem): Card headers and modal titles.
- **Body** (Inter, 400, `--text-base` 0.9375rem, lh 1.55): Prose, form values, list content.
- **Label** (JetBrains Mono, 700, `--text-xs` 0.75rem, ls 0.07em, uppercase): Field labels, stat captions, table headers, section markers. The uppercase mono micro-label is the system's most repeated gesture.
- **Readout** (JetBrains Mono, 700, tabular figures, 1.4rem–2.8rem): Money, counts, durations, IDs, timestamps. Always tabular so columns of numbers align.

### Named Rules

**The Mono Numbers Rule.** Every number a user might compare, verify, or read aloud is monospace with tabular figures: currency, quantities, service IDs (`FM-0241`), phone numbers, times, percentages. Proportional digits in an operational readout is a defect, not a preference.

**The 12px Floor Rule.** No leaf text that carries information or an action goes below 12px at the default 16px root. Non-interactive ornament may be smaller. This is an ergonomic contract, not a suggestion — the operator is reading at arm's length under shop lighting.

The floor governs the **touch/counter scene**, which is what it was written for. It binds every `px`/`rem` value a component chooses, and it binds the shipped default on touch devices. It does **not** bind the app-wide zoom control: on a pointer-precise device the shell starts at 80% (`applyDeviceDensityDefault` in `src/stores/zoom.ts`), which scales the whole document and takes mono labels to 9.6px. That is a deliberate product decision for the desk scene — closer reading distance, mouse instead of glove — and the zoom control is the escape hatch in both directions. Never design a component *to* the zoomed size; design to the floor, then let zoom scale it.

## Layout

The app shell is a **floating chassis**: a fixed instrument rail on the left (`--sidebar-width` 278px, collapsing to `--sidebar-collapsed` 78px) inset 14px from the viewport edge, with a sticky topbar (`--topbar-height` 76px) inset to match. Content is capped at `--content-max` (1380px) and centered. The inset is exposed as `--app-inset-top` so a shell that mounts its own chrome above the app (the `/demo` faceplate) can push the fixed rail below it instead of covering it.

Spacing runs on a 4px base (`--space-1` 4px → `--space-16` 64px). Density is hybrid: controls are 44px (`--control-h`), table rows 54px (`--row-h`) or 44px compact (`--row-h-compact`).

Responsive behavior is task-driven rather than width-driven. At ≤720px the four primary destinations plus a **Lainnya** control live in a safe-area-aware bottom navigation and the hamburger disappears, so there is never more than one navigation model on screen. At 721–1024px the sidebar becomes a floating drawer. A service table is used only when every important column is legible; below that it becomes job cards — two columns on tablet, one on phone.

### Named Rules

**The Container Query Rule.** Any breakpoint that decides *fits / does not fit* — table versus cards, one column versus two — must be a `@container` query, never `@media`. Two measured reasons: the app's own zoom control (`src/stores/zoom.ts`) adds layout space without moving media queries (`em` units do not help; they resolve against the initial font size), and the sidebar appears at ≥1025px so content space *shrinks* as the viewport widens, producing a broken band no single `max-width` can express. Media queries remain fine for pure taste. Derive the threshold from *measured* min-content, not a round number.

**The Zoom-Aware Viewport Rule.** Any element sized to the screen uses `--app-vh`, never bare `100vh`/`100dvh`. The CSS `zoom` property scales viewport units, so a raw `100dvh` shell leaves dead space below 100% zoom and overflows above it.

## Elevation & Depth

Depth is carried primarily by **tonal layering**, not by shadow. The four-step graphite ladder plus the separate rail and readout families do the work that shadows do in flatter systems — a surface is "above" because it is lighter (dark theme) or brighter and less blue (light theme), not because it casts.

Shadow is therefore reserved and meaningful. It says one of exactly two things: *this is mounted hardware* or *this just lifted in response to you*. Content surfaces are flat at rest.

### Shadow Vocabulary
- **Chassis mount** (`--rail-shadow`: `0 6px 8px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.04)`): The sidebar rail only. The inset highlight is the top bevel of a mounted panel.
- **Bench tight** (`--shadow-bench-tight`: `0 6px 8px rgba(0,0,0,0.34)`): Objects resting *on* the bench — the repair ticket, the product frame. Short throw, close contact.
- **Lift** (`--shadow-md`: `0 10px 30px rgba(0,0,0,0.34)`): The hover response of an interactive card, paired with `translateY(-2px)`.
- **Overlay** (`--shadow-lg`: `0 24px 70px rgba(0,0,0,0.52)`): Modals, sheets, and the featured plan plate. Genuinely floating above everything.
- **Powered** (`--shadow-brand` / `--shadow-brand-tight`): Amber-tinted glow under primary buttons and brand-active elements. This is the only colored shadow in the system and it means "energized", not "important".

### Named Rules

**The Mounted-or-Flat Rule.** A surface earns a shadow by being mounted chassis (rail, topbar), a true overlay (modal, toast, dropdown, bottom sheet), or an object resting on the bench (ticket, frame). Everything else is flat at rest and may acquire `--shadow-md` only as a hover response. A resting content card with a drop shadow is drift.

**The Ambient Bench Rule.** The blueprint grid and its two radial washes on `body::before` are the system's only ambient depth. Individual sections do not get their own decorative glow; they get a tonal step or a border.

## Shapes

Radii are machined rather than soft: `--radius-xs` 5px for tags and focus outlines, `sm` 8px for buttons and inner controls, `md` 12px for inputs and inner panels, `lg` 16px for cards and chassis, `xl` 24px for full-width plates. `--radius-full` (999px) is reserved for pills, LEDs, and indicator dots — nothing rectangular becomes a capsule.

Borders are structural and always present: `--border` for quiet internal division, `--border-strong` for a real edge, `--border-brand` for an active or focused edge. A card without a border is unfinished, because in light theme the tonal step alone is too subtle to define the object.

Three recurring silhouettes define the form language:

- **The diagnostic spine** — a 3px vertical bar inset 14–16px from top and bottom on the leading edge of a card or row, rounded only on its outer end (`0 var(--radius-full) var(--radius-full) 0`), filled with a gradient of the relevant signal color. It classifies without tinting the whole surface.
- **The dotted seam** — `1px dotted` dividers for card headers, table separators, and section breaks, in place of solid rules. Perforation reads as a manufactured edge.
- **The instrument well** — a recessed dark panel drawn from the theme-independent readout palette, optionally with a 2px `--gradient-brand-accent` bezel and a 3px scanline texture.

### Named Rules

**The Spine, Not the Fill Rule.** Category and status are carried by the 3px leading spine, never by flooding a card or row with a tinted background. A `border-left` heavier than 3px, or a colored surface standing in for the spine, is a different system.

**The Earned Well Rule.** The instrument well is not a surface anyone may reach for. It is earned by content that is genuinely an instrument reading — a live operational value the operator checks at a glance (net profit, the flow of a job through states, the plan that is the recommended answer) — and it is budgeted at **one per viewport**. A long scrolling page may carry one per chapter, provided two are never in view together. Its power is scarcity: a screen showing three wells has none. When a panel merely needs to feel important, it gets a tonal step and a border instead.

## Components

### Buttons
- **Shape:** Machined corners (`--radius-sm` 8px), minimum height 44px (`--control-h`), never a capsule.
- **Primary:** `--gradient-brand` (135° amber ramp) with deep bitumen text (`--on-brand`) and the amber `--shadow-brand` glow. Padding 9px 18px at default size.
- **Hover / Focus:** Rises 2px (`translateY(-2px)`) over `--dur-fast` (0.13s) with `--ease-out`; press returns with `translateY(1px) scale(0.99)` so the control feels physically depressed.
- **Secondary:** Solid `--bg-surface` with a `--border-strong` edge that shifts to `--border-brand` on hover.
- **Ghost:** Transparent with `--text-secondary`; hover fills with `--bg-hover` and promotes text to primary.
- **Danger:** Solid `--danger` with `--on-solid` white — the one place white text on a saturated fill is correct.
- **Disabled:** `opacity: 0.55` plus `pointer-events: none`. No separate disabled palette.

### Badges
- **Style:** Full pill (`--radius-full`), mono uppercase at 12px with 0.045em tracking, soft tinted background (`--*-soft`), matching text token, and a border mixed at 30% of the signal color.
- **State:** An optional 7px `currentColor` dot leads the label — the badge's own LED.
- **Variants:** neutral, brand, success, warning, danger, info. There is no "outline" or "solid" axis; the tint-plus-border treatment is the only badge.

### Cards / Containers
- **Corner Style:** `--radius-lg` (16px).
- **Background:** `--bg-surface` under a 145° sheen — `linear-gradient` of `--text-primary` at 2.5% fading out by 38% — which gives the panel a faint machined top-light in both themes.
- **Shadow Strategy:** Flat at rest per the Mounted-or-Flat Rule; `--shadow-md` plus a 2px lift on `.interactive` hover only.
- **Border:** Always `1px solid --border-strong`.
- **Header:** 18px/20px padding closed by a `1px dotted` seam; the optional header icon is a 30px `--radius-sm` tile in `--brand-soft` with a `--border-brand` edge.
- **Internal Padding:** `--space-6` (24px) body, dropping to `--space-4` (16px) at ≤640px.
- **Accent:** Optional diagnostic spine in brand / success / warning / danger / info.

### Inputs / Fields
- **Style:** Recessed — `--bg-input` sits *below* the card surface, with `--border-strong` and `--radius-md` (12px), 46px tall.
- **Label:** Mono uppercase 12px at 0.07em in `--text-muted`, sitting 7px above the field.
- **Focus:** Border becomes `--brand`, background lifts to `--bg-surface`, and a 3px `--ring` appears. The field brightens as it activates, like a powered channel.
- **Error:** `--danger` border with a 22% danger-tinted ring; message in `--danger-text` at 12px.

### Navigation
- **Style:** Sidebar items are instrument channels — a 32px icon cell, a sans label, and a right-aligned live readout (LED plus mono count). Minimum height 48px, `--radius-sm`.
- **Active:** `--rail-active` fill, `--border-brand` edge, an inset top highlight, and the icon cell inverting to a solid `--brand` tile with white-on-amber iconography.
- **Hover:** Lifts to `--rail-panel` with the icon cell tinting to `--accent-soft`.
- **Gated (plan-locked):** A dimmed channel plus a mono "PRO" badge with a brand LED. **Never a padlock glyph.**
- **Collapsed:** Labels and counts drop away, leaving a 78px LED tower where each channel's status light is still readable at a glance.
- **Mobile (≤720px):** Bottom navigation with four destinations plus **Lainnya**, which opens a control-deck bottom sheet holding secondary menus, branch switching, business identity, and sign-out.

### Instrument Well (signature)
- **Style:** `--readout-base` under a `radial-gradient` of `--readout-surface`, optionally wrapped in a 2px `--gradient-brand-accent` bezel via `background-clip: padding-box, border-box`.
- **Texture:** A 3px-pitch `repeating-linear-gradient` scanline at 3% `--readout-text` — the CRT tell that makes it read as a screen rather than a dark card.
- **Type:** Mono throughout. Value in `--readout-text`, labels in `--readout-muted`, both fixed across themes.
- **Where it appears today:** the dashboard net-profit panel, the landing workflow band, the featured Pro plate. Any fourth use is a design decision, not a default.

### Browser Surfaces
Themed rather than left to the browser: a 9px scrollbar with a `--border-strong` thumb on a transparent track, `--brand-soft` text selection with primary ink, and a 3px `--focus-ring` outline at 3px offset with a 5px radius. `prefers-reduced-motion` collapses every animation and transition to 0.01ms.

## Do's and Don'ts

### Do:
- **Do** resolve every color through `var(--token)` from `src/styles/tokens.css`, and judge every new component in both themes before calling it done.
- **Do** set numbers in JetBrains Mono with tabular figures — money, counts, IDs, times, percentages.
- **Do** pair a signal color with a lit LED and a readable value, so status survives both a glance and colorblindness.
- **Do** classify cards and rows with the 3px diagnostic spine.
- **Do** use `1px dotted` seams for internal division instead of solid rules.
- **Do** use `@container` for any breakpoint that decides whether content fits, and derive the threshold from measured min-content.
- **Do** size full-screen shells with `--app-vh`.
- **Do** keep informational leaf text at 12px or above and interactive targets at 44×44px on touch.
- **Do** give a gated feature a dimmed channel and a mono "PRO" badge with a brand LED.

### Don't:
- **Don't** hardcode a hex, `rgb()`, or `hsl()` value in feature CSS.
- **Don't** use a padlock glyph, or any stock component-library chrome, to mark a **plan-gated** feature — that gets the dimmed channel and the mono "PRO" badge. A lock icon on a genuine permission denial is a different message and stays.
- **Don't** put a drop shadow on a content surface at rest — shadow means mounted, overlaid, or just-lifted.
- **Don't** widen the colored spine past 3px or replace it with a flooded background tint.
- **Don't** place more than one instrument well on a screen, or use the readout palette for a panel that merely wants attention.
- **Don't** reach for diagnostic cyan as a second brand color when amber starts to feel repetitive — cyan means instrument reading.
- **Don't** put white text on safety amber; amber always carries `--on-brand` (`#1a1205`).
- **Don't** apply glass or `backdrop-filter` to a card sitting in a list or grid on a page that already has its own surface. Glass belongs to things that float over something: chassis (topbar, drawers, sheets, action bars, the demo faceplate), overlays, and standalone panels resting directly on the ambient grid (auth, onboarding wizard, tracking result, the summary rail).
- **Don't** set an operational number in a proportional face.
- **Don't** use emoji or a Unicode glyph where an icon belongs — icons come only through the `Icon` component.
