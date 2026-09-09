import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("../client.ts", () => ({
    supabase: db,
    toAppError: (_error: unknown, message: string) => new Error(message),
    unwrap: (result: { data: unknown }) => result.data,
}));

vi.mock("../storage.ts", () => ({
    MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
    formatBytes: (bytes: number) => `${bytes} B`,
    signedUrlMap: vi.fn(async (bucket: string, paths: (string | null)[]) => {
        const urls = new Map<string, string>();
        for (const path of paths) if (path) urls.set(path, `https://signed/${bucket}/${path}`);
        return urls;
    }),
    buildPath: vi.fn(),
    prepareUpload: vi.fn(),
    removeFiles: vi.fn(),
    uploadFile: vi.fn(),
}));

import { kindOf, listLeadFiles, rejectionReason } from "./lead-files.ts";

/** One PostgREST chain, ending in whatever rows the caller asked for. */
function rows(data: unknown[]) {
    const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        returns: () => ({ data, error: null }),
    };
    return chain;
}

const leadFile = {
    id: "file-1",
    lead_id: "lead-1",
    path: "leads/lead-1/aaa-permit.pdf",
    name: "permit.pdf",
    mime: "application/pdf",
    size_bytes: 2048,
    kind: "document",
    uploaded_by: "user-1",
    created_at: "2026-09-01T10:00:00Z",
    uploader: { name: "Office Admin", email: null },
};

const reportPhoto = {
    id: "photo-1",
    survey_id: "survey-1",
    category: "roof_view",
    path: "surveys/survey-1/bbb-roof.webp",
    caption: null,
    sort_order: 0,
    created_by: "user-2",
    created_at: "2026-09-02T10:00:00Z",
    uploader: { name: "Field Tech", email: null },
};

beforeEach(() => {
    vi.clearAllMocks();
    db.from.mockImplementation((table: string) =>
        table === "lead_files" ? rows([leadFile]) : rows([reportPhoto]),
    );
});

describe("the Overview file list", () => {
    it("merges lead files with inspection photos, newest first", async () => {
        const files = await listLeadFiles("lead-1");

        expect(files.map((f) => f._id)).toEqual(["photo-1", "file-1"]);
        expect(files.map((f) => f.source)).toEqual(["inspection", "lead"]);
    });

    it("lists an inspection photo under its report slot but will not let the Overview remove it", async () => {
        const [photo, file] = await listLeadFiles("lead-1");

        // The photo is shown here and stored once — the row still belongs to
        // the report, which is the only place it may be deleted from.
        expect(photo.sourceLabel).toBe("Roof View");
        expect(photo.removable).toBe(false);
        expect(photo.url).toBe("https://signed/photos/surveys/survey-1/bbb-roof.webp");

        expect(file.removable).toBe(true);
        expect(file.url).toBe("https://signed/documents/leads/lead-1/aaa-permit.pdf");
    });

    it("shows the uploader's original filename, not the uuid-prefixed object path", async () => {
        const [, file] = await listLeadFiles("lead-1");
        expect(file.name).toBe("permit.pdf");
    });
});

describe("upload validation", () => {
    function file(name: string, type: string, size: number): File {
        const f = new File(["x"], name, { type });
        Object.defineProperty(f, "size", { value: size });
        return f;
    }

    it("routes images to the photo bucket and everything else to documents", () => {
        expect(kindOf(file("roof.jpg", "image/jpeg", 100))).toBe("photo");
        expect(kindOf(file("permit.pdf", "application/pdf", 100))).toBe("document");
    });

    it("accepts images, PDF, Word and Excel", () => {
        expect(rejectionReason(file("roof.jpg", "image/jpeg", 100))).toBeNull();
        expect(rejectionReason(file("permit.pdf", "application/pdf", 100))).toBeNull();
        expect(
            rejectionReason(
                file(
                    "load.xlsx",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    100,
                ),
            ),
        ).toBeNull();
    });

    it("rejects an unsupported type and anything over the bucket limit", () => {
        expect(rejectionReason(file("archive.zip", "application/zip", 100))).toContain(
            "only images, PDF, Word and Excel",
        );
        expect(
            rejectionReason(file("huge.jpg", "image/jpeg", 11 * 1024 * 1024)),
        ).toContain("the limit is");
    });

    it("names the file the user picked, not the compressed copy", () => {
        const compressed = file("roof.webp", "image/webp", 11 * 1024 * 1024);
        expect(rejectionReason(compressed, "roof.HEIC")).toContain("roof.HEIC");
    });
});
