/**
 * IndexedDB (via Dexie) for offline Site Ocular Reports.
 *
 * `surveys` mirrors the exact SurveyForLead shape OcularReportForm/PhotoSlots
 * already consume online — no parallel data model. `patchQueue` and
 * `photoQueue` hold pre-diffed, pre-ID'd write operations so replaying them
 * against Supabase later is safe: see survey-repository.ts and sync-engine.ts
 * for why patches stay field-scoped and photos get a pre-assigned id/path.
 */

import Dexie, { type Table } from "dexie";
import type { SurveyForLead } from "../supabase/types.ts";
import type { SurveyReportPatch } from "../supabase/queries/surveys.ts";
import type { SurveyPhotoCategory } from "../supabase/database.types.ts";

export type QueueStatus = "pending" | "syncing" | "failed";

export type QueuedPatch = {
    id: string;
    surveyId: string;
    patch: SurveyReportPatch;
    createdAt: string;
    status: QueueStatus;
    error?: string;
};

export type QueuedPhoto = {
    id: string;
    surveyId: string;
    category: SurveyPhotoCategory;
    path: string;
    blob: Blob;
    fileName: string;
    contentType: string;
    sortOrder: number;
    createdAt: string;
    status: QueueStatus;
    error?: string;
};

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
