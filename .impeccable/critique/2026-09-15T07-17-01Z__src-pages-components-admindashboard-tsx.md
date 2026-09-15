---
target: src/pages/_components/AdminDashboard.tsx
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:C:\\Users\\deguz\\OneDrive\\Pictures\\PROJECTS\\Lampara System\\src\\pages\\_components\\AdminDashboard.tsx"
target_fingerprint: "sha256:69e705a00b6bf5f8ae58f3b860205b5e9c80ae23c1469a8d45cede79dae259bb"
target_path: "C:\\Users\\deguz\\OneDrive\\Pictures\\PROJECTS\\Lampara System\\src\\pages\\_components\\AdminDashboard.tsx"
timestamp: 2026-09-15T07-17-01Z
slug: src-pages-components-admindashboard-tsx
closed: true
---
Method: dual-agent (A: afb3f521484c0bfc3 · B: a120da03c733b52d3)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Stat strip has no loading skeleton while `pipelineQuery` is pending (renders `value ?? "—"`); the other three panels do. |
| 2 | Match System / Real World | 4 | Domain vocabulary throughout (`STAGE_LABELS`, `getGreeting()`, activity strings like "Quote v2 approved") reads as this business's own language. |
| 3 | User Control and Freedom | 3 | Every peek panel has a "View all" escape hatch; no scope/filter controls, which is reasonable for a landing page. |
| 4 | Consistency and Standards | 3 | H1 matches DESIGN.md's One Headline Rule exactly; but "Recent Projects" and "Recent Activity" sit side by side with near-identical names, different data sources and sort orders. |
| 5 | Error Prevention | 3 | Read-only page, little to prevent — but a "Deleted project" activity row stays fully clickable into a dead route. |
| 6 | Recognition Rather Than Recall | 3 | `ACTIVITY_ICONS`/`activityTab()` cover only 5 of 8 real `activity_log.entity_type` values; `leadNote`, `leadFile`, `serviceTicket` fall back to a generic icon and the default tab. |
| 7 | Flexibility and Efficiency | 1 | No primary action anywhere on the page — lead creation lives only on `/pipeline` and `/leads`, so the single highest-frequency task has zero shortcut from the page staff open first each morning. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained per DESIGN.md's own brief (grayscale body, one accent, hairline-divided stat strip instead of four separate cards) — docked slightly for the Recent Projects/Recent Activity redundancy. |
| 9 | Error Recovery | 3 | `QueryError` is well-built but all-or-nothing: one failing query (e.g. the brand-new `activityQuery`) blanks three panels that loaded fine. `InlineQueryError` already exists for per-panel isolation and isn't used here. |
| 10 | Help and Documentation | 2 | No help affordances, but all three empty states are well-written and contextual rather than a bare "No data." |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** Not a copy-pasted admin template — it's genuinely lived-in. `STAGE_LABELS`/`STAGE_COLORS` are shared from `constants.ts` and reused verbatim everywhere the pipeline appears. A code comment on `StatCell` documents a real fix: this dashboard's stat layout used to visually disagree with `FieldDashboard`'s own version until someone caught it. The `"Deleted project"` fallback for a vanished lead in the activity feed, and the removed-and-documented "stale leads" alert on `Upcoming`, are the kind of specific decisions a template author never makes. That said, judged as a rendered surface, the stat strip (`Users`/`TrendingUp`/`ClipboardList`/`SunMedium` icons) could sit on almost any B2B CRM — only `SunMedium` gestures at "solar." More pointedly: the one PH-specific fact this product owns per PRODUCT.md, the real barangay/city-municipality/province address hierarchy, appears nowhere on this page — "Recent Projects" shows Name/Phone/Stage/Last Activity and drops Location entirely, not even as a responsive-collapse casualty.

**Deterministic scan:** The scoped detector run (`AdminDashboard.tsx` + its direct imports) returned exactly one in-file finding, advisory severity: `text-[26px]` on `StatCell`'s numeral (line 314) is off DESIGN.md's documented type ramp (12/14/16/28px). The surrounding code comment shows this was a deliberate, cross-dashboard-consistent choice, not an accidental one-off — so this reads less like drift and more like an undocumented "stat tile" type tier DESIGN.md's ramp doesn't yet account for. No other findings touch AdminDashboard or its direct children (`Card`, `Badge`, `Button`, `Skeleton`, `QueryError` all came back clean). The broader `src/pages/_components` + `src/components` scan surfaced 7 more `design-system-font-size` advisories, all in unrelated files (`FieldDashboard.tsx`, `AgentMessage.tsx`, `date-range-picker.tsx`, `missing-config.tsx`, `stage-select.tsx`, `signin-dialog.tsx`) — out of scope for this dashboard-specific critique.

**Visual overlays:** Not available. The authenticated dashboard sits behind Supabase auth with no dev-login bypass or test credentials anywhere in this repo (confirmed by both assessments independently: a repo grep and a live navigation attempt). Assessment B reached only the public landing page and the sign-in modal — both well-built, neither is the target. No overlay or live screenshot of the actual target exists for this run; everything above is grounded in direct source review of the JSX, Tailwind classes, and conditional rendering rather than an observed render.

## Overall Impression

This is a restrained, correctly-tokened dashboard that clearly respects its own design system — the hard part (token fidelity, shared stage vocabulary, thoughtful empty/edge states) is already done well. What it's missing is sharper judgment about what this specific screen is *for*: it currently reads as a calm status mirror rather than the one page that should tell office staff what needs a human today. The single biggest opportunity is closing the gap between "here's what's scheduled" (which `Upcoming` already covers) and "here's what's stuck and needs you" (which nothing on the page covers anymore, per the dashboard's own code comment documenting that the prior version did this and was cut).

## What's Working

1. **The stat strip is one hairline-divided panel, not four separate shadowed cards** — a direct, correct application of DESIGN.md's Shadow-Not-Border Rule, and a genuine resistance to the generic-template instinct to box every number individually.
2. **Defensive, specific edge-case handling** — the `"Deleted project"` fallback when an activity row's lead no longer exists, with a comment explaining it's a narrow race rather than a routine path, is the kind of case most teams skip entirely.
3. **Token fidelity is exact, not approximate** — `--shadow-sm`, `--border: rgba(0,0,0,0.07)`, `--primary: #0071e3`, and the full dark-mode remap in `index.css` match DESIGN.md's documented values to the letter.

## Priority Issues

**[P1] One failing query blanks the entire dashboard, including panels that loaded fine.**
*Why it matters:* `pipelineQuery.isError || leadsQuery.isError || calendarQuery.isError || activityQuery.isError` replaces the whole page with a full-page `QueryError` the moment any one of the four queries fails — including `activityQuery`, the newest and least-tested of the four. Office staff running the pipeline all day will hit ordinary network blips; when they do, they lose Recent Projects and Upcoming along with whatever actually broke, even though those two loaded fine.
*Fix:* Gate each card on its own query's `isError` using the `InlineQueryError` component that already exists in `query-error.tsx` for exactly this case. Reserve the full-page `QueryError` for the one query the whole page can't function without.
*Suggested command:* `/impeccable harden`

**[P1] Every drill-down row is keyboard-unreachable — Sam (accessibility-dependent user) cannot activate any of them.**
*Why it matters:* `<tr onClick={...}>` in Recent Projects and `<li onClick={...}>` in both Upcoming and Recent Activity carry no `role="button"`, `tabIndex`, or `onKeyDown` handler. A keyboard-only or screen-reader user tabbing through the page skips every row on a screen whose entire content is three lists of clickable rows — total functional exclusion, not degraded experience. The icon chips that distinguish an inspection from an installation from a contract event also carry no `aria-label`, so the distinction is icon-shape-only and invisible to a screen reader; the `Skeleton` states carry no `aria-live`/`aria-busy`, so loading is silent.
*Fix:* Make each row a real interactive element (button or `role="button"` + `tabIndex={0}` + `onKeyDown` for Enter/Space), add `aria-label` to the icon-only kind indicators, and mark the loading regions `aria-busy`.
*Suggested command:* `/impeccable audit`

**[P2] No quick action for the highest-frequency daily task.**
*Why it matters:* Lead creation lives only on `/pipeline` and `/leads`. Nothing on the page admins open first every morning lets them start a new lead without navigating away — a real efficiency tax paid many times a day, by every admin/superadmin, for the single most common action in the product.
*Fix:* Add a primary "New Lead" action near the header, using the primary-button spec DESIGN.md already defines but this page doesn't use.
*Suggested command:* `/impeccable shape`

**[P2] The "what needs attention" signal was removed and never replaced.**
*Why it matters:* A code comment on `Upcoming` documents that a prior stale-leads alert was deliberately dropped once Reports was cut, and `Upcoming` — a pure schedule peek — took its place. But a calendar of confirmed inspections/installations answers a different question than "which leads have gone quiet and need a push." The dashboard now shows what's already scheduled, not what's stuck — arguably the more actionable morning signal for a sales tool, and the thing this exact page used to surface.
*Fix:* Either restore a lightweight "no activity in N days" indicator, or treat the absence as a deliberate, documented product decision rather than an unintended byproduct of the Reports removal.
*Suggested command:* `/impeccable shape`

**[P3] Recent Activity's icon/tab mapping covers only 5 of 8 real activity types.**
*Why it matters:* `ACTIVITY_ICONS` and `activityTab()` both switch on `lead | survey | quote | contract | installation`; the schema's real `entity_type` values also include `leadNote`, `leadFile`, and `serviceTicket`. Those three fall back to a generic icon and, on click, land on the lead's default tab instead of Notes/Files/Service. Service tickets specifically are post-install warranty work — a first-class PRODUCT.md workflow — rendered visually identical to a routine stage change on the one feed built to surface it.
*Fix:* Extend both maps to cover every `entity_type` the schema actually logs.
*Suggested command:* `/impeccable harden`

## Persona Red Flags

**Alex (Power User):** Gets no acceleration for living here all day. No shortcut to create a lead from the dashboard (P2 above). No way to scope Recent Projects/Recent Activity to just Alex's own leads, even though the underlying `useLeads` API already supports `assignedSalesRepId` filtering — it's simply not exposed on this screen. Every reopen mid-shift means visually reconciling two overlapping "recent" lists with different sort semantics just to see what changed. The page is exactly as fast on Alex's 50th visit this week as their first.

**Sam (Accessibility-Dependent User):** Fails at the interaction level, not just visually. Cannot reach or activate a single drill-down row via keyboard (P1 above) — total exclusion from the page's entire interactive content, not degraded UX. Icon-only kind indicators carry no accessible name, so a screen reader can't distinguish an inspection from an installation. Loading states are silent with no `aria-live` region.

## Minor Observations

- `StatCell`'s `text-[26px]` numeral is off DESIGN.md's documented ramp (12/14/16/28px) — the detector caught this as advisory. The surrounding comment shows it's deliberately shared with `FieldDashboard`'s matching stat tile, so this reads as an undocumented "stat tile" tier rather than drift; worth either snapping to 28px or adding the tier to DESIGN.md.
- `Card`'s default `shadow-sm` is one tier above DESIGN.md's stated default of `shadow-2xs` "for most content cards" — a shared-component default, not specific to this file, but every card on this page inherits it.
- `STAGE_COLORS` badges use light tints (`bg-blue-100 text-blue-700`, etc.), not the "solid-fill by default" treatment DESIGN.md's Badges section describes for stage/status badges — worth reconciling the doc and the implementation either way.
- The "Deleted project" activity row (see P3 above) stays fully clickable to a dead route with no guard disabling the click.
- Recent Projects' `min-w-[380px]` inside `overflow-x-auto` means a genuinely narrow phone viewport can still force horizontal scroll inside the card even after Phone/Last Activity hide — worth checking against DESIGN.md's stated preference for progressive column-hiding over scrolling.

## Questions to Consider

- If the old stale-leads alert was worth building once, why was it removed instead of redesigned — does staff actually miss it, or has `Upcoming` genuinely replaced the job it did?
- Recent Projects and Recent Activity both claim the word "recent" on the same screen — if you covered the headers, could a new hire tell you in five seconds which is which and why both exist?
- This is the one screen staff open every morning — why does it show phone numbers and stage names but never a barangay, city, or province, when that address hierarchy is the product's own stated differentiator?
