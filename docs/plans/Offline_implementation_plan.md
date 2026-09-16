# Implementation Plan: Universal Offline Ocular Reports (Web & Mobile)

> **Revision note (v2):** v1's architecture (Dexie/IndexedDB, repository + sync-engine layering) was verified against the real codebase and is sound — kept as-is. This revision replaces the two things v1 left as open-ended risk with concrete designs: **field-level patch queuing** (so offline saves inherit the same collision-safety the online save path already has, instead of inventing a new conflict system) and **idempotent photo replay** (so a retried upload after a partial failure can't double-upload). It also fixes v1's few inaccuracies against the real code (package manager is `pnpm`, not `npm`; the dashboard has no "tomorrow" bucket yet; `surveys.updated_at` exists and is available if ever needed, though the design below doesn't end up needing it).

Enable field technicians to download Site Ocular Reports before heading to job sites, fill in all report fields and capture photos completely offline with zero cell signal, and automatically sync everything back to Supabase once connectivity returns — working identically across the **Web App (desktop/mobile browser/PWA)** and the **Android APK**.

---

## Architecture Overview (Option A: Dexie/IndexedDB)

Same local-first shape as v1. One data/sync layer, not two, because both runtimes are the same WebView-class JS engine:

```
┌─────────────────────────────────────────────────────────────┐
│                       UI Layer                              │
│  OcularReportForm  │  PhotoSlots  │  FieldDashboard (Sync UI)│
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 Offline Survey Repository                   │
│  - getSurvey() hands back the SAME SurveyForLead shape       │
│    components already consume — no parallel data model       │
│  - saveSurveyOffline() queues a dirty-fields-only PATCH,      │
│    not a full record snapshot                                │
│  - addPhotosOffline() pre-assigns id+path before queuing,     │
│    for idempotent replay                                     │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
               ▼                               ▼
┌──────────────────────────────┐ ┌─────────────────────────────┐
│    Local Dexie Store (IDB)   │ │       Sync Engine           │
│  - surveys (LocalSurvey)     │ │  - Drains patchQueue, then   │
│  - patchQueue (SurveyReportPatch)│  photoQueue, oldest first   │
│  - photoQueue (pre-ID'd Blob)│ │  - Network error → stop,     │
└──────────────────────────────┘ │    keep "pending" for retry  │
                                  │  - Non-retryable error →     │
                                  │    mark "failed", surface it │
                                  └─────────────┬───────────────┘
                                               │
                                               ▼
                                 ┌─────────────────────────────┐
                                 │      Supabase Backend       │
                                 │  - surveys (column patches) │
                                 │  - survey_photos + Storage  │
                                 │    (upsert, not insert)     │
                                 └─────────────────────────────┘
```

---

## Conflict & Idempotency Strategy

This is the part v1 left as an unaddressed risk. Both problems turn out to have small, code-grounded fixes rather than needing a general-purpose conflict system.

### A. Field-level patches, not record snapshots — no merge logic needed

`OcularReportForm.saveDraft` ([OcularReportForm.tsx:248-267](../../src/pages/leads/_components/ocular/OcularReportForm.tsx#L248-L267)) already computes a `SurveyReportPatch` containing **only the fields `react-hook-form` marked dirty**, specifically so that "two people editing different sections cannot overwrite each other's work" (the comment at `surveys.ts:196-197`). `saveSurveyReport` ([surveys.ts:304-325](../../src/lib/supabase/queries/surveys.ts#L304-L325)) then does a partial `.update()` containing only those columns.

The offline queue carries that same guarantee forward unchanged: **each offline "Save" produces its own small `SurveyReportPatch` and is queued as its own item**, not merged into one big diff computed later. The sync engine replays each queued patch through the exact same `saveSurveyReport` call, in the order they were created. Because a patch only ever names the columns the technician actually touched that time, replaying it later can never clobber a field someone else changed on the server in the meantime — that's the same protection the online path already has, just deferred.

No `updated_at` version check, no last-write-wins-by-timestamp column, no CRDT. If the technician edits the same field twice while offline before ever syncing, the two patches replay in order and the second one wins — identical to two quick saves online today.

### B. Idempotent photo upload replay

`addSurveyPhotos` ([surveys.ts:336-384](../../src/lib/supabase/queries/surveys.ts#L336-L384)) already has non-trivial partial-failure handling: each file is uploaded and inserted one at a time, and a failed DB insert rolls back only that file's storage object. Naively replaying a queued "add these photos" job after a partial success would **re-upload photos that already landed**.

Fix: assign the photo's `id` (its future `survey_photos.id`) and storage `path` (matching `buildPath`'s existing `surveys/<surveyId>/<uuid>-<name>` shape) **at capture time, offline**, not at upload time. The sync engine then uploads and inserts using those pre-assigned values with `upsert` semantics, so a retried job for a photo that already landed is a no-op rather than a duplicate:

- `uploadFile` ([storage.ts:56-68](../../src/lib/supabase/storage.ts#L56-L68)) gains an optional `upsert?: boolean` param (default `false`) — the online call sites (`uploadFiles`, `addSurveyPhotos`) pass nothing and keep today's behavior exactly.
- `addSurveyPhotos` gains an optional `precomputed?: { id: string; path: string; sortOrder: number }[]` (same length/order as `files`) and, when present, uses `.upsert(..., { onConflict: "id" })` instead of `.insert()` for the `survey_photos` row and `upsert: true` for the storage call. Omitted → current behavior, so `PhotoSlots.tsx`'s online call site needs **zero changes**.

### C. Server-side deletion/reassignment mid-sync

If a queued patch or photo targets a survey that's been deleted or reassigned away from this technician while they were offline, the update/insert affects 0 rows or fails RLS. The sync engine treats that specific case as **terminal** (not retried forever): it marks the queue item `"failed"`, and `SyncStatusButton` surfaces "1 change couldn't be saved — this inspection was removed or reassigned," dismissible by the technician. Everything else in the queue keeps draining normally.

### D. Storage eviction

Call `navigator.storage.persist()` once, right after the first successful offline download — best-effort, no warning if the browser declines. Without it, Android Chrome (and the Capacitor WebView, which shares the same storage stack) can evict "best-effort" IndexedDB data under device storage pressure, which for a technician mid-visit with photos already queued would silently lose work.

---

## Decisions

> [!IMPORTANT]
> **Pre-visit Download Strategy — DECIDED: Option 1 (Automatic + Manual).** Inspections assigned to the logged-in technician scheduled for **Today & Tomorrow** auto-download whenever they open the app with internet, plus a manual **"Download for Offline"** button on any inspection card. This is what §6's `FieldDashboard.tsx` change (the `useEffect` gated on `navigator.onLine`, plus the per-card button) already implements below — no further design work needed here.

> [!IMPORTANT]
> **Photo Storage Format**: Confirmed against real code — `compressImage` ([image.ts:21](../../src/lib/image.ts#L21)) already resizes to a 1600px long edge as WebP (~200-350 KB typical). The offline path reuses this exact function at capture time, so a queued photo's Blob is already compressed before it ever touches IndexedDB.

---

## Open Questions

> [!NOTE]
> 1. **Auth Token Expiration Offline** — narrowed from v1: `persistSession`/`autoRefreshToken` are unconditionally on in any real deployment ([client.ts:28-39](../../src/lib/supabase/client.ts#L28-L39)), and Supabase refresh tokens renew on each use (a sliding window, default 30 days, project-configurable in the dashboard). A technician who reconnects every day or two never hits this. Only continuous offline time exceeding the refresh-token lifetime triggers the "Session expired — please log in to finish syncing" prompt. **Recommend accepting this as-is** — it's a rare edge case, not a common one, and no extra engineering is proposed for it.
> 2. **Offline Indicator Placement — DECIDED**: mobile top bar, in the icon row next to the Bell/profile icons ([AppLayout.tsx:76-98](../../src/pages/layout/AppLayout.tsx#L76-L98)); desktop, in `AppSidebar`'s footer row next to `SignOutButton` ([AppSidebar.tsx:105-127](../../src/pages/layout/_components/AppSidebar.tsx#L105-L127)).
> 3. **NEW — legacy `photo_paths`**: `surveys.photo_paths` ([database.types.ts:192](../../src/lib/supabase/database.types.ts#L192)) is a superseded flat array, still read for old rows. Offline download caches `SurveyForLead.photoUrls` (its already-resolved read-only view) for display, but every offline-created photo goes through `survey_photos` only — matching the online path, which never writes to `photo_paths` either.

---

## Proposed Changes

### 1. Dependencies

```bash
pnpm add dexie dexie-react-hooks
```
(`dexie-react-hooks` gives `useLiveQuery`, used by `SyncStatusButton` and `FieldDashboard` below to reactively read Dexie without manual refetching.) Neither package exists in `package.json` today — this is a genuinely greenfield addition, confirmed by grepping `src/` for `Dexie`/`IndexedDB`/`sync_queue` with zero hits.

### 2. Offline Database & Storage Layer

#### [NEW] `src/lib/offline/db.ts`

```ts
import Dexie, { type Table } from "dexie";
import type { SurveyForLead } from "@/lib/supabase/types.ts";
import type { SurveyReportPatch } from "@/lib/supabase/queries/surveys.ts";
import type { SurveyPhotoCategory } from "@/lib/supabase/database.types.ts";

export type QueuedPatch = {
    id: string; // crypto.randomUUID(), assigned when queued
    surveyId: string;
    patch: SurveyReportPatch; // exact shape sent online — dirty fields only
    createdAt: string;
    status: "pending" | "syncing" | "failed";
    error?: string;
};

export type QueuedPhoto = {
    id: string; // pre-assigned uuid — becomes survey_photos.id (idempotency key)
    surveyId: string;
    category: SurveyPhotoCategory;
    path: string; // pre-assigned storage path, matches buildPath()'s shape
    blob: Blob; // already compressed (1600px WebP) at capture time
    fileName: string;
    contentType: string;
    sortOrder: number;
    createdAt: string;
    status: "pending" | "syncing" | "failed";
    error?: string;
};

/**
 * The exact SurveyForLead shape OcularReportForm/PhotoSlots already consume —
 * matches this app's existing convention (per the Supabase migration) of
 * handing components the same document shape everywhere, online or off, so
 * getSurvey() needs no translation layer.
 */
export type LocalSurvey = SurveyForLead & {
    downloadedAt: string;
    lastSyncedAt: string | null;
};

class OfflineDb extends Dexie {
    surveys!: Table<LocalSurvey, string>;
    patchQueue!: Table<QueuedPatch, string>;
    photoQueue!: Table<QueuedPhoto, string>;

    constructor() {
        super("lampara-offline");
        this.version(1).stores({
            surveys: "_id, leadId, assignedSurveyorId, scheduledAt",
            patchQueue: "id, surveyId, status, createdAt",
            photoQueue: "id, surveyId, status, createdAt",
        });
    }
}

export const offlineDb = new OfflineDb();
```

#### [NEW] `src/lib/offline/types.ts`

```ts
export type SyncState = "synced" | "offline" | "syncing" | "error";

export type PendingCounts = {
    patches: number;
    photos: number;
    failed: number;
};
```

### 3. Backend changes required for idempotent replay

#### [MODIFY] [src/lib/supabase/storage.ts:56-68](../../src/lib/supabase/storage.ts#L56-L68)

```ts
export async function uploadFile(
    bucket: Bucket,
    path: string,
    file: File,
    options: { upsert?: boolean } = {},
): Promise<string> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: CACHE_CONTROL,
        contentType: file.type || "application/octet-stream",
        upsert: options.upsert ?? false,
    });
    if (error) throw toAppError(error, "Upload failed");
    return path;
}
```

#### [MODIFY] [src/lib/supabase/queries/surveys.ts:336-384](../../src/lib/supabase/queries/surveys.ts#L336-L384)

```ts
export async function addSurveyPhotos(args: {
    surveyId: Id<"surveys">;
    category: SurveyPhotoCategory;
    files: File[];
    /** Offline replay only: pre-assigned id/path/sortOrder per file, same
     *  order as `files`, so a retried upload is idempotent instead of a
     *  duplicate. Omitted for the normal online path — behavior unchanged. */
    precomputed?: { id: string; path: string; sortOrder: number }[];
}): Promise<number> {
    if (!args.files.length) return 0;

    const { data: auth } = await supabase.auth.getUser();

    let next = 0;
    if (!args.precomputed) {
        const existing = unwrap(
            await supabase
                .from("survey_photos")
                .select("sort_order")
                .eq("survey_id", args.surveyId)
                .eq("category", args.category)
                .order("sort_order", { ascending: false })
                .limit(1),
            "Failed to read existing photos",
        ) as { sort_order: number }[];
        next = (existing[0]?.sort_order ?? -1) + 1;
    }

    let saved = 0;
    for (let i = 0; i < args.files.length; i++) {
        const pre = args.precomputed?.[i];
        const original = args.files[i];
        const file = await prepareUpload(original);
        const path = pre?.path ?? buildPath("surveys", args.surveyId, file);
        await uploadFile("photos", path, file, { upsert: !!pre });

        const row = {
            ...(pre ? { id: pre.id } : {}),
            survey_id: args.surveyId,
            category: args.category,
            path,
            sort_order: pre?.sortOrder ?? next,
            created_by: auth.user?.id ?? null,
        };
        const { error } = pre
            ? await supabase.from("survey_photos").upsert(row, { onConflict: "id" })
            : await supabase.from("survey_photos").insert(row);
        if (error) {
            if (!pre) await removeFiles("photos", [path]);
            if (saved === 0) throw toAppError(error, "Failed to save photo");
            break;
        }
        next += 1;
        saved += 1;
    }

    return saved;
}
```

`PhotoSlots.tsx` ([PhotoSlots.tsx:91](../../src/pages/leads/_components/ocular/PhotoSlots.tsx#L91)) calls `addPhotos({ surveyId, category, files })` today with no `precomputed` — unaffected.

### 4. Network & Sync Engine

#### [NEW] `src/lib/offline/network.ts`

```ts
import { useEffect, useState } from "react";

/** True when the browser/WebView believes it has a network path. Deliberately
 *  not a ping-based "real connectivity" check — a failed sync attempt is
 *  itself the correct fallback signal, and a field-ops app on cellular data
 *  hitting a captive portal is rare enough not to justify a ping endpoint. */
export function useIsOnline(): boolean {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
}
```

#### [NEW] `src/lib/offline/sync-engine.ts`

```ts
import { useEffect } from "react";
import type { Table } from "dexie";
import { offlineDb, type QueuedPatch, type QueuedPhoto } from "./db.ts";
import { saveSurveyReport, addSurveyPhotos } from "@/lib/supabase/queries/surveys.ts";

function isNetworkError(err: unknown): boolean {
    return err instanceof TypeError && /fetch|network/i.test(err.message);
}

async function handleQueueError<T extends QueuedPatch | QueuedPhoto>(
    table: Table<T, string>,
    item: T,
    err: unknown,
): Promise<void> {
    const message = err instanceof Error ? err.message : "Sync failed";
    // A network failure stays "pending" for the next drain; anything else
    // (RLS denial, 0 rows, validation) is terminal — see Conflict &
    // Idempotency Strategy §C.
    const status = isNetworkError(err) ? "pending" : "failed";
    await table.update(item.id, { status, error: message } as Partial<T>);
}

/** Drains patchQueue then photoQueue, oldest first. Scoped to one survey when
 *  `surveyId` is given (called right after a save/photo-add while online),
 *  otherwise drains everything (called on reconnect/resume/manual sync). */
export async function drainQueue(surveyId?: string): Promise<void> {
    const patches = await offlineDb.patchQueue
        .where("status").notEqual("failed")
        .filter((p) => !surveyId || p.surveyId === surveyId)
        .sortBy("createdAt");

    for (const item of patches) {
        await offlineDb.patchQueue.update(item.id, { status: "syncing" });
        try {
            await saveSurveyReport({ surveyId: item.surveyId, patch: item.patch });
            await offlineDb.patchQueue.delete(item.id);
        } catch (err) {
            await handleQueueError(offlineDb.patchQueue, item, err);
            if (isNetworkError(err)) return; // stop the whole drain, don't skip ahead
        }
    }

    const photos = await offlineDb.photoQueue
        .where("status").notEqual("failed")
        .filter((p) => !surveyId || p.surveyId === surveyId)
        .sortBy("createdAt");

    for (const item of photos) {
        await offlineDb.photoQueue.update(item.id, { status: "syncing" });
        try {
            const file = new File([item.blob], item.fileName, { type: item.contentType });
            await addSurveyPhotos({
                surveyId: item.surveyId,
                category: item.category,
                files: [file],
                precomputed: [{ id: item.id, path: item.path, sortOrder: item.sortOrder }],
            });
            await offlineDb.photoQueue.delete(item.id);
        } catch (err) {
            await handleQueueError(offlineDb.photoQueue, item, err);
            if (isNetworkError(err)) return;
        }
    }
}

/** Fires drainQueue() on reconnect, tab/app resume, and once on mount (to
 *  catch a reconnect that happened before this hook was mounted). Mount this
 *  once, in AppLayout. */
export function useAutoSync(): void {
    useEffect(() => {
        const trigger = () => void drainQueue();
        const onVisible = () => {
            if (document.visibilityState === "visible") trigger();
        };
        window.addEventListener("online", trigger);
        document.addEventListener("visibilitychange", onVisible);
        trigger();
        return () => {
            window.removeEventListener("online", trigger);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);
}
```

### 5. Survey Repository

#### [NEW] `src/lib/offline/survey-repository.ts`

```ts
import { offlineDb, type LocalSurvey } from "./db.ts";
import { drainQueue } from "./sync-engine.ts";
import { listSurveysForLead, type SurveyReportPatch } from "@/lib/supabase/queries/surveys.ts";
import { compressImage } from "@/lib/image.ts";
import { buildPath } from "@/lib/supabase/storage.ts";
import type { SurveyForLead } from "@/lib/supabase/types.ts";
import type { SurveyPhotoCategory } from "@/lib/supabase/database.types.ts";

/** Fetches the full report (with photos) the same way the lead detail page
 *  does, and caches it verbatim — no separate offline data shape. */
export async function downloadSurveyForOffline(leadId: string, surveyId: string): Promise<void> {
    const surveys = await listSurveysForLead(leadId as never);
    const survey = surveys.find((s) => s._id === surveyId);
    if (!survey) throw new Error("Inspection not found");

    const now = new Date().toISOString();
    await offlineDb.surveys.put({ ...survey, downloadedAt: now, lastSyncedAt: now });

    if ("storage" in navigator && "persist" in navigator.storage) {
        void navigator.storage.persist(); // best-effort, ignore the result
    }
}

export async function getSurvey(surveyId: string): Promise<LocalSurvey | undefined> {
    return offlineDb.surveys.get(surveyId);
}

/** Patch keys are already Survey's own camelCase field names (SurveyReportPatch
 *  is Partial<Pick<Survey, ...>>), so the local optimistic update is a direct
 *  assignment — no field-name translation. */
export async function saveSurveyOffline(
    surveyId: string,
    patch: SurveyReportPatch,
): Promise<void> {
    const local = await offlineDb.surveys.get(surveyId);
    if (local) await offlineDb.surveys.update(surveyId, patch as Partial<SurveyForLead>);

    await offlineDb.patchQueue.add({
        id: crypto.randomUUID(),
        surveyId,
        patch,
        createdAt: new Date().toISOString(),
        status: "pending",
    });

    if (navigator.onLine) void drainQueue(surveyId);
}

export async function addPhotosOffline(args: {
    surveyId: string;
    category: SurveyPhotoCategory;
    files: File[];
}): Promise<void> {
    const local = await offlineDb.surveys.get(args.surveyId);
    const queuedSoFar = await offlineDb.photoQueue
        .where({ surveyId: args.surveyId })
        .filter((p) => p.category === args.category)
        .count();
    const existingRemote = (local?.photos ?? []).filter((p) => p.category === args.category).length;
    let sortOrder = queuedSoFar + existingRemote;

    for (const original of args.files) {
        const compressed = await compressImage(original); // same pipeline as online
        const id = crypto.randomUUID();
        const path = buildPath("surveys", args.surveyId, compressed);
        await offlineDb.photoQueue.add({
            id,
            surveyId: args.surveyId,
            category: args.category,
            path,
            blob: compressed,
            fileName: compressed.name,
            contentType: compressed.type,
            sortOrder,
            createdAt: new Date().toISOString(),
            status: "pending",
        });
        sortOrder += 1;
    }

    if (navigator.onLine) void drainQueue(args.surveyId);
}
```

### 6. UI Integrations

#### [NEW] `src/components/offline/SyncStatusButton.tsx`
- Uses `useLiveQuery` (from `dexie-react-hooks`) over `offlineDb.patchQueue`/`photoQueue` to reactively compute `PendingCounts`, plus `useIsOnline()`.
- States: online + nothing pending → subtle green cloud; offline → amber "Offline Mode"; pending > 0 → badge with count + "Sync Now" (calls `drainQueue()` with no `surveyId`, i.e. everything); any `status === "failed"` item → red badge, popover lists the specific failure message from §C above with a dismiss action (`table.delete(item.id)`).

#### [MODIFY] [src/pages/leads/_components/ocular/OcularReportForm.tsx:248-267](../../src/pages/leads/_components/ocular/OcularReportForm.tsx#L248-L267) (`saveDraft`)
- When `navigator.onLine` is true: unchanged, calls `saveReport` directly (today's online path, including its own retry-free behavior).
- When offline: same dirty-field diff (`patch` computed exactly as today), routed to `saveSurveyOffline(survey._id, patch)` instead of `saveReport(...)`. `reset(values)` still runs immediately either way, so the form always reflects what the technician just typed.
- Toast: `"Saved locally — will sync when back online"` offline vs. today's `"Report saved"` online.

#### [MODIFY] [src/pages/leads/_components/ocular/PhotoSlots.tsx:75-102](../../src/pages/leads/_components/ocular/PhotoSlots.tsx#L75-L102) (`handleFiles`)
- Offline branch calls `addPhotosOffline({ surveyId, category, files })` instead of `addPhotos(...)`.
- Renders locally-queued photos (from `offlineDb.photoQueue`, via `useLiveQuery`) alongside synced ones, using `URL.createObjectURL(item.blob)` for the `<img src>` in place of `photo.url`.
- `<input type="file" accept="image/*" multiple>` (line 132) already works unchanged in both the mobile browser and the Capacitor WebView — no `capture` attribute needed since the existing input already lets the OS picker offer the camera.

#### [MODIFY] [src/pages/_components/FieldDashboard.tsx:149-171](../../src/pages/_components/FieldDashboard.tsx#L149-L171)
- Add the missing "tomorrow" bucket (today's `thisWeek` only spans Today→+7 days, not a distinct Tomorrow slice):
  ```ts
  const tomorrow = new Date(today.getTime() + 86400000);
  const tomorrowJobs = jobs.filter(
      (j) => isOpen(j) && startOfDay(j.at).getTime() === tomorrow.getTime(),
  );
  ```
- In a `useEffect` gated on `navigator.onLine`, for every job in `[...todayJobs, ...tomorrowJobs]` where `job.kind === "inspection"`, call `downloadSurveyForOffline(job.leadId, job.id)` (installations are out of scope for this plan — only ocular reports). Failures are silent/best-effort — a prefetch failing shouldn't block dashboard rendering.
- Add an "Available Offline" badge on `JobCard` when `getSurvey(job.id)` resolves (checked via `useLiveQuery`), and a manual "Download for Offline" button on inspection cards that aren't yet cached.

#### [MODIFY] [src/pages/layout/AppLayout.tsx:76-98](../../src/pages/layout/AppLayout.tsx#L76-L98) and [src/pages/layout/_components/AppSidebar.tsx:105-127](../../src/pages/layout/_components/AppSidebar.tsx#L105-L127)
- Mount `useAutoSync()` once in `AppLayout`.
- Embed `<SyncStatusButton />` in the mobile top bar's icon row (next to the Bell) and in `AppSidebar`'s footer row (next to `SignOutButton`).

---

## Verification Plan

### Automated Verification
```powershell
pnpm exec tsc -b
pnpm run build
pnpm exec cap sync android
```

### Manual Verification
1. **Online Pre-fetch**: Open the Field Dashboard while connected with jobs scheduled today/tomorrow. Verify `offlineDb.surveys` contains the full `SurveyForLead` records (DevTools → Application → IndexedDB → `lampara-offline`).
2. **Simulate Offline — form patches**: DevTools "Offline" mode (or Airplane mode). Open a downloaded inspection, edit fields across two different sections in two separate saves. Verify two entries appear in `patchQueue`, each containing only the fields touched in that save (not the whole form).
3. **Simulate Offline — photos**: Capture 2 photos in different slots while offline. Verify they render immediately via blob URLs and appear as two `photoQueue` entries with distinct pre-assigned `id`/`path`.
4. **Reconnect & Sync**: Go back online. Verify `drainQueue` empties both queues in creation order; check Supabase `surveys` for the patched columns and `survey_photos` + the `photos` storage bucket for exactly 2 new rows/objects (not 4 — this is the idempotency check).
5. **Idempotency under retry**: While offline with one photo queued, manually invoke `drainQueue()` twice in the DevTools console before reconnecting fails both times (network still off) — confirm the queue item stays `"pending"` with no duplicate `photoQueue` entries created. Reconnect, sync, confirm exactly one `survey_photos` row.
6. **Conflict safety**: With a survey downloaded offline, have a second account (e.g. superadmin) edit a *different* field on the same survey online while the technician is still offline. Reconnect the technician and sync. Verify both edits are present on the row — the offline patch didn't clobber the field it never touched.
7. **Terminal failure surfacing**: While a patch is queued offline for a given survey, have a second account cancel/reassign that survey. Reconnect. Verify the queue item is marked `"failed"` (not retried forever) and `SyncStatusButton` surfaces the specific message from §C.
8. **Capacitor APK**: `pnpm exec cap sync android`, build/install the debug APK, repeat steps 2-4 in Android Airplane mode on a physical device.
