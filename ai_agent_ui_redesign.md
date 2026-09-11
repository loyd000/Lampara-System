# Lampara AI — UI Redesign Implementation Plan

## Overview

The AI assistant works — this is a pure look-and-feel pass, not a functionality change. Nothing about `useAgent`, the tool loop, prompt caching, or `/api/agent` changes here; this plan only touches `AgentFab.tsx`, `AgentPanel.tsx`, and `AgentMessage.tsx`.

**The ask:** a floating conversation with no container — no card, no panel, no bordered box. The background blurs, and the messages just float on top of that blur.

---

## What's there now, and why it reads wrong

`AgentPanel.tsx` today is a conventional chat-app drawer: a Radix Dialog styled as a bottom sheet on mobile (80vh, `rounded-t-2xl`, a visible top border) and a right-edge panel on desktop (400px, full height, a visible left border) — `glass-modal` gives it a frosted background, but it's still very much *a box*: a header bar with a title and icon buttons, a bordered scroll region, a bordered input form pinned to the bottom. `AgentMessage.tsx` renders classic chat bubbles — solid-colored rounded rectangles, user messages in `bg-primary`, AI messages in `bg-secondary`, each with hard corners and a tail-like `rounded-br-sm`/`rounded-bl-sm`.

That's a perfectly normal chat UI. It's also indistinguishable from a support-widget or a messaging app — nothing about it feels like it's part of *this* app, or like an AI feature specifically. The container is doing all the visual work; the conversation itself has no room to feel light or "conjured."

---

## Direction: a full-viewport floating overlay

Two ways to interpret "no container, just blur the background." Recommending the first.

### Variant 1 — Full-screen centered overlay (recommended)

Think macOS Spotlight, Raycast, or Linear's Cmd+K palette — but for a conversation instead of a search list. The entire viewport gets a backdrop blur (not the current flat `bg-black/40` scrim — an actual `backdrop-blur-xl` over a much lighter tint, so the app underneath is legible-but-soft, not blacked out). Messages appear as a vertically-stacked column, roughly centered, no visible edges — text just sits on the blur. The input is a floating rounded pill near the bottom of the screen, not a full-width bordered bar.

This drops the "drawer anchored to an edge" idea entirely and unifies mobile and desktop into one layout — the FAB opens the same floating overlay everywhere, just working within whatever viewport it's on. It's the more literal read of "floating convo, no container," and it's also the pattern with the most prior art to draw from, which matters for polish quality.

### Variant 2 — Borderless edge region (lighter touch)

Keep roughly where the panel lives today (right side on desktop, bottom on mobile — matching where the FAB already sits) but drop the panel's visible edges: the blur fades in from that side via a gradient mask instead of a hard rectangle border, and messages float within that region without a bounding box. Closer to today's structure, so less rework — but a gradient-masked `backdrop-filter` is a genuinely fussier effect to get looking right (mask-image support, blur-edge softness, perf), and it still reads more like "a panel with the edges sanded off" than "floating," which isn't quite what was asked for.

**Recommendation:** Variant 1. It's the more honest interpretation of the ask, it's simpler to build well, and it gives mobile and desktop the same design instead of two variations to maintain.

---

## What changes, concretely

### The backdrop
`DialogPrimitive.Overlay` stays (still a real Radix Dialog underneath — see Accessibility below) but restyles from a flat dark scrim to `backdrop-blur-xl` over a soft tint. This is also where `prefers-reduced-transparency` needs a fallback: some users have that OS setting on, and a heavy blur ignoring it is a real accessibility miss, not just a nice-to-have — fall back to a more opaque, unblurred scrim for those users the same way `AppLayout.tsx` already respects `useReducedMotion` for its page-transition animation.

### The messages
`AgentMessage.tsx` drops the bubble backgrounds and border-radius entirely. User and AI turns need a different way to read apart without a colored fill — options, roughly in order of how much visual weight they add:
- Alignment only (user right, AI left) with no other distinction — the lightest touch, but relies entirely on position, which can be ambiguous on a narrow phone screen.
- Alignment + the existing small Sparkles avatar glyph on AI turns only (already present today, just currently sitting next to a bubble instead of bare text).
- A subtle weight/color shift — e.g., the user's own words slightly muted, the AI's response full-strength — so even a single line reads correctly out of context.

Markdown rendering (`react-markdown`, already wired up) stays as-is; only the *frame* around it changes. The inline-code chip style (`bg-current/10`) can stay since that's independent of the outer bubble.

### The input
Replaces the current bordered `<form>` bar with a floating rounded-full pill — closer to a search box than a chat input bar — positioned near the bottom of the screen, its own soft shadow/glass backing rather than a hairline top border spanning the full width.

### Chrome (close / clear)
Losing the header bar means losing its title and its two icon buttons. A couple of small floating icon-only controls (close, clear-conversation) top-right — no background box around them, so they don't quietly reintroduce "a panel" — plus the usual Escape-to-close and click-on-the-blurred-backdrop-to-close, which a Dialog gives for free.

### Scrolling with no visible edges
A hard `overflow-y-auto` cutoff looks wrong once there's no container border to justify it. The fix is a mask-image fade at the top (and bottom, above the input pill) of the message column, so older text softens away instead of getting clipped by an invisible wall — reinforces the floating/ephemeral feel instead of fighting it.

### Motion
Sliding in from an edge doesn't make sense once there's no edge to slide from. A materialize-style entrance — blur, scale, and opacity resolving together, roughly centered — reads as "conjured" rather than "slid open," matching the direction the loaded `apple-liquid-glass` skill in this project already documents for interactive overlay layers (its `motion.md`). Worth actually following that skill's guidance when this gets built, including its reduced-motion handling — it's already set up for exactly this kind of surface.

### The FAB
Not strictly required to change, but worth a look once the panel itself feels more ephemeral — a solid-filled circular button might read as visually heavier than everything it now summons. A lighter-weight or glowing/pulsing trigger would match better; flagged as optional polish, not core to this redesign.

---

## What does NOT change

- `useAgent`, `runAgentTurn`, the tool loop, prompt caching, `/api/agent` — none of it. This is styling and layout only.
- The Dialog underneath stays a real Radix Dialog. "No container" is a visual statement, not a structural one — focus trapping, Escape handling, and ARIA roles all keep working exactly as they do today. Losing the visible box must not mean losing keyboard/screen-reader behavior.
- `AgentChatMessage`/markdown rendering data flow — only the wrapper styling around rendered markdown changes.

---

## Phased rollout

**Phase 1 — Backdrop and message styling.** Swap the scrim for a real blur, strip the bubble containers from `AgentMessage.tsx`, land on one of the "tell user/AI apart without a fill color" options above. This alone gets most of the way to the ask and is low-risk since nothing structural moves.

**Phase 2 — Layout restructure.** Move from the edge-anchored drawer to the full-screen centered overlay (Variant 1), including the floating input pill and the fade-masked scroll region. This is the bigger rework — worth doing as its own pass after Phase 1 confirms the visual direction feels right.

**Phase 3 — Polish.** Materialize-in motion, reduced-transparency/reduced-motion fallbacks, the FAB restyle, perf-checking the full-viewport blur on a lower-end Android device (backdrop-filter over a busy page underneath is not free — worth actually testing on real hardware, not just a fast dev machine, before calling this done).

---

## Open questions

> [!IMPORTANT]
> **Full-screen takeover, or a lighter overlay you can still see past?** Today the panel is a modal — the app behind it is inert while it's open. A "floating, blurred" aesthetic could still be fully modal (Variant 1 as described) or could lean into feeling less blocking — e.g., dimmer blur, page behind it still faintly interactive. Affects both the visual weight and whether existing modal-close behavior (Escape, click-outside) stays exactly as-is.

> [!NOTE]
> **How should user vs. AI turns be told apart without bubble colors?** The three options above (alignment only / alignment + glyph / weight-and-color shift) are a real trade-off between minimalism and clarity, not just a stylistic footnote — worth deciding before Phase 1 rather than during it.

> [!NOTE]
> **Does long conversation history stay fully scrollable, or lean further into "ephemeral"** (e.g., only the last few turns are ever shown, older ones fade out and are gone rather than scrolled-to)? The mask-fade in this plan assumes the former (everything's still there, just visually softened at the edges) — the latter is a bigger behavioral change worth calling out explicitly if it's actually wanted.

---

## Summary

| | |
|---|---|
| **Backdrop** | Real `backdrop-blur`, not a flat scrim — with a reduced-transparency fallback |
| **Layout** | Full-screen centered floating overlay (Variant 1), not an edge-anchored drawer |
| **Messages** | No bubble fills — alignment/weight/glyph instead of colored containers |
| **Input** | A floating rounded pill, not a bordered full-width bar |
| **Scrolling** | Mask-faded top/bottom edges instead of a hard container cutoff |
| **Motion** | Materialize (blur+scale+opacity) instead of slide-from-edge |
| **Structure** | Still a real Dialog underneath — visual change only, accessibility unchanged |
| **Scope** | `AgentFab.tsx`, `AgentPanel.tsx`, `AgentMessage.tsx` only — no data/logic changes |
