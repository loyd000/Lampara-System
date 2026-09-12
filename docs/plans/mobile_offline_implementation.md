# Lampara Mobile App & Offline Ocular Reports — Implementation Plan

## Overview

Two goals, bundled together because they share a foundation:

1. **Installable Android app** — something a technician downloads and opens like any other app, not a browser tab.
2. **Offline ocular reports** — a technician can open an assigned inspection, fill out the full Site Ocular Report (every field, every photo) with zero signal, and it syncs to Supabase automatically the next time the phone has connectivity.

This is scoped to the ocular report workflow specifically, because that's the actual pain point (a technician standing in someone's yard with no bars) — not a general "make the whole CRM offline" effort. Viewing the pipeline, scheduling, quoting, etc. stay online-only for now (see Phase 2 for what expanding that would take).

---

## What already exists (don't rebuild this)

The web app already has PWA scaffolding — checked before writing this plan, not assumed:

- `public/site.webmanifest` + `public/sw.js` — a real service worker is already registered (`src/hooks/use-service-worker.ts`), already installable via "Add to Home Screen."
- `src/components/ios-install-prompt.tsx` — a custom install nudge for iOS, which doesn't support the native install prompt.

**What it does NOT do:** `sw.js` is network-first for everything and falls back to a static `offline.html` placeholder on failure. It caches the app shell's static assets (icon, manifest) — never actual data. Opening the app with no signal today shows "you're offline," not a working app. There is no local database, no write queue, nothing persisted beyond React Query's in-memory cache (which is gone the moment the tab/app closes). Offline capability is being built from zero, not extended from something partial.

---

## Part 1 — Getting onto Android as an installable app

Two real options. Recommending Capacitor, but stating the alternative plainly because it's genuinely simpler if offline turns out to matter less than expected.

### Option A — Capacitor (recommended)

[Capacitor](https://capacitorjs.com) wraps the existing Vite build in a real native Android (and, for free, iOS) shell. The React app doesn't get rewritten — `npx cap init`, add the `android` platform, and `vite build`'s output becomes the app's bundled web content, loaded into a native WebView. On top of that, Capacitor plugins give access to things a browser tab can't reliably get:

- **Camera** — direct-to-filesystem photo capture, not a `<input type="file">` picker.
- **Filesystem** — a real place to stash photos and a local database file.
- **Network** — reliable "am I online right now" state and change events (the browser's `navigator.onLine` is not trustworthy — it lies on some networks).
- **App / background task lifecycle** — so a sync can resume the moment the app is foregrounded or connectivity returns, not just "whenever the browser feels like firing a background-sync event" (see the Web Background Sync note below).

This is the path that makes offline actually reliable. It's also more setup: Android Studio, a signing keystore eventually, and a real Android device or emulator to test against.

### Option B — TWA (Trusted Web Activity), no offline

A [TWA](https://developer.chrome.com/docs/android/trusted-web-activity) is a thin wrapper that lists the *existing PWA* on the Play Store — Bubblewrap CLI or PWABuilder generates it, requires a `.well-known/assetlinks.json` for domain verification, and the result launches full-screen with no browser chrome. Effort is a fraction of Capacitor's. The catch: a TWA is still just Chrome under the hood — same offline limitations as the web app has today, just wearing an app icon. If offline capture turns out to matter less than expected, this is the cheaper way to get "installable on Android" without touching the data layer at all.

**Recommendation:** Capacitor, because offline ocular reports is the actual ask, not just an icon on the home screen. If that requirement ever gets dropped, revisit — TWA would be a half-day of work instead of what follows.

---

## Part 2 — Offline data architecture

This is the real engineering. Four pieces, in dependency order.

### 2.1 Local database

A SQLite database on-device via [`@capacitor-community/sqlite`](https://github.com/capacitor-community/sqlite) — not IndexedDB/Dexie. Reasoning: the ocular report has ~50 fields plus up to 10 photo slots per inspection, technicians may have several inspections queued before a resync, and a real relational store makes the sync queue (below) much easier to reason about than a document blob in IndexedDB. Three tables, mirroring (not duplicating) the Supabase schema:

- `local_surveys` — one row per inspection downloaded for offline use, holding every `ReportData` field plus `sync_status` (`synced` | `pending` | `syncing` | `error`) and `updated_at`.
- `local_survey_photos` — one row per captured photo: local filesystem path, target slot (`SURVEY_PHOTO_SLOTS` key from `src/lib/constants.ts`), caption, `sync_status`.
- `sync_queue` — an ordered log of pending operations (`upsert_report_patch`, `upload_photo`), each row holding just enough to replay it: survey id, the patch/photo reference, a retry count, and the last error message if one exists. This is what actually gets walked when connectivity returns — not "diff the local DB against Supabase," which is a much harder problem.

### 2.2 Pre-visit sync (before the technician loses signal)

Offline only works for inspections the app already knows about. So: when a technician opens their assigned schedule while still online, each upcoming inspection gets a **"Download for offline"** action (or this happens automatically for anything scheduled in the next 24–48 hours — a product decision, not a technical one, see Open Questions). Downloading pulls:

- The lead + property record (name, address, phone — everything `ReportHeader`/`OcularReportForm` needs to render).
- The current survey row, if one already exists (e.g., resuming a partially-filled report).
- Nothing else — quotes, contracts, other projects stay out of scope for the offline store.

This writes into `local_surveys`, keyed by the real Supabase survey id (or a client-generated UUID if the survey doesn't exist yet — a brand-new inspection can be captured fully offline, not just an edit to an existing one).

### 2.3 Offline-first write path

Today, `OcularReportForm.tsx` calls `saveSurveyReport()` (in `src/lib/supabase/queries/surveys.ts`) directly, per-section, straight to Supabase — see the "every section saves on its own" comment already in that file. That comment's reasoning ("often on a phone with poor signal") is exactly the gap this plan closes; today a poor-signal save just fails.

New flow: the form's save path writes to `local_surveys` first (always succeeds, instant, no network). A row is pushed onto `sync_queue`. If the device is online (Capacitor `Network` plugin), the queue is drained immediately — same effective behavior as today for a connected user. If offline, the write sits queued and the UI shows a "saved on this device, will sync" state rather than a spinner or an error toast.

This needs a thin adapter layer so `OcularReportForm` doesn't know or care whether it's talking to Supabase directly or to the local queue — a new `src/lib/offline/survey-repository.ts` (name tentative) that exposes the same shape `saveSurveyReport`/`addSurveyPhotos` already have, and internally decides local-first vs. direct based on platform (web build keeps calling Supabase directly; the Capacitor build routes through the local DB). This is the one real structural change to existing code — everywhere else, the existing Supabase query functions stay exactly as they are and become what the sync engine calls when it replays the queue.

### 2.4 Photo capture and sync

Capacitor's `Camera` plugin captures directly to the filesystem (`Filesystem` plugin), not into JS memory as a `File` blob — important, because the existing `compressImage`/`prepareUpload` step (`src/lib/supabase/storage.ts`) assumes a `File` object; it'll need a filesystem-path-aware variant for the offline build. Each captured photo becomes a `local_survey_photos` row + a queued `upload_photo` sync operation, independent of the report's own field data — a report with a failed photo upload shouldn't block syncing the 40 fields that *did* go through.

### 2.5 The sync engine

A background process — realistically, a "resume" hook fired on `App.resume` (Capacitor's app-state plugin) and on `Network` reconnect events, not a true OS-level background sync. Being upfront about why: the [Web Background Sync API](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API) has patchy support and doesn't run reliably inside an Android WebView the way it does in Chrome proper — a foreground-triggered retry loop (app opens or reconnects → drain the queue) is the dependable version of this, at the cost of not syncing while the app is fully closed and backgrounded for hours. If that gap matters later, a native Android `WorkManager` job (via a small custom Capacitor plugin) is the real fix — flagged as Phase 2, not attempted in the first pass.

Draining the queue means: for each `sync_queue` row, call the *existing* `saveSurveyReport`/`addSurveyPhotos` Supabase functions, mark the row synced on success, increment retry count + store the error on failure, and surface a "3 items waiting to sync" indicator (with a manual retry action) somewhere persistent in the UI — not buried, since a technician needs to know their work isn't actually saved to the server yet.

### 2.6 Conflict handling — the simplifying assumption

A given inspection visit is done by one technician, alone, onsite. Two people editing the same survey offline at the same time is not a realistic scenario for this business, so this plan deliberately does **not** build general conflict resolution (CRDTs, three-way merge, etc.) — that would be solving a problem this workflow doesn't have. The one real case worth handling: a report gets edited both offline (by the assigned tech) and online (by, say, an office admin fixing a typo) before the offline device resyncs. Recommended handling: **last-write-wins by timestamp**, with a warning toast on the syncing device if the remote `updated_at` moved since the local copy was downloaded ("this report changed since you went offline — your version was still saved, review it"). Simple, honest about the edge case, doesn't pretend to solve something that isn't the actual risk here.

---

## Part 3 — Phased rollout

### Phase 0 — Installable shell, still fully online (~1–2 days)
- `npx cap init`, add the Android platform, get a debug build installing on a real device via Android Studio.
- Smoke-test the *existing* app inside the WebView — camera file-input, geolocation (`useMyLocation` in `OcularReportForm.tsx` already uses `navigator.geolocation`), and Supabase auth all need to keep working unchanged.
- No offline behavior yet. Deliverable: an APK a technician can sideload that behaves identically to the web app.

### Phase 1 — Offline ocular reports (~1–2 weeks, the actual ask)
- `@capacitor-community/sqlite` set up, the three local tables above.
- "Download for offline" action on an assigned inspection (or automatic pre-fetch — decide in Open Questions).
- The `survey-repository` adapter layer; `OcularReportForm` routes through it instead of calling Supabase directly on the Capacitor build.
- Camera plugin integration replacing the current `<input type="file">` photo picker, filesystem-backed photo queue.
- Sync engine (drain-on-resume/reconnect), sync-status UI (per-report badge + a global pending-count indicator with manual retry).
- Explicitly out of scope for this phase: offline editing of anything *other* than the ocular report (quotes, stage changes, tickets stay online-only).

### Phase 2 — Optional follow-ups, not in the first build
- Offline viewing of the day's assigned schedule + project details (not just the report form) — needs React Query's cache persisted locally (`@tanstack/react-query-persist-client` + a Capacitor `Preferences`/SQLite storage adapter) rather than just living in memory.
- A real background sync (native `WorkManager` job) instead of resume/reconnect-triggered draining, if "syncs even while the app is closed for hours" turns out to matter.
- Play Store publishing: signing keystore, store listing, versioned release process.
- iOS build — Capacitor gives this mostly for free once Android is working, if ever wanted.

---

## Open Questions

> [!IMPORTANT]
> **How far ahead does offline data get downloaded?** Automatically for everything scheduled in the next N days, or a manual "download for offline" tap per inspection? Automatic is more foolproof (a tech never forgets); manual is less storage and less surprising. Affects Phase 1's scope directly.

> [!IMPORTANT]
> **Session expiry while offline.** Supabase's JWT needs connectivity to refresh. A technician offline long enough (a multi-day remote job site?) could come back to a session that needs re-authentication before it can sync — worth deciding whether that's an acceptable edge case or needs a longer-lived refresh strategy.

> [!NOTE]
> **How much local photo storage is reasonable?** Up to 10 photo slots per inspection, multiple inspections potentially queued before a resync. Worth a rough device-storage budget and a "sync eagerly on any signal, don't wait for Wi-Fi" default given the volumes are unlikely to be huge, but worth confirming rather than assuming.

> [!NOTE]
> **Is Android the only target, or does iOS matter too?** The ask was specifically Android. Capacitor makes iOS close to free later if it comes up, but it's not part of this plan's scope or estimate.

---

## Summary

| | |
|---|---|
| **App shell** | Capacitor (native Android wrapper around the existing Vite/React build) |
| **Local storage** | SQLite via `@capacitor-community/sqlite` — surveys, photos, sync queue |
| **Write path** | Local-first: save to device instantly, queue, drain when online |
| **Photos** | Native Camera plugin → filesystem → queued upload, independent of form-field sync |
| **Sync trigger** | App resume + network-reconnect (not true background sync — see 2.5) |
| **Conflicts** | Last-write-wins by timestamp + a warning if the remote record moved — no general merge logic, deliberately |
| **Scope** | Ocular report capture only; everything else in the CRM stays online-only for now |
