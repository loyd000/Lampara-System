---
name: Lampara CRM
description: A CRM built specifically for Philippine solar installation workflows
colors:
  apple-blue: "#0071e3"
  system-red: "#ff3b30"
  cool-white: "#f5f5f7"
  ink: "#1d1d1f"
  panel-white: "#ffffff"
  quiet-gray: "#e8e8ed"
  muted-gray: "#6e6e73"
  hairline: "rgba(0, 0, 0, 0.07)"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "normal"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  sm: "14px"
  md: "15px"
  lg: "16px"
  xl: "18px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.apple-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.apple-blue}"
  button-secondary:
    backgroundColor: "{colors.quiet-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.system-red}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  badge:
    backgroundColor: "{colors.apple-blue}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    padding: "2px 8px"
---

# Design System: Lampara CRM

## Overview

**Creative North Star: "The Apple Liquid Glass System"**

Lampara CRM is a tool run all day, at a desk and on a job site — not a marketing surface. The system stays restrained and high-trust: a cool grey-white ground, solid white panels that separate by soft shadow rather than a border, and exactly one accent color used sparingly. Nothing announces itself; everything is legible at a glance across a long shift.

Frost (`backdrop-filter: blur`) is reserved for the few places layers genuinely overlap — a sticky nav bar, a dialog's scrim, a popover floating over local content — never applied to a plain content panel. Elevation stays quiet and mostly structural: shadows exist for real separation and real state changes (hover, an open dialog), not as decoration layered onto every surface by default.

This is explicitly not: warm or cream "AI-generated" tones, purple gradients, heavy borders standing in for shadow, or color used decoratively to fill space. The body of the interface is grayscale; color is reserved for the one accent, for status (destructive red), and for the handful of semantic stage/status badges the pipeline itself defines.

**Key Characteristics:**
- Cool grey-white ground (`#f5f5f7`), never warm or cream
- One accent color (Apple System Blue) — hairline-restrained hierarchy does the rest
- Panels separate from the ground by shadow, not border; hairline borders are for dividers *within* a panel
- Frost only where layers actually overlap (nav, dialog, popover) — never on plain content
- Full light/dark theming, remapped 1:1 onto the same semantic tokens

## Colors

A near-monochrome palette carrying one confident accent — grayscale does the structural work, blue marks the one thing on a screen that wants a click.

### Primary
- **Apple System Blue** (`#0071e3` light / `#0a84ff` dark): The one accent. Primary buttons, links, the focus ring, the sidebar's active-item mark, chart series 1. Used sparingly — its rarity is what gives it weight.

### Neutral
- **Cool White** (`#f5f5f7`): Page ground (light mode). Never cream or warm-tinted.
- **Ink** (`#1d1d1f`): Primary text (light mode).
- **Panel White** (`#ffffff`): Card, dialog, and popover surfaces (light mode) — separated from the ground by shadow, not a border.
- **Quiet Gray** (`#e8e8ed`): Secondary fills — badges and secondary buttons sitting on a white panel.
- **Muted Gray** (`#6e6e73`): Secondary/tertiary text — timestamps, helper copy, table sub-values.
- **Hairline** (`rgba(0, 0, 0, 0.07)`): Dividers between rows and sections within one panel — not the separator between a panel and the page.
- **System Red** (`#ff3b30` light / `#ff453a` dark): Destructive actions and error states only — delete buttons, validation errors, cancelled/error badges.

### Dark Mode
Every token above is remapped rather than inverted by formula: ground `#0a0e15`, panels `#202531`, secondary/muted `#37404f`, borders `#37404f`, muted text `#667085`. The accent shifts to Apple's dark-mode system blue (`#0a84ff`) rather than reusing the light value at reduced opacity.

### Named Rules
**The One Accent Rule.** Apple System Blue is the only color used to mean "this is clickable and important." Everything else — status badges, stage colors — is a *semantic* color (success green, warning amber, etc.), never a second brand accent competing with blue for attention.

**The Shadow-Not-Border Rule.** A card separates from the page by shadow. A hairline border is only for a divider *inside* a panel (between rows, between a header and its content) — never for the panel's own outer edge.

## Typography

**Body Font:** `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif` (the OS's own native UI font on every platform, with CJK fallbacks)
**Mono Font:** `"Geist Mono", "JetBrains Mono", ui-monospace, monospace` — used for tabular numeric data (currency, counts) via `tabular-nums`, not as a display face
**Serif Font:** `"Noto Serif", Georgia, serif` — declared as a system token but not in active use anywhere in the current UI; available, not yet spent

**Character:** The native OS font at every weight the system needs, nothing imported. Numbers align in tables and stat tiles because they're set with `tabular-nums`, not because of the typeface.

### Hierarchy
- **Headline** (700, 28px, 1.15, −0.02em): Every page's `<h1>` — "Projects & Customers", "Pipeline", "Team". Identical treatment on every page in the app; this consistency is load-bearing, not incidental.
- **Title** (600, 16px, 1.35): Card and section titles — "Recent Activity", "Contract Details".
- **Body** (400, 14px, 1.5): Default text size for the whole app — table cells, form inputs, most copy.
- **Label** (600, 12px, 1.3, 0.05em, uppercase): Column headers, section eyebrows, stage/status badge text.

### Named Rules
**The One Headline Rule.** Every page's top-level heading uses the exact same 28px/700/−0.02em treatment. A page never invents its own hero size.

## Layout

Two container widths, chosen by content shape: `max-w-7xl` (grid/table pages — Projects, Team) and a narrower reading width for single-column detail views. The Pipeline board is the deliberate exception — it drops the house container to use the full viewport width for its horizontally-scrolling columns.

Spacing runs on Tailwind's 4px scale (`--spacing: 0.25rem`), applied consistently: `gap-1.5`/`gap-2` inside a control cluster, `gap-3`/`gap-4` between related fields, `gap-6` between distinct sections. Page padding is `p-6` (24px) on desktop, tightened on mobile.

Responsive collapse is real, not cosmetic: table columns hide progressively at `sm`/`md`/`lg` breakpoints (Location → Property Type → Design Type, in that order) rather than shrinking illegibly; the sidebar nav becomes a floating bottom tab bar under `md`; dialogs go full-bleed-ish and stack their footer buttons vertically on narrow screens.

## Elevation & Depth

Structural, not decorative. Cards separate from the page ground with the smallest shadow tier that does the job (`shadow-sm`, `shadow-2xs`) — depth exists to say "this is a separate surface," not to add visual richness. A `--shadow-lg`/`--shadow-xl`/`--shadow-2xl` scale exists in the tokens for real elevation moments (an open dialog above its scrim, a floating action button), but everyday content panels stay at the lower end of the scale by default rather than reaching for a heavier tier.

Every shadow in the system is two-layer (a tight, dark, low-spread "contact" shadow plus a soft, faint, wide "ambient" shadow) rather than one hard shadow — this is what keeps even the heavier tiers reading as soft, not as a UI element visibly popping off the page.

### Shadow Vocabulary
- **2xs** (`0 1px 2px rgba(0,0,0,0.04)`): The default resting shadow for most content cards.
- **sm** (`0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)`): A card that wants slightly more separation — still quiet.
- **md/lg/xl/2xl**: Reserved for dialogs, popovers, and floating elements that sit clearly above the page, not for everyday panels.

### Named Rules
**The Smallest-Tier-First Rule.** Reach for `shadow-2xs`/`shadow-sm` by default. A heavier tier is a deliberate choice for something genuinely floating above the page (a dialog, a FAB), not a way to make an ordinary card feel more important.

## Shapes

Rounded, consistently, from one `--radius` primitive (`1rem` / 16px) that every other radius token derives from via `calc()` — `sm` (14px) through `4xl` (24px). Cards and dialogs sit at `rounded-xl`/`rounded-2xl`; buttons and inputs at `rounded-md`; badges and pills at `rounded-full`. Nothing in the interface is sharp-cornered; nothing is aggressively rounded past what a dialog needs.

## Components

### Buttons
- **Shape:** `rounded-md` (15px)
- **Primary:** Apple System Blue background, white text, `h-9` (36px) default height, `px-4 py-2`; hover dims to 90% opacity, never a color shift.
- **Secondary:** Quiet Gray background, Ink text — for the second-priority action beside a primary one.
- **Outline:** Transparent with a hairline border — for a tertiary action that shouldn't visually compete.
- **Ghost:** No background until hover, which fills with the neutral `accent` tint — for the lowest-emphasis action in a row (e.g. a row-level icon action).
- **Destructive:** System Red background, white text — delete/cancel confirmations only.
- **Focus:** A 3px ring at 50% opacity of the ring color, offset from the control — never a color-only focus indicator.

### Badges
- **Style:** `rounded-full`, `text-xs font-medium`, solid-fill by default (not outlined) for stage/status; `outline` variant available for lower-emphasis tags.
- **Semantic colors:** Each pipeline stage and each status (survey, quote, contract, installation, ticket) has its own fixed color mapping — the same stage always renders the same color everywhere in the app.

### Cards / Containers
- **Corner Style:** `rounded-xl` (18px)
- **Background:** Panel White (light) / `#202531` (dark)
- **Shadow Strategy:** See Elevation & Depth — smallest tier that separates the card from the ground.
- **Border:** None on the outer edge by default; a `border-b` hairline is used only to separate a `CardHeader` from `CardContent` within one card.
- **Internal Padding:** `px-6` horizontal, `py-6` (card) or per-row `py-3`/`py-3.5` for list rows inside a card.

### Inputs / Fields
- **Style:** `rounded-md`, hairline border (`border-input`), `h-9`, `shadow-xs` at rest — a whisper of depth, not a heavy inset look.
- **Focus:** Border shifts to the ring color plus a 3px/50%-opacity ring — same focus language as buttons.
- **Error / Disabled:** `aria-invalid` drives a destructive-tinted border and ring; disabled drops to 50% opacity and blocks pointer events.

### Navigation
- **Desktop:** Fixed left sidebar, `w-60`, active item lifts to a white pill (`bg-sidebar-accent`) against the sidebar's own slightly-off-ground background — the same "panel lifts off ground by fill, not border" logic as cards.
- **Mobile:** Sidebar collapses entirely in favor of a floating glass bottom tab bar (`.glass-nav`) — one of the few places frost is actually used, since real content scrolls underneath it.
- **Typography:** Label-scale text (12px) under each icon on mobile; body-scale (14px) beside each icon on desktop.

### Liquid Glass (signature)
The one deliberately non-flat surface treatment, and it is deliberately rare: `.glass-nav` / `.glass-modal` / `.glass-popover` apply a translucent tinted background (72–90% opacity depending on context) plus `backdrop-filter: saturate(180%) blur(16–20px)`, used *only* where a fixed/sticky surface genuinely sits above scrolling or stacked content — the top nav bar, a dialog's own chrome, a popover. A plain card or page section never gets this treatment; frost that isn't covering something moving underneath it is just a slower, blurrier white box.

## Do's and Don'ts

### Do:
- **Do** use exactly one accent color (Apple System Blue) for anything meant to read as "clickable and important."
- **Do** separate a panel from the page with shadow, reserving hairline borders for dividers *within* a panel.
- **Do** reach for the smallest shadow tier that does the job; save the heavier tiers for things genuinely floating above the page (dialogs, popovers, a FAB).
- **Do** keep every page's `<h1>` at the same 28px/700/−0.02em treatment — this consistency is a feature, not an oversight to "improve."
- **Do** apply frost (`backdrop-filter`) only to a fixed/sticky element that has real scrolling or stacked content moving underneath it.
- **Do** give every pipeline stage and status its own fixed, consistent color across every view it appears in.

### Don't:
- **Don't** introduce a second brand accent color competing with Apple System Blue — a second "important" color makes neither one mean anything.
- **Don't** apply `.glass-*`/`backdrop-filter` to a plain content card or section — it's reserved for nav bars, dialogs, and popovers specifically.
- **Don't** reach for warm/cream backgrounds, purple gradients, or heavy black borders — these read as generic "AI-generated" UI, the explicit anti-reference for this system.
- **Don't** use a heavier shadow tier than the content needs just to make an ordinary card feel more prominent.
- **Don't** invent a one-off radius value — every corner in the system derives from the single `--radius` primitive via the existing scale.
