/**
 * The Overview's files — photos and documents belonging to the lead itself.
 *
 * **The list is a view over two tables, not a copy.** Photos taken during a
 * site ocular inspection already live in `survey_photos`, under the report slot
 * they fill; this module reads `lead_files ∪ survey_photos` and labels the
 * latter with that slot. Copying them into a second table would double every
 * inspection photo against a 1 GB quota and leave two rows to keep in step.
 *
 * The consequence, deliberately: an inspection photo is *listed* here but not
 * *removable* here. It belongs to the report, and that is where it is managed.
 */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { LeadFileKind, LeadFileRow, SurveyPhotoRow } from "../database.types.ts";
import { SURVEY_PHOTO_SLOTS } from "../../constants.ts";
import {
    MAX_UPLOAD_BYTES,
    buildPath,
    formatBytes,
    prepareUpload,
    removeFiles,
    signedUrlMap,
    uploadFile,
    type Bucket,
} from "../storage.ts";
import { displayName, type Id, type LeadFileEntry } from "../types.ts";
import { logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

/**
 * Files per lead before the uploader starts warning.
 *
 * A soft cap: it says something, it does not block. A site with forty photos is
 * unusual enough to be worth a sentence, and rare enough that refusing the
 * forty-first would be wrong.
 */
export const LEAD_FILE_SOFT_CAP = 40;

const DOCUMENT_MIME_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

/** What the file picker offers, and what the checks below accept. */
export const ACCEPTED_UPLOAD_TYPES = ["image/*", ...DOCUMENT_MIME_TYPES].join(",");

export function kindOf(file: File): LeadFileKind {
    return file.type.startsWith("image/") ? "photo" : "document";
}

function bucketFor(kind: LeadFileKind): Bucket {
    return kind === "photo" ? "photos" : "documents";
}

const SLOT_LABELS = new Map(SURVEY_PHOTO_SLOTS.map((slot) => [slot.key, slot.label]));

/**
 * Why this file cannot be uploaded, or null if it can.
 *
 * The bucket enforces both of these too (0014) — this exists so the answer is a
 * sentence in the UI instead of a 413 from the storage API.
 */
export function rejectionReason(file: File, label = file.name): string | null {
    const kind = kindOf(file);
    if (kind === "document" && !DOCUMENT_MIME_TYPES.includes(file.type)) {
        return `${label} — only images, PDF, Word and Excel files can be attached`;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return `${label} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_UPLOAD_BYTES)}`;
    }
    return null;
}

export async function listLeadFiles(leadId: Id<"leads">): Promise<LeadFileEntry[]> {
    const [files, photos] = await Promise.all([
        (async () =>
            unwrap(
                await supabase
                    .from("lead_files")
                    .select("*, uploader:users!lead_files_uploaded_by_fkey(name, email)")
                    .eq("lead_id", leadId)
                    .order("created_at", { ascending: false })
                    .returns<(LeadFileRow & { uploader: NameOnly })[]>(),
                "Failed to load files",
            ))(),
        // `surveys!inner` turns the embed into a join, so this filters photos by
        // the lead that owns their inspection without a second round trip.
        (async () =>
            unwrap(
                await supabase
                    .from("survey_photos")
                    .select(
                        "*, surveys!inner(lead_id), " +
                            "uploader:users!survey_photos_created_by_fkey(name, email)",
                    )
                    .eq("surveys.lead_id", leadId)
                    .order("created_at", { ascending: false })
                    .returns<(SurveyPhotoRow & { uploader: NameOnly })[]>(),
                "Failed to load inspection photos",
            ))(),
    ]);

    // Both buckets in one round trip each, across both sources.
    const [photoUrls, documentUrls] = await Promise.all([
        signedUrlMap("photos", [
            ...files.filter((f) => f.kind === "photo").map((f) => f.path),
            ...photos.map((p) => p.path),
        ]),
        signedUrlMap(
            "documents",
            files.filter((f) => f.kind === "document").map((f) => f.path),
        ),
    ]);

    const own: LeadFileEntry[] = files.map((row) => ({
        _id: row.id,
        _creationTime: Date.parse(row.created_at),
        kind: row.kind,
        name: row.name,
        mime: row.mime,
        sizeBytes: Number(row.size_bytes),
        path: row.path,
        bucket: bucketFor(row.kind),
        url:
            (row.kind === "photo" ? photoUrls : documentUrls).get(row.path) ?? null,
        source: "lead",
        sourceLabel: null,
        uploadedByName: row.uploader ? displayName(row.uploader) : null,
        removable: true,
    }));

    const fromReport: LeadFileEntry[] = photos.map((row) => ({
        _id: row.id,
        _creationTime: Date.parse(row.created_at),
        kind: "photo",
        // Report photos are stored by slot, not by filename, so the slot is the
        // only name worth showing.
        name: row.caption?.trim() || SLOT_LABELS.get(row.category) || "Inspection photo",
        mime: null,
        sizeBytes: null,
        path: row.path,
        bucket: "photos",
        url: photoUrls.get(row.path) ?? null,
        source: "inspection",
        sourceLabel: SLOT_LABELS.get(row.category) ?? "Inspection",
        uploadedByName: row.uploader ? displayName(row.uploader) : null,
        removable: false,
    }));

    return [...own, ...fromReport].sort((a, b) => b._creationTime - a._creationTime);
}

/**
 * Uploads files against the lead.
 *
 * One at a time, and the row is written as soon as its object lands: a partial
 * failure leaves the files that made it both stored and visible, rather than
 * rolling back a whole batch on someone uploading from a site on mobile data.
 *
 * Images are compressed first (see src/lib/image.ts), which is what keeps a
 * gigabyte worth thousands of photos rather than hundreds.
 */
export async function uploadLeadFiles(args: {
    leadId: Id<"leads">;
    files: File[];
}): Promise<{ saved: number; rejected: string[] }> {
    if (!args.files.length) return { saved: 0, rejected: [] };

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const rejected: string[] = [];
    const savedNames: string[] = [];

    for (const original of args.files) {
        // Compress before checking the size: a 12 MB phone photo is well under
        // the limit once it has been through the canvas, and rejecting it on
        // its original size would be refusing a file we can happily store.
        const file = await prepareUpload(original);

        const reason = rejectionReason(file, original.name);
        if (reason) {
            rejected.push(reason);
            continue;
        }

        const kind = kindOf(file);
        const bucket = bucketFor(kind);
        const path = buildPath("leads", args.leadId, file);

        await uploadFile(bucket, path, file);

        const { error } = await supabase.from("lead_files").insert({
            lead_id: args.leadId,
            path,
            name: original.name,
            mime: file.type || "application/octet-stream",
            size_bytes: file.size,
            kind,
            uploaded_by: auth.user.id,
        });
        if (error) {
            // The object is in the bucket but nothing references it.
            await removeFiles(bucket, [path]);
            if (!savedNames.length && !rejected.length) {
                throw toAppError(error, "Upload failed");
            }
            rejected.push(`${original.name} — could not be saved`);
            continue;
        }

        savedNames.push(original.name);
    }

    if (savedNames.length) {
        await logActivity({
            leadId: args.leadId,
            action:
                savedNames.length === 1
                    ? "File attached"
                    : `${savedNames.length} files attached`,
            details: savedNames.slice(0, 5).join(", "),
            entityType: "leadFile",
        });
    }

    return { saved: savedNames.length, rejected };
}

export async function deleteLeadFile(args: {
    fileId: Id<"leadFiles">;
    path: string;
    kind: LeadFileKind;
    leadId: Id<"leads">;
    name: string;
}): Promise<void> {
    const { error } = await supabase.from("lead_files").delete().eq("id", args.fileId);
    if (error) throw toAppError(error, "Failed to remove the file");

    // Best effort; an orphaned object is harmless next to a broken thumbnail.
    await removeFiles(bucketFor(args.kind), [args.path]);

    await logActivity({
        leadId: args.leadId,
        action: "File removed",
        details: args.name,
        entityType: "leadFile",
        touchLead: false,
    });
}
