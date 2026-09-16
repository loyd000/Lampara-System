/**
 * Offline-aware entry points for the Site Ocular Report UI.
 *
 * Callers get back the same SurveyForLead shape the online path already
 * hands them — offline is a storage/sync detail, not a different data model.
 */

import { offlineDb, type LocalSurvey } from "./db.ts";
import { drainQueue } from "./sync-engine.ts";
import { listSurveysForLead, type SurveyReportPatch } from "../supabase/queries/surveys.ts";
import { compressImage } from "../image.ts";
import { buildPath } from "../supabase/storage.ts";
import type { SurveyForLead } from "../supabase/types.ts";
import type { SurveyPhotoCategory } from "../supabase/database.types.ts";

/** Fetches the full report (with photos) the same way the lead detail page
 *  does, and caches it verbatim. Requests persistent storage on the first
 *  download so Android/Chrome won't evict queued work under storage
 *  pressure — best-effort, ignored if the browser declines. */
export async function downloadSurveyForOffline(leadId: string, surveyId: string): Promise<void> {
    const surveys = await listSurveysForLead(leadId);
    const survey = surveys.find((s) => s._id === surveyId);
    if (!survey) throw new Error("Inspection not found");

    const now = new Date().toISOString();
    await offlineDb.surveys.put({ ...survey, downloadedAt: now, lastSyncedAt: now });

    if (navigator.storage?.persist) {
        void navigator.storage.persist();
    }
}

export async function getSurvey(surveyId: string): Promise<LocalSurvey | undefined> {
    return offlineDb.surveys.get(surveyId);
}

export async function getSurveysForLead(leadId: string): Promise<LocalSurvey[]> {
    return offlineDb.surveys.where("leadId").equals(leadId).toArray();
}

/**
 * Queues one field-scoped save. `patch` is the exact same dirty-fields-only
 * shape OcularReportForm.saveDraft already computes for the online path
 * (SurveyReportPatch = Partial<Pick<Survey, ...>>), applied optimistically to
 * the local copy so the form reflects it immediately, then queued for the
 * sync engine to replay. No field-name translation needed — patch keys are
 * already Survey's own camelCase keys.
 */
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

/**
 * Compresses and queues photos the same way the online path does (same
 * compressImage/buildPath calls), but assigns the future id/path up front so
 * a retried sync-engine upload is idempotent instead of a duplicate.
 */
export async function addPhotosOffline(args: {
    surveyId: string;
    category: SurveyPhotoCategory;
    files: File[];
}): Promise<void> {
    const local = await offlineDb.surveys.get(args.surveyId);
    const queuedSoFar = await offlineDb.photoQueue
        .where("surveyId")
        .equals(args.surveyId)
        .filter((p) => p.category === args.category)
        .count();
    const existingRemote = (local?.photos ?? []).filter(
        (p) => p.category === args.category,
    ).length;
    let sortOrder = queuedSoFar + existingRemote;

    for (const original of args.files) {
        const compressed = await compressImage(original);
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
