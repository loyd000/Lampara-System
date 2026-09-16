import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const surveysApi = vi.hoisted(() => ({
    saveSurveyReport: vi.fn(),
    addSurveyPhotos: vi.fn(),
}));

vi.mock("../supabase/queries/surveys.ts", () => surveysApi);

import { offlineDb } from "./db.ts";
import { drainQueue } from "./sync-engine.ts";

async function clearQueues() {
    await offlineDb.patchQueue.clear();
    await offlineDb.photoQueue.clear();
}

beforeEach(async () => {
    vi.clearAllMocks();
    await clearQueues();
});

afterEach(async () => {
    await clearQueues();
});

describe("drainQueue — patches", () => {
    it("replays queued patches in creation order and empties the queue", async () => {
        surveysApi.saveSurveyReport.mockResolvedValue(undefined);
        await offlineDb.patchQueue.bulkAdd([
            {
                id: "p1",
                surveyId: "s1",
                patch: { roofType: "metal" },
                createdAt: "2026-01-01T00:00:00.000Z",
                status: "pending",
            },
            {
                id: "p2",
                surveyId: "s1",
                patch: { reportNotes: "ok" },
                createdAt: "2026-01-01T00:00:01.000Z",
                status: "pending",
            },
        ]);

        await drainQueue();

        expect(surveysApi.saveSurveyReport.mock.calls).toEqual([
            [{ surveyId: "s1", patch: { roofType: "metal" } }],
            [{ surveyId: "s1", patch: { reportNotes: "ok" } }],
        ]);
        expect(await offlineDb.patchQueue.count()).toBe(0);
    });

    it("never sends a field a patch didn't touch — each patch stays scoped to its own dirty fields", async () => {
        surveysApi.saveSurveyReport.mockResolvedValue(undefined);
        await offlineDb.patchQueue.add({
            id: "p1",
            surveyId: "s1",
            patch: { roofType: "metal" },
            createdAt: "t",
            status: "pending",
        });

        await drainQueue();

        const [[arg]] = surveysApi.saveSurveyReport.mock.calls;
        expect(Object.keys(arg.patch)).toEqual(["roofType"]);
    });

    it("stops the drain on a network error and leaves the item pending for the next attempt", async () => {
        surveysApi.saveSurveyReport.mockRejectedValueOnce(new TypeError("Failed to fetch"));
        await offlineDb.patchQueue.add({
            id: "p1",
            surveyId: "s1",
            patch: { roofType: "metal" },
            createdAt: "t",
            status: "pending",
        });

        await drainQueue();

        const remaining = await offlineDb.patchQueue.toArray();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].status).toBe("pending");
    });

    it("marks a non-network error (RLS denial, deleted survey) terminal instead of retrying forever", async () => {
        surveysApi.saveSurveyReport.mockRejectedValueOnce(new Error("row-level security"));
        await offlineDb.patchQueue.add({
            id: "p1",
            surveyId: "s1",
            patch: { roofType: "metal" },
            createdAt: "t",
            status: "pending",
        });

        await drainQueue();

        const remaining = await offlineDb.patchQueue.toArray();
        expect(remaining[0].status).toBe("failed");
        expect(remaining[0].error).toBe("row-level security");
    });

    it("does not retry an item already marked failed", async () => {
        await offlineDb.patchQueue.add({
            id: "p1",
            surveyId: "s1",
            patch: { roofType: "metal" },
            createdAt: "t",
            status: "failed",
            error: "already failed",
        });

        await drainQueue();

        expect(surveysApi.saveSurveyReport).not.toHaveBeenCalled();
    });
});

describe("drainQueue — photos", () => {
    it("replays a queued photo with its pre-assigned id/path so a retry can't duplicate it", async () => {
        surveysApi.addSurveyPhotos.mockResolvedValue(1);
        await offlineDb.photoQueue.add({
            id: "photo-1",
            surveyId: "s1",
            category: "roof_view",
            path: "surveys/s1/photo-1-roof.webp",
            blob: new Blob(["x"], { type: "image/webp" }),
            fileName: "roof.webp",
            contentType: "image/webp",
            sortOrder: 0,
            createdAt: "t",
            status: "pending",
        });

        await drainQueue();

        expect(surveysApi.addSurveyPhotos).toHaveBeenCalledTimes(1);
        const [arg] = surveysApi.addSurveyPhotos.mock.calls[0];
        expect(arg.precomputed).toEqual([
            { id: "photo-1", path: "surveys/s1/photo-1-roof.webp", sortOrder: 0 },
        ]);
        expect(await offlineDb.photoQueue.count()).toBe(0);
    });

    it("only drains photos scoped to the given surveyId when one is passed", async () => {
        surveysApi.addSurveyPhotos.mockResolvedValue(1);
        await offlineDb.photoQueue.bulkAdd([
            {
                id: "photo-1",
                surveyId: "s1",
                category: "roof_view",
                path: "surveys/s1/photo-1.webp",
                blob: new Blob(["x"]),
                fileName: "a.webp",
                contentType: "image/webp",
                sortOrder: 0,
                createdAt: "t",
                status: "pending",
            },
            {
                id: "photo-2",
                surveyId: "s2",
                category: "roof_view",
                path: "surveys/s2/photo-2.webp",
                blob: new Blob(["y"]),
                fileName: "b.webp",
                contentType: "image/webp",
                sortOrder: 0,
                createdAt: "t",
                status: "pending",
            },
        ]);

        await drainQueue("s1");

        expect(surveysApi.addSurveyPhotos).toHaveBeenCalledTimes(1);
        expect(surveysApi.addSurveyPhotos.mock.calls[0][0].surveyId).toBe("s1");
        expect(await offlineDb.photoQueue.count()).toBe(1);
    });
});
