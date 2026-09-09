/**
 * Browser-side image compression, applied to every photo before it is uploaded.
 *
 * This is the single biggest thing standing between this app and the Supabase
 * free tier's 1 GB. A 12MP phone photo is 3–5 MB; capped at a 1600px long edge
 * and re-encoded as WebP it lands at 200–350 KB, with no visible loss at the
 * sizes the app displays or prints. That is the difference between roughly 250
 * photos per gigabyte and roughly 3,700.
 *
 * Doing it here rather than server-side costs nothing to run and makes uploads
 * far faster for a technician standing on a roof with one bar of signal.
 *
 * Every step degrades to "upload the original" rather than failing: a format
 * the browser cannot decode (HEIC outside Safari), a canvas that will not
 * export, a file that is already smaller than the re-encode would be. A photo
 * that arrives heavy is a quota problem; a photo that does not arrive at all is
 * a lost site visit.
 */

/** Long edge, in pixels. Comfortably above what the PDF report prints at. */
const MAX_EDGE = 1600;

/** WebP quality. 0.75 is where artefacts stop being visible on photographs. */
const QUALITY = 0.75;

/** Below this, re-encoding costs more bytes than it saves. */
const SKIP_BELOW_BYTES = 120 * 1024;

/** Cached because it allocates a canvas. */
let webpSupport: boolean | undefined;

function supportsWebp(): boolean {
    if (webpSupport === undefined) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = 1;
            canvas.height = 1;
            webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
        } catch {
            webpSupport = false;
        }
    }
    return webpSupport;
}

export function isImage(file: File): boolean {
    return file.type.startsWith("image/");
}

/**
 * Decodes a file into something drawable.
 *
 * `createImageBitmap` is the fast path and the only one that applies EXIF
 * orientation for us — a portrait phone photo drawn without it lands sideways.
 * The `<img>` fallback covers older Safari, which ignores the options bag.
 */
async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
    if (typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch {
            // Fall through — some builds reject the options bag rather than
            // ignoring it.
        }
    }

    const url = URL.createObjectURL(file);
    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Could not decode image"));
            img.src = url;
        });
    } finally {
        // Safe here: the decoded bitmap no longer needs the blob URL.
        URL.revokeObjectURL(url);
    }
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** `roof.HEIC` → `roof.webp`, so the stored name matches the stored bytes. */
function renamed(name: string, type: string): string {
    const extension = type === "image/webp" ? "webp" : "jpg";
    return `${name.replace(/\.[^.]+$/, "")}.${extension}`;
}

/**
 * Returns a compressed copy of `file`, or `file` itself when compressing it
 * would not help or is not possible.
 *
 * Never throws.
 */
export async function compressImage(file: File): Promise<File> {
    if (!isImage(file)) return file;
    // An already-small image is either a screenshot, a logo, or something
    // someone compressed on the way in. Re-encoding it risks growing it.
    if (file.size <= SKIP_BELOW_BYTES) return file;
    // Animated GIFs and vectors lose their whole point on a canvas.
    if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

    let source: ImageBitmap | HTMLImageElement;
    try {
        source = await decode(file);
    } catch {
        return file;
    }

    try {
        const width = "naturalWidth" in source ? source.naturalWidth : source.width;
        const height = "naturalHeight" in source ? source.naturalHeight : source.height;
        if (!width || !height) return file;

        const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);

        const context = canvas.getContext("2d");
        if (!context) return file;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);

        const type = supportsWebp() ? "image/webp" : "image/jpeg";
        const blob = await toBlob(canvas, type);
        // `toBlob` can hand back a PNG when it does not know the type asked for,
        // which would be larger than what came in.
        if (!blob || blob.type !== type || blob.size >= file.size) return file;

        return new File([blob], renamed(file.name, type), {
            type,
            lastModified: file.lastModified,
        });
    } catch {
        return file;
    } finally {
        if ("close" in source) source.close();
    }
}

/** Compresses a batch, keeping order. */
export function compressImages(files: File[]): Promise<File[]> {
    return Promise.all(files.map(compressImage));
}
