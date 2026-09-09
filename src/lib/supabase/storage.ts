/**
 * Supabase Storage helpers — the replacement for Convex `generateUploadUrl()` +
 * `ctx.storage.getUrl()`.
 *
 * Both buckets are private, so nothing is readable by URL alone: reads go
 * through `signedUrl` / `signedUrls`, which mint short-lived tokens the browser
 * can put straight into an <img src> or download link.
 */

import { compressImage } from "../image.ts";
import { supabase, toAppError } from "./client.ts";

export type Bucket = "photos" | "documents";

/** How long a minted signed URL stays valid. Long enough to view a gallery. */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A year, and immutable with it.
 *
 * Object paths carry a UUID and are never rewritten — the same path always
 * serves the same bytes — so there is nothing for a shorter window to catch.
 * The old one-hour value meant a lead page with twenty photos re-downloaded all
 * twenty every hour, from an egress budget of 5 GB a month.
 */
const CACHE_CONTROL = "31536000, immutable";

/**
 * The largest file either bucket accepts, matching `file_size_limit` in 0014.
 *
 * Checked in the client so the user gets a sentence instead of a 413, but the
 * bucket is what actually enforces it.
 */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sanitize(filename: string): string {
    const cleaned = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    return cleaned || "file";
}

/** `surveys/<id>/<random>-<name>` — the prefix is what the storage RLS checks. */
export function buildPath(prefix: string, ownerId: string, file: File): string {
    return `${prefix}/${ownerId}/${crypto.randomUUID()}-${sanitize(file.name)}`;
}

/**
 * Uploads one file and returns the object path to persist on the owning row.
 * (Convex returned an opaque storage ID here; a path plays the same role.)
 */
export async function uploadFile(
    bucket: Bucket,
    path: string,
    file: File,
): Promise<string> {
    const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: CACHE_CONTROL,
        contentType: file.type || "application/octet-stream",
        upsert: false,
    });
    if (error) throw toAppError(error, "Upload failed");
    return path;
}

/**
 * Shrinks a photo before it is measured, named or uploaded.
 *
 * Compression can change the extension (`.HEIC` → `.webp`), so it has to run
 * before `buildPath` — otherwise the stored name would describe bytes that are
 * no longer there. Non-images and anything already small come back untouched.
 */
export function prepareUpload(file: File): Promise<File> {
    return compressImage(file);
}

/** Uploads several files sequentially, returning their paths in order. */
export async function uploadFiles(
    bucket: Bucket,
    prefix: string,
    ownerId: string,
    files: File[],
): Promise<string[]> {
    const paths: string[] = [];
    for (const original of files) {
        const file = await prepareUpload(original);
        paths.push(await uploadFile(bucket, buildPath(prefix, ownerId, file), file));
    }
    return paths;
}

/** A time-limited URL for one object, or null if it could not be signed. */
export async function signedUrl(
    bucket: Bucket,
    path: string | null | undefined,
): Promise<string | null> {
    if (!path) return null;
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return null;
    return data.signedUrl;
}

/**
 * Signs a batch of paths in one round trip. Objects that fail to sign (deleted,
 * or not visible to this role) are dropped rather than rendered broken.
 */
export async function signedUrls(
    bucket: Bucket,
    paths: string[] | null | undefined,
): Promise<string[]> {
    if (!paths?.length) return [];
    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return [];
    return data.flatMap((entry) =>
        !entry.error && entry.signedUrl ? [entry.signedUrl] : [],
    );
}

/**
 * Signs many paths in a single request and returns them keyed by path.
 *
 * List views hold rows that each carry their own paths; signing per row means
 * one HTTP request per row. Collect every path across the whole list, call this
 * once, then look each row's URLs back up.
 *
 * Paths that fail to sign are simply absent from the map, so a deleted object
 * renders as missing rather than as a broken link.
 */
export async function signedUrlMap(
    bucket: Bucket,
    paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
    const unique = [...new Set(paths.filter((p): p is string => !!p))];
    if (!unique.length) return new Map();

    const { data, error } = await supabase.storage
        .from(bucket)
        .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
    if (error || !data) return new Map();

    const urls = new Map<string, string>();
    for (const entry of data) {
        if (!entry.error && entry.signedUrl && entry.path) {
            urls.set(entry.path, entry.signedUrl);
        }
    }
    return urls;
}

/** Best-effort cleanup; a failure here should never block the calling flow. */
export async function removeFiles(bucket: Bucket, paths: string[]): Promise<void> {
    if (!paths.length) return;
    await supabase.storage.from(bucket).remove(paths);
}
