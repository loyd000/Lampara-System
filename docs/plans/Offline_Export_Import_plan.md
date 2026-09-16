# Implementation Plan: Offline Ocular Report — Export/Import Mode

**Status: implemented.** This replaced `docs/plans/Offline_implementation_plan.md`'s Dexie/sync-queue architecture entirely, after real-device testing of that architecture surfaced a recurring class of bug (`navigator.onLine` unreliability, service-worker chunk-caching gaps) that kept resurfacing in new places rather than getting fully fixed. That plan is kept for history; its implementation has been removed from the codebase.

**Decisions made:**
1. Replace the old system entirely — done. `src/lib/offline/`, `src/components/offline/SyncStatusButton.tsx`, the Dexie/`dexie-react-hooks`/`fake-indexeddb` dependencies, and every offline branch added to `OcularReportForm`/`PhotoSlots`/`OcularInspectionTab`/`FieldDashboard`/`leads/[id]/page.tsx`/`AccountGate`/`useCurrentUser` are gone.
2. Pure free-text customer name — no pre-downloaded job-matching list.
3. Multiple drafts supported, saved to the phone via the native Share sheet (`@capacitor/filesystem` + `@capacitor/share`, added as dependencies) — not a plain browser download, which doesn't reliably do anything inside a Capacitor WebView.
4. No login check on the offline page.
5. Drafts persist in `localStorage` across app restarts — reopening the offline page while still offline shows every report already filled, not just the one most recently open.

**What actually got built**, matching the design below with one addition the design didn't call out explicitly: `/offline-report` also needed to be reachable from `AccountGate`'s own error screen, not just from the Field Dashboard — a technician who opens the app cold with zero signal hits that screen *before* ever reaching the dashboard, and the whole point was that this page needs to work from exactly that state.

---

## Why this instead of the existing sync architecture

Every bug from today's testing session traced back to one root cause: the existing design tries to make the **live, connected app** — React Query, Supabase Auth, the service worker, IndexedDB sync queues — keep working seamlessly *across a connectivity transition*. Each of those systems has its own notion of "online," and they disagreed with each other and with reality:

- `navigator.onLine` can report `true` on Android WebView for an entire session even while genuinely offline, with no `offline` event ever firing to correct it.
- React Query's cache doesn't survive a reload, so every page needed its own hand-built offline fallback (four separate places needed this before it actually worked end to end).
- The service worker's chunk-caching only works for routes actually visited online first.
- IndexedDB (Dexie) needed a real schema-versioning migration to extend.

None of these are wrong choices in isolation — they're the standard toolkit for "make a web app work offline." But stacking all of them for one feature means every one of their individual edge cases has to be gotten right, at once, and testing on a real device kept finding the ones that weren't.

**This plan proposes a different shape entirely: don't try to be "the same app, offline." Build a small, deliberately disconnected tool that never once assumes it has a network, and hand data back to the real app manually when reconnected.**

---

## Architecture

```
FIELD (no signal)                              OFFICE (online)
─────────────────                              ────────────────
FieldDashboard
  → "Prepare Offline Forms" (while online,     FieldDashboard or a lead's
     before leaving) — downloads a tiny          Ocular tab
     {id, name, address} job list                  → "Import Offline Report"
                                                       → file picker
  → "Fill Report Offline" button                     → reads the .json
     → dedicated, eagerly-bundled page               → pre-fills the REAL
       (no network calls, ever)                        OcularReportForm via
       → pick a job from the prepared list             reset(data) — does
         (or type a free-text reference)                NOT auto-submit
       → fill the same report fields
       → "Save Draft" → plain localStorage             Staff reviews the
       → "Export" → downloads a .json file             pre-filled form,
         (or native Share sheet on Android)             clicks the existing
                                                          "Save Report" button
                                                          — the normal online
                                                          save path, same
                                                          validation, same
                                                          business logic.
```

The only thing that crosses the field/office boundary is a small JSON file. Nothing about getting it there depends on any of today's failure points.

---

## What this eliminates

- No offline sync queue, no idempotent-replay logic, no Dexie schema versioning
- No dependency on `navigator.onLine` anywhere in this flow
- No service-worker shell-caching or chunk-caching risk — the offline page is bundled into the app's main chunk (not `React.lazy`-loaded), so it's physically present the instant the app itself loads, online or off
- No `AccountGate`/session-revalidation dependency while filling the form — it never calls Supabase at all
- No conflict-resolution design needed — the import step re-fetches the lead fresh (staff are online at that point) and pre-fills on top of it; saving still goes through the exact same dirty-fields patch the online form has always used

---

## Proposed Changes

### 1. Prepare step (online, on the Field Dashboard)

#### [NEW] A small, deliberately minimal query
```ts
// src/lib/supabase/queries/surveys.ts — new function, alongside listMyInspections
export type OfflineJobRef = {
    surveyId: string;
    leadId: string;
    leadName: string;
    address: string | null;
    scheduledAt: string;
};

export async function listOfflineJobRefs(): Promise<OfflineJobRef[]>
```
Deliberately not the full `SurveyForSurveyor`/`SurveyForLead` join — just enough to label a dropdown and know which lead to open on import. No photos, no report fields, no lead/property caching.

#### [NEW] `src/lib/offlineForm/jobRefs.ts`
```ts
const KEY = "lampara.offlineJobRefs.v1";
export function saveJobRefs(refs: OfflineJobRef[]): void   // localStorage.setItem, JSON.stringify
export function getJobRefs(): OfflineJobRef[]              // localStorage.getItem, JSON.parse, [] on failure
```
Plain `localStorage`. No IndexedDB, no async lifecycle.

#### [MODIFY] `FieldDashboard.tsx`
Add a "Prepare Offline Forms" button that calls `listOfflineJobRefs()` and `saveJobRefs()`. Shows a toast with the count ("12 jobs ready for offline use"). This *replaces* the current auto-download `useEffect` and its `downloadSurveyForOffline` call — see Open Question 5.

### 2. The offline form page (new, eagerly bundled)

#### [NEW] `src/pages/offline-report/page.tsx`
Imported **directly** in `App.tsx` (`import OfflineReportPage from "./pages/offline-report/page.tsx"`, not `lazy(() => import(...))`) — this is the one deliberate exception to the app's route-splitting convention, and it's the point: this page must be physically present in the bundle the browser/WebView already has loaded, with no fetch required to reach it, ever.

- Reads `getJobRefs()` for a picker (dropdown or searchable list); falls back to a free-text "Customer / site reference" input if nothing was prepared, or if the technician just needs to note something down anyway.
- Renders the same field set as the real report — see the shared-fields extraction below.
- "Save Draft" writes to `localStorage` under a per-draft key (supports multiple in-progress drafts — a technician visiting three sites in one offline day needs three, not one).
- "Export" serializes one draft to a `.json` file:
  - Web: a plain `<a download>` Blob URL.
  - Android: `@capacitor/filesystem` + `@capacitor/share` (new dependencies) for a native "Save to Files" / "Share via…" sheet — nicer than a browser download prompt inside a WebView.
- Zero Supabase calls anywhere on this page. The only "who is this" signal is `supabase.auth.getSession()` (local-only, no network — see the auth.tsx `SIGNED_OUT` handling already in place) used to label the draft, best-effort, never blocking.

#### [MODIFY] Extract shared field-rendering
`OcularReportForm.tsx` and `fields.tsx` currently own the report's field layout, options, and validation. Pull the presentational parts (`FieldBlock`, `ChoiceField`, `TextField`, etc. and the field list itself) into a shape both the online form and this new offline page import, so the two can't silently drift apart as the report format evolves. Exact extraction boundary is a task-planning detail, not an architecture decision — the point is one source of truth for "what fields exist," two consumers for "how they're saved."

#### [NEW] `src/lib/offlineForm/drafts.ts`
```ts
export type OfflineDraft = {
    id: string;                    // crypto.randomUUID()
    jobRef: OfflineJobRef | null;  // null if free-text / unmatched
    customerNote: string;          // the free-text fallback
    values: OcularFormValues;      // same shape OcularReportForm.toForm() produces
    savedAt: string;
};
export function saveDraft(draft: OfflineDraft): void   // localStorage
export function listDrafts(): OfflineDraft[]
export function deleteDraft(id: string): void
export function exportDraft(draft: OfflineDraft): void // Blob download / Share sheet
```

### 3. Import step (online, back at the office)

#### [NEW] "Import Offline Report" entry point
A button on `FieldDashboard.tsx` (for a field user importing their own work) and/or `OcularInspectionTab.tsx` (for office staff importing into a specific already-open lead). Opens a file picker (`<input type="file" accept="application/json">`), reads and `JSON.parse`s the file into an `OfflineDraft`.

- If `draft.jobRef` is set: navigate to `/projects/${draft.jobRef.leadId}?tab=ocular`.
- If not: prompt to search/pick the correct lead first (reuse the existing lead search UI).
- Once on the Ocular tab, pre-fill `OcularReportForm` via `form.reset(draft.values)` — this makes every field "dirty" against the *current* server values, so the existing dirty-fields patch on save writes exactly the imported fields, same as if the technician had typed them by hand at a desk.
- Staff reviews, edits anything that needs correcting, clicks the existing "Save Report" button. Nothing new here — this is the online form doing exactly what it already does.

---

## Open Questions (for you to decide before this gets planned into tasks)

1. **Replace or keep both?** Recommend fully replacing the Dexie-based auto-sync system (`src/lib/offline/`, the `patchQueue`/`photoQueue`, `SyncStatusButton`, the offline branches in `OcularReportForm`/`PhotoSlots`) rather than keeping both. Running two different offline strategies for the same feature doubles the maintenance surface for the exact problem we're trying to reduce.
2. **Matching customers**: pre-download the job list (better UX — pick from a list, no typos) vs. pure free-text (zero online dependency even for the prepare step, more manual matching at the office)? Plan above assumes both are available, prepared list preferred.
3. **Multiple drafts**: is a simple local list with individual export buttons enough, or do you want a "export all as one file" option for a technician who visited several sites?
4. **Access control**: should the offline page require any login check at all? It can't validate anything over the network while offline. Recommend: read the local session if present (to label the draft with a name), but never hard-block on it — anyone with the app installed can use the page, same as anyone with a paper form and a pen could fill one out today.
5. **What happens to the current implementation** if this replaces it — do you want it torn out in the same pass, or left in place (unused) for now in case this new approach also needs revision?

---

## Verification Plan

Manual only — this is specifically designed to not need the elaborate multi-layer testing the previous plan did:

1. **Cold, true offline test**: turn off WiFi/data on the device *before* opening the app at all (not mid-session). Open the app, go straight to the offline report page, fill it out, export. Confirm via DevTools Network tab (`chrome://inspect`) that literally zero requests fired.
2. **Transfer test**: move the exported `.json` to a different device or browser profile (simulating "back at a different office computer"), import it, confirm the real form pre-fills correctly and saves normally.
3. **Multi-draft test**: fill and export two separate drafts in one offline session; confirm both export as distinct files and both import cleanly.
