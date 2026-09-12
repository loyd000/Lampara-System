# UI/UX consistency audit — 10 September 2026

A read-only sweep of every page, section, dialog and shared component, looking
for non-uniform spacing/padding/margins, button clusters, and layouts that break
at narrow widths. **Nothing has been changed.** This is the work list.

Four parallel audits covered the app in slices:

| Slice | Files |
|---|---|
| App shell & dashboards | layout, sidebar, mobile navbar, Index, NotFound, auth callback, both dashboards, profile |
| List & board pages | leads, pipeline, calendar, reports, packages, team, stage-select, global-search, query-error |
| Lead detail tabs | `[id]/page.tsx`, Contract, Installation, ServiceTickets, LeadNotes, LeadFiles, Ocular, PhotoSlots |
| Dialogs, forms, quotes | all 10 dialogs, ph-address-fields, unsaved-changes-bar, date-range-picker, QuoteBuilder, ItemPickerModal |

**Confidence:** findings marked ✅ I opened the file and confirmed myself. The
rest are as reported by the audit and are worth a glance before acting — line
numbers were correct at the time of writing, but `calendar/page.tsx`,
`InstallationSection.tsx`, `ScheduleInstallationDialog.tsx` and
`date-range-picker.tsx` have uncommitted changes in the working tree, so their
numbers will drift once those are committed.

---

## Fix order

**Pass 1 — real breakage.** Things that are broken now, not merely inconsistent.
**Pass 2 — mobile reachability.** Controls that cannot be operated on a phone.
**Pass 3 — uniformity.** Mechanical once the values in §6 are agreed.

---

## 1. Pass 1 — real breakage

### 1.1 Five more places with the "blank page" bug ✅

Only `OcularInspectionTab` guards on `isError` (it carries a comment explaining
the bug it fixed). Every section below branches on `data === undefined` only,
and every one of these hooks is a plain `useQuery` — so on error `data` stays
`undefined` forever and the skeleton never resolves. This is the same failure as
"why is the ocular inspection page blank", still live in five places.

| File | Line | Query |
|---|---|---|
| `src/pages/leads/[id]/page.tsx` | 161 | `useLead` / `useLeadProperties` — takes out the **whole page** |
| `src/pages/leads/_components/InstallationSection.tsx` | 209 | `useInstallationForLead` |
| `src/pages/leads/_components/ServiceTicketsSection.tsx` | 104 | `useTicketsForLead` |
| `src/pages/leads/_components/LeadNotes.tsx` | 103 | notes query — two skeleton bars forever on Overview |
| `src/pages/leads/_components/LeadFiles.tsx` | 156 | files query — four skeleton tiles forever |

**Fix.** Copy the shape from `OcularInspectionTab.tsx:107`:

```tsx
const q = useThing(id);
if (q.isError) {
    return <QueryError title="Couldn't load …" onRetry={() => void q.refetch()} />;
}
```

For `LeadNotes` / `LeadFiles`, `QueryError` is a whole-page component (it has its
own `p-6 max-w-7xl mx-auto` container) and would be wrong inline — use a
one-line muted message plus an `h-8 text-xs` outline Retry button instead. See
also §5.9: `QueryError`'s own typography is off-house.

### 1.2 Every dialog is the wrong width, and loses its mobile gutter ✅

`DialogContent`'s base class list ends with
`max-w-[calc(100%-2rem)] … sm:max-w-lg` (`src/components/ui/dialog.tsx:62`).
When a call site passes a bare `max-w-2xl`:

- twMerge **removes** the base `max-w-[calc(100%-2rem)]` — same utility group, no
  modifier — so the phone gutter is gone and the dialog renders edge-to-edge
  with its `rounded-2xl` corners clipped by the screen edge;
- twMerge **keeps** `sm:max-w-lg` — different modifier — and since it is emitted
  after the unprefixed class, above 640px the dialog is capped at 512px no
  matter what was asked for.

So `CreateLeadDialog` asks for 672px and gets 512px, *and* is full-bleed on a
phone. Both symptoms, one fix: move the width to an `sm:`-prefixed class.

| File | Line | Now | Change to |
|---|---|---|---|
| `CreateLeadDialog.tsx` | 110 | `max-w-2xl` | `sm:max-w-2xl` |
| `src/pages/_components/EditLeadDialog.tsx` | 160 | `max-w-lg` | `sm:max-w-lg` |
| `CreateTicketDialog.tsx` | 92 | `max-w-md` | `sm:max-w-md` |
| `CreateContractDialog.tsx` | 56 | `max-w-sm` | `sm:max-w-sm` |
| `ScheduleSurveyDialog.tsx` | 79 | `max-w-sm` | `sm:max-w-sm` |
| `ScheduleInstallationDialog.tsx` | 138 | `max-w-sm` | `sm:max-w-md` — it holds a calendar |

`PackageDialog`, `ItemPickerModal` and `cancel-lead-dialog` already do this
correctly and need no change.

### 1.3 Twelve selects render shrink-to-fit ✅

`SelectTrigger`'s base is `flex w-fit …` (`src/components/ui/select.tsx:38`).
Every trigger that doesn't pass a width renders shrink-to-content: narrower than
the sibling `Input`s, and **it changes width as the user picks options**.

Call sites with no width: `CreateLeadDialog:135,151`,
`EditLeadDialog:195,217`, `CreateTicketDialog:121,136`,
`ScheduleSurveyDialog:89`, `PackageDialog:253`,
`ph-address-fields:163,185,211`, `QuoteBuilder:530`.

**Recommended fix — change the primitive**, not the twelve call sites: set the
base to `w-full` in `select.tsx:38`. Every trigger that genuinely wants a
narrow fixed width already passes one explicitly (`leads/page.tsx` `w-44`/`w-40`,
`team/page.tsx` `w-28`/`w-32`, `stage-select.tsx` `w-32` / `min-w-0 flex-1`), and
twMerge keeps those. That `stage-select` had to compensate at all is the tell
that the default is wrong for this app. Doing it at the primitive also stops the
next new select repeating it.

### 1.4 `NotFound` is routed outside the app shell ✅

`src/App.tsx:76` — `<Route path="*" element={<NotFound />} />` sits *outside* the
`<Route element={<AppLayout />}>` block, so a mistyped URL drops a signed-in user
onto a bare `min-h-screen` page with no sidebar, no mobile nav, no theme toggle,
and one button as the only way out. Move it inside the AppLayout child routes and
give `NotFound.tsx:16` the house container (`p-6 space-y-6 max-w-7xl mx-auto`).

### 1.5 Layout that breaks at narrow widths

- ✅ **`stage-select.tsx:43,49,65`** — at `size="sm"` a fixed `w-32` select and a
  `flex-1` one sit side by side inside a **208px** pipeline card
  (`pipeline/page.tsx:155` `w-52`, minus padding), leaving the Substatus trigger
  ~42px for labels like "Installation Scheduled" plus a 16px chevron. Stack at
  `sm`: line 43 → `cn("flex items-center gap-1.5", size === "sm" && "flex-col items-stretch gap-1", className)`,
  line 49 → `size === "sm" ? "h-8 text-[11px] w-full" : "w-40"`.
- ✅ **`leads/page.tsx:178-182`** — the loading skeleton emits all 7 `<td>`s with
  only `px-4 py-3`, dropping the `hidden sm:table-cell` / `hidden md:table-cell` /
  `hidden lg:table-cell` classes the real header (165-171) and body (231-257)
  rows carry. On a phone the skeleton is a 7-column table that forces a
  horizontal scrollbar, which then vanishes as it reflows to 2 columns.
- **`team/page.tsx:164`** — pending-card actions are
  `flex items-center flex-wrap gap-1.5 flex-shrink-0`; at `sm` the card gives
  ~240px but the cluster's unshrinkable base is ~293px, so it overflows.
  `flex-shrink-0` → `min-w-0 w-full sm:w-auto` so the wrap can engage.
- **`EditLeadDialog.tsx:166`** — the form spans two `Tabs` panels and Radix
  unmounts the inactive one, so submitting with an invalid Contact field while
  the Property tab is showing renders the `FormMessage` into nothing: the button
  appears to do nothing, with zero feedback. Add `forceMount` + `hidden` to both
  `TabsContent`, or switch tab to the first error key in the submit handler.

### 1.6 Missing `min-w-0` — the overflow class that has bitten this repo before

- ✅ `FieldDashboard.tsx:351` — `<p className="font-semibold text-sm truncate">`
  inside a `flex … flex-wrap` with no `min-w-0`; `truncate` sets `nowrap`, so the
  flex item's `min-width:auto` floor is the full string width and a long customer
  name pushes past the card instead of ellipsing.
- `ServiceTicketsSection.tsx:146` — expanded ticket body is a hard
  `grid grid-cols-2` at every width with no `min-w-0` on children.
  → `grid-cols-1 sm:grid-cols-2` plus `min-w-0` per cell.
- `unsaved-changes-bar.tsx:40` — label span has no `min-w-0 truncate` while both
  buttons are `shrink-0`, so at 320–360px "Unsaved changes" wraps to two lines
  and the bar grows a row taller mid-edit.

---

## 2. Pass 2 — mobile reachability

### 2.1 Actions that literally cannot be used on a phone

- **`LeadNotes.tsx:185`** — the edit/delete cluster is
  `opacity-0 group-hover:opacity-100`. No hover on touch, so **a note's own
  author cannot edit or delete it on a phone at all**. Buttons are also `h-6 w-6`
  (24px). → `opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100`,
  and `size="icon-sm"` (32px).
- **`LeadFiles.tsx:315`** — same hover-only reveal on `RemoveButton`, both the
  floating photo variant and the row variant. Same fix; give the row variant
  `p-2` for a 32px hit area.

### 2.2 Touch targets under the 44px minimum

| File | Line | Target | Now |
|---|---|---|---|
| `ItemPickerModal.tsx` | 300-307 | unit shortcut chips | ~16px (`text-[10px] px-1.5 py-0.5`, raw `<button>`) |
| `packages/page.tsx` | 227 | expand chevron | 20px (`p-0.5` on `size-4`), beside `size-9` siblings |
| `NotificationPreferencesCard.tsx` | 66,75 | `Switch` | 32×18px, on the one page people open on a phone |
| `QuoteBuilder.tsx` | 752 | row delete | `h-7 w-7` (28px) inside an already-scrolling table |
| `AppLayout.tsx` | 66,71,72 | mobile header controls | `size-10` (40px); also override `icon-sm`/`icon` rather than using the `icon-lg` variant that already means 40px |
| `ScheduleInstallationDialog.tsx` | 174 | crew checkbox rows | 16px checkbox; also a nested `max-h-40 overflow-y-auto` inside a scrolling dialog, which traps the touch scroll gesture |

### 2.3 Mobile navbar labels can wrap

`MobileNavbar.tsx:28,32` — the label is a bare text node in a `flex flex-col`
tab with no `truncate`. For admin/superadmin there are 6 tabs sharing
`100vw − 24px`; at ≤360px each gets ~49px while "Calendar"/"Pipeline" at
`text-[11px]` measure ~45–50px. One label wraps and the whole bar grows,
shifting every icon. → wrap in
`<span className="w-full truncate text-center leading-none">`, drop to
`text-[10px]`, add `px-1` to the tab.

### 2.4 Other mobile issues

- `CreateTicketDialog.tsx:116` — the only dialog with a hard `grid grid-cols-2 gap-3`;
  at 320–360px Priority and Assign To are squeezed into ~150px columns while
  every sibling dialog stacks. → `grid-cols-1 sm:grid-cols-2 gap-3`.
- `QuoteBuilder.tsx:612-616` — fixed columns total ~768px, so the line-item table
  is entirely horizontal-scroll on a phone with no affordance that Unit Price and
  Total exist off-screen. → right-edge fade on the `overflow-x-auto` wrapper
  (line 607), or an `sm:hidden` hint line.
- `PackageDialog.tsx:191` — the dialog scrolls as a whole, so with a dozen line
  items the title *and* the Cancel/Save footer scroll out of reach.
  `ItemPickerModal.tsx:134` already shows the right pattern: `flex flex-col p-0
  overflow-hidden` on the content, `flex-1 overflow-y-auto p-6` on the body.
- `PackageDialog.tsx:355` — quantity cell packs `w-20` + `gap-1.5` + `w-16` =
  exactly 150px into a 150px grid track (`:298`, `:311`), leaving zero slack for
  focus rings. → widen to `[1.3fr_2fr_170px_36px]`, or make the inputs
  `flex-1 min-w-0`.

---

## 3. Pass 3 — the uniformity decisions

Pick one value per row, then it's mechanical.

| Thing | Values currently in use | Proposed |
|---|---|---|
| Page container | `p-6 space-y-6 max-w-7xl mx-auto` (6 of 9), `space-y-8` (AdminDashboard, team), `p-4 sm:p-6 space-y-4` (calendar), none (pipeline) | `p-6 space-y-6 max-w-7xl mx-auto` |
| Section gap | `space-y-3 / 4 / 6 / 8` | `space-y-6` |
| Card header | `pb-3 border-b` (3) vs bare `pb-3` (10) vs neither (1) | `pb-3 border-b` |
| CardContent | `p-4 space-y-3`, `p-5`, default `px-6` | `p-4 space-y-3` |
| Section button | `h-7`, `h-8`, `h-9` — **all three inside `InstallationSection` alone** | `h-8 text-xs` (the `size="sm"` default) |
| Input height | `h-9` default, `h-8` on quote surfaces, `h-10`/`h-8` mixed in one ItemPickerModal row | `h-9`; `h-10 sm:h-9` if you want the better touch size — but then promote it to the `Input` primitive rather than one file |
| Badge text | `text-[10px]`, `text-[11px]`, `text-xs` — two of them in one reports card | delete every override; `Badge`'s own default is already `text-xs` |
| Table rows | `px-4 py-3` (leads), `px-3 sm:px-6 py-3.5` (reports), `px-6 py-3.5` (AdminDashboard) | `px-4 py-3` header, `px-4 py-3.5` body |
| Column headers | plain, `font-semibold uppercase tracking-wide`, `text-muted-foreground` | the leads treatment: `font-semibold text-xs uppercase tracking-wide text-muted-foreground` |
| Icons | `w-3 h-3`, `w-3.5 h-3.5`, `size-4` (two dialects, same rendered size) | `w-3.5 h-3.5` |
| Nav text | `text-[13px]`, `text-[13.5px]` — the only two such sizes in the codebase | `text-sm` |
| Legacy class | `flex-shrink-0` next to `shrink-0` two lines away | `shrink-0` |

### 3.1 Fragmented cards — the anti-pattern the Quotes tab was rebuilt to kill

Three survivors, each a bordered box inside a bordered card:

- `ContractSection.tsx:274`, `:465`, `:526` — **three** nested bordered boxes in
  one card. Drop `rounded-lg border` from all three; separate with
  `border-t border-border pt-4`.
- `ServiceTicketsSection.tsx:120` — one `rounded-lg border` box per ticket.
  Convert to the row idiom Quotes/Ocular use:
  `cn("group -mx-4 px-4 py-3.5 …", idx > 0 && "border-t border-border")`.
- `reports/page.tsx:148` — `p-3 rounded-lg border bg-muted/20` inside a Card,
  contradicting that file's own line-46 comment. Drop the `border`; standardise
  the three tile paddings (`:142` `p-2.5`, `:148` `p-3`, `:243` `p-3`) on `p-3`.

### 3.2 Empty states and skeletons

- **Empty states — four idioms.** `Empty/EmptyHeader/EmptyMedia` primitives
  (Quotes, Ocular) vs three hand-rolled blocks: `ContractSection:243` (`size-12`
  circle, `text-sm`), `InstallationSection:212` and `ServiceTicketsSection:107`
  (`text-center py-4`, `w-6 h-6`). Move all to `<Empty className="py-8">`.
- **Skeletons that don't match their content.** Five shapes in the lead detail
  alone (`h-20`, `h-14`×2, `h-6 w-48`+`h-20`, `h-9 w-48`+`h-40`,
  `h-24 rounded-lg`×2). Worse, some collapse the card:
  `reports/page.tsx:253` is 4×`h-8` (~152px) for a pipeline card whose real
  content is ~330px, and `pipeline/page.tsx:122` renders bare `h-96 w-52` columns
  with no group header and no `border-l … pl-6`, so columns land at a different
  x *and* y once loaded. `calendar/page.tsx:145` is one `h-[60vh] rounded-lg`
  block for a `rounded-xl` grid.

### 3.3 Dark mode — accent colours with no `dark:` pair

~3.4:1 against the `#202531` dark card, under the 4.5:1 floor. Every other
accent in the app pairs one, so these are oversights, not choices:

`AdminDashboard.tsx:129` (`text-emerald-600`) · `InstallationSection.tsx:266` ·
`ServiceTicketsSection.tsx:181` (also missing `dark:hover:bg-*`) ·
`QuoteBuilder.tsx:394` (`text-amber-600`, the only unpaired accent in that file) ·
`reports/page.tsx:137-140,152` · `leads/page.tsx:226,256`.

Also `InstallationSection.tsx:41` and `ServiceTicketsSection.tsx:25,31,87,131`
still use the older `bg-<hue>-100 text-<hue>-700 dark:bg-<hue>-900/30` badge
recipe where Quotes/Ocular use
`bg-<hue>-500/15 text-<hue>-700 dark:text-<hue>-400 border-<hue>-500/30`.

---

## 4. Lead detail — section-by-section drift

The Quotes and Ocular tabs were reworked recently and are the reference. The
others were built earlier and drifted.

- `InstallationSection.tsx:194` and `ServiceTicketsSection.tsx:81` —
  `CardHeader className="pb-3"` with no `border-b`; no header rule where
  Contract/Quotes/Ocular have one.
- `ContractSection.tsx:214` — `CardContent className="p-5"` against the house
  `p-4`, which also makes the `-mx-4 px-4` row bleed impossible here.
- `InstallationSection.tsx:206`, `ServiceTicketsSection.tsx:99` — CardContent
  keeps the default `px-6`.
- `[id]/page.tsx:495,505,516` — Installation and Maintenance are wrapped in
  `max-w-2xl`, Activity in `max-w-3xl`, while Ocular/Quotes/Contract are full
  width, so the content width jumps as you page across the tab strip. (Contract's
  `max-w-3xl` was already removed.)
- `[id]/page.tsx:359` — the Overview tab is `mt-6` while every other
  `TabsContent` is `mt-4`, so content shifts vertically on tab change.
- `InstallationSection.tsx:303` — Delete carries `ml-auto` inside a
  `flex flex-wrap gap-1.5`, so when the row wraps the destructive button jumps to
  the far right of whichever line it lands on, sometimes right beside "Activate
  as Customer". Move it to a sibling `<div className="ml-auto flex items-center gap-2 shrink-0">`,
  matching `QuotesTab.tsx:297`.
- `ContractSection.tsx:451` — `DownloadContractPdfButton` is rendered with no
  `size`/`variant`, so it's a full-strength primary `h-9 text-sm` button beside an
  `h-9 text-xs` outline "Save Details", and the row (`:441`) uses
  `justify-between`, splitting two related save actions to opposite edges.
  → `size="sm" variant="outline" className="h-8 text-xs"` and
  `flex flex-wrap items-center gap-2 pt-1`.
- `ContractSection.tsx:609` — "Mark Contract as Signed" hard-codes
  `bg-emerald-600 hover:bg-emerald-700 text-white`; use the default variant.
- `InstallationSection.tsx:348` — a raw `<input>` with hand-rolled
  `text-xs px-2.5 py-1.5 focus:ring-1` beside an `h-9` button: heights don't line
  up and it bypasses the app's `focus-visible:ring-[3px]` token. → `<Input className="h-8 text-xs" />`.
- `OcularInspectionTab.tsx:495,574` — "Mark complete" and the delete confirm are
  `h-9` in the same cluster as `DownloadReportButton` at `h-8`.
- `InstallationSection.tsx:193`, `ServiceTicketsSection.tsx:80` — `opacity-60` on
  the whole locked Card drops muted text below contrast minimums; let the
  explanatory line carry the locked state instead.
- `InstallationSection.tsx:224` and `ContractSection.tsx:603` — a
  `flex items-center justify-between` wrapper around a single child, left over
  from a removed action. Unwrap.
- `PhotoSlots.tsx:115,138,156` — slots are `rounded-lg border p-3` (border-defined
  panels where the tokens separate surfaces by shadow), the empty state nests a
  dashed box inside that border, and the Add button is `h-9`.

---

## 5. Everything else, by area

### 5.1 AdminDashboard
- `:58` `space-y-8` where `FieldDashboard:203` (same route, other role) and the
  `Index.tsx:18` skeleton both use `space-y-6` — the page visibly re-spaces
  itself the moment the skeleton resolves.
- `:81` the only CardHeader in the app without `pb-3`, so the header/table gap is
  24px here vs 12px everywhere else.
- `:83` vs `:150` — two peer "go elsewhere" actions at different weights (filled
  primary `text-sm` vs ghost `text-xs`); the `text-xs` also fights `size="sm"`'s
  built-in `text-sm`.
- `:79,117` — grid children are plain `<div>`s wrapping `<Card>`, so the div
  stretches but the Card keeps its natural height and the two cards end at
  different baselines. Put `lg:col-span-2` on the Card itself, `h-full` on the other.
- `:164` vs `FieldDashboard:306` — the same stat strip built twice with the
  internals inverted (Admin `items-start` label-above-value, Field `items-center`
  value-above-label). Two roles see one panel two ways; Field's matches
  `reports` `KpiCell`.
- `:99-106` — table cells `px-6 py-3.5` and **no `<thead>`**, where the Leads
  table has `px-4 py-3` and an uppercase header row.
- `:127` — `<Skeleton className="h-10 mx-6 mb-6" />` hand-rolls the inset that
  the sibling branches express as `px-6 pb-6`.

### 5.2 App shell
- `AppLayout.tsx:54` — the mobile top bar has `glass-nav sticky top-0 z-40` but
  is a **sibling** of `<main>` (`:86`), which is the actual scroll container.
  Nothing ever scrolls beneath it, so `sticky`/`z-40` are inert and the
  `backdrop-filter` has nothing to blur — it renders as a flat 72% fill. Either
  drop the glass for `bg-background`, or move the bar inside `<main>`.
- `AppSidebar.tsx:68,85` — `text-[13px]` and `text-[13.5px]`, the only two
  occurrences of those sizes in the codebase.
- `AppSidebar.tsx:56` — hardcoded `"Lampara"` where `AppLayout:61,153` uses
  `{COMPANY_NAME}`.
- `AppSidebar.tsx:103` — profile `NavLink` has `min-w-0` but no `flex-1`, so
  inside `justify-between` its hit area shrinks to the text width.
- `auth/Callback.tsx:56` — two default-size buttons in a `flex gap-3` with no
  `flex-wrap`. `:48,67` also use `h-svh` where `AppLayout:32,50` uses
  `h-screen` — `h-svh` is the better one; the inconsistency is that only this
  file has it.

### 5.3 Profile
- `NotificationPreferencesCard.tsx:66,75` — `space-y-1` plus per-row
  `border-b last:border-0` puts the hairline 4px off-centre; the house idiom is
  `divide-y` (`AdminDashboard:134`). Wrap each row in a `<Label>` so the whole
  row is the hit area (see §2.2 for the Switch size).
- `profile/page.tsx:115` — `size-14 rounded-full` is the only round avatar;
  AppLayout, AppSidebar and team ×2 all use `rounded-md`.

### 5.4 List & board pages
- `calendar/page.tsx:114,119,121,124` — three heights in one toolbar: ToggleGroup
  `sm` (h-8), "Today" `sm` (h-8), prev/next `size-9`. Use `size="icon-sm"`.
- `leads/page.tsx:146` — "Clear filters" is `size="sm"` (h-8) in a bar where the
  Input and all three SelectTriggers are h-9.
- `team/page.tsx:171` vs `:257` — the same role picker is `w-28 h-8` in one card
  and `w-32 h-9` in the other, with `h-8` buttons beside one and `size-9` beside
  the other.
- `pipeline/page.tsx:97` — the only page header that is
  `px-6 py-5 border-b border-border` outside a `max-w-7xl mx-auto` container.
- `pipeline/page.tsx:108` — "New Lead" is `size="sm"` here, default size for the
  identical action on `leads:93` and `packages:103`.
- `packages/page.tsx:363-366,375-383` — the expanded line-items table gives cells
  **no horizontal padding at all**, so four columns butt together inside a
  `min-w-[420px]` scroller. Add `px-3` to every `<th>`/`<td>`, `-mx-3` on the
  wrapper at `:359`.
- `leads/page.tsx:188` — `<Empty className="border-none py-14">`: `Empty`'s base
  is `p-6 md:p-12`, and the responsive class wins at ≥768px, so `py-14` silently
  does nothing on desktop. → `py-14 md:py-14`.

### 5.5 Dialogs — shell and footer
- `ItemPickerModal.tsx:340` — the Custom tab ends with an inline
  `flex justify-end gap-2` pair using `variant="outline"` for Cancel and
  `size="sm" h-8` buttons, breaking the app-wide `DialogFooter` + ghost-Cancel +
  default-size convention and losing the mobile full-width stacking `DialogFooter`
  provides. The Packages tab has no footer at all.
- `ItemPickerModal.tsx:134` — `flex flex-col p-0` overrides the base `grid`/`p-6`
  but the base `gap-4` survives, leaving a 16px transparent band between the
  header's `border-b` and the tab strip's `border-b` — a visible double rule.
  Add `gap-0`.
- `ItemPickerModal.tsx:281,295,326` — Quantity `h-10`, Unit `h-8`, Unit Price
  `h-10` in a single grid row: three heights, misaligned baselines.
- Six dialogs have no `DialogDescription` (`CreateLead:111`, `EditLead:161`,
  `CreateTicket:93`, `ScheduleSurvey:80`, `ScheduleInstallation:139`,
  `CreateContract:57`), which trips Radix's `aria-describedby` warning and leaves
  screen readers a bare title. `CreateContractDialog.tsx:61` even has the copy —
  as a hand-rolled `<p>` outside the header with character-for-character the same
  classes.

### 5.6 Dialogs — forms
- `CreateLeadDialog.tsx:67-71` and `EditLeadDialog.tsx:111-115` — address
  validation failures surface as a **toast** while every other field in the same
  form shows an inline `FormMessage`; the user is told "Province is required" at
  the top-right with no field highlighted.
- `ScheduleInstallationDialog.tsx:150` — `FormControl` (a Radix `Slot`) injects
  `id`/`aria-invalid`/`aria-describedby` into `DateRangePicker`, which accepts
  only `value`/`onChange`/`className` and drops them, so the `FormLabel`'s
  `htmlFor` points at nothing and the error is never announced. Spread `...rest`
  onto the picker's root, or drop the `FormControl` wrapper.
- Required-field marking is split: hand-rolled forms mark required with
  `<span className="text-destructive">*</span>`; RHF dialogs mark nothing and
  instead label the optional ones "(optional)" — and `EditLeadDialog:186,190`
  uses a third form, placeholder text "Optional".
- `CreateLeadDialog.tsx:145` — the "Property / Site" break is a bare `<p>` where
  `PackageDialog:278-284` uses `<Separator />` + `<Label>`.
- `CreateTicketDialog.tsx:166` — `!mt-0` on a `FormLabel`, a no-op left from a
  `space-y` era.
- `cancel-lead-dialog.tsx:52,63` — the reason `Textarea` has no `<Label>`
  (placeholder only), and the destructive confirm never disables, so a double-tap
  can fire `onConfirm` twice.

### 5.7 QuoteBuilder
- `:651` — zebra striping at `bg-muted/5` is imperceptible in both themes
  (`--muted` is `#f5f5f7` on white, `#37404f` at 5% on `#202531`). Use
  `bg-muted/40` or delete it and rely on `divide-y`.

### 5.8 Two form idioms coexist

RHF + zod + `FormField/FormItem/FormLabel` (gap from `FormItem`'s `grid gap-2`,
label `text-sm`) in the six lead dialogs; hand-rolled `useState` + `<Label>` +
`space-y-1.5` in `PackageDialog`, `ItemPickerModal`, `QuoteBuilder` and
`ph-address-fields`. Not worth unifying wholesale, but it's why the label sizes
and field gaps differ — worth knowing before "fixing" one to match the other.

### 5.9 `QueryError` itself is off-house

`query-error.tsx:5-6` — used as a whole-page replacement (`reports:32`,
`packages:54`, `team:66`, `AdminDashboard:30`) but its `<h1>` is
`text-lg font-semibold` and the container `space-y-3`, against the house header
of `text-[28px] font-bold tracking-[-0.02em] leading-tight` and `space-y-6`.
Worth fixing **before** §1.1 adds five more callers.

---

## 6. What was checked and found clean

- No raw hex or named colours outside the token system anywhere in the app shell
  or dashboards; accent colours nearly always ship a `dark:` pair (the
  exceptions are listed in §3.3).
- The page `<h1>` (`text-[28px] font-bold tracking-[-0.02em] text-foreground
  leading-tight` + `text-sm text-muted-foreground mt-1.5` subtitle) is
  byte-identical across all in-app pages — the strongest convention in the
  codebase, and `QueryError` is the only deviation.
- The KPI stat strip (`Card className="py-0"` + `divide-y … lg:divide-x`) is
  correctly one unified panel rather than fragmented cards, in all three places
  it appears.
- `min-w-0` discipline is good in `QuoteBuilder` and `ItemPickerModal` —
  precisely where it was learned the hard way — and absent everywhere it hasn't
  bitten yet.
- The `DialogFooter` convention (ghost Cancel left, default submit right, label
  swapping to "…ing…" while pending) holds everywhere except `ItemPickerModal`.
