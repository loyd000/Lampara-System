/**
 * Drains the offline patch/photo queues against Supabase.
 *
 * Ordering and error handling matter here: patches are field-scoped (see
 * survey-repository.ts), so replaying them in creation order against
 * whatever the row currently holds never clobbers a field nobody touched —
 * the same guarantee the online save path already has. Photos replay with a
 * pre-assigned id/path so a retried upload is idempotent (see
 * addSurveyPhotos's `precomputed` param).
 *
 * A network error leaves the item "pending" and stops the whole drain (the
 * rest of the queue is likely unreachable too, and skipping ahead would
 * reorder patches for the same survey). Any other error — RLS denial, 0 rows
 * affected, validation — is terminal: the survey was deleted or reassigned
 * while offline, or the patch is simply invalid, and retrying it forever
 * would never succeed.
 */

import { useEffect } from "react";
import { offlineDb } from "./db.ts";
import { saveSurveyReport, addSurveyPhotos } from "../supabase/queries/surveys.ts";

/**
 * True for a connectivity failure — as opposed to a real error (RLS denial,
 * validation, deleted row) that happened to occur during an online attempt.
 *
 * Checks the message, not `instanceof TypeError`: a raw rejected fetch is a
 * TypeError, but supabase-js/toAppError often re-wraps it into a plain Error
 * first (see saveSurveyReport), which keeps the "Failed to fetch" wording but
 * loses the original class. `instanceof TypeError` alone missed that wrapped
 * case, which is exactly how a genuine network failure during an online
 * attempt (navigator.onLine said "online" when the device wasn't actually
 * reachable — common on Android WebView) got surfaced as a raw error toast
 * instead of falling back to the offline queue, and also risked the sync
 * engine misclassifying a transient connectivity blip as terminal instead of
 * leaving it pending for retry.
 */
export function isNetworkError(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return /fetch|network/i.test(message);
}

function errorStatus(err: unknown): "pending" | "failed" {
    return isNetworkError(err) ? "pending" : "failed";
}

function errorMessage(err: unknown): string {
    return err instanceof Error ? err.message : "Sync failed";
}

/**
 * Drains patchQueue then photoQueue, oldest first. Scoped to one survey when
 * `surveyId` is given (called right after a save/photo-add while online),
 * otherwise drains everything (reconnect/resume/manual sync).
 */
export async function drainQueue(surveyId?: string): Promise<void> {
    const patches = await offlineDb.patchQueue
        .where("status")
        .notEqual("failed")
        .filter((p) => !surveyId || p.surveyId === surveyId)
        .sortBy("createdAt");

    for (const item of patches) {
        await offlineDb.patchQueue.update(item.id, { status: "syncing" });
        try {
            await saveSurveyReport({ surveyId: item.surveyId, patch: item.patch });
            await offlineDb.patchQueue.delete(item.id);
        } catch (err) {
            await offlineDb.patchQueue.update(item.id, {
                status: errorStatus(err),
                error: errorMessage(err),
            });
            if (isNetworkError(err)) return; // stop the whole drain, don't skip ahead
        }
    }

    const photos = await offlineDb.photoQueue
        .where("status")
        .notEqual("failed")
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
            await offlineDb.photoQueue.update(item.id, {
                status: errorStatus(err),
                error: errorMessage(err),
            });
            if (isNetworkError(err)) return;
        }
    }
}

/**
 * Fires drainQueue() on reconnect, tab/app resume, and once on mount (to
 * catch a reconnect that happened before this hook was mounted). Mounted
 * once, in AppLayout.
 */
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
