/**
 * Opening a generated PDF in the browser's print preview, rather than dropping
 * it straight into the downloads folder.
 *
 * The point is control over where the file lands: Chrome's "Save as PDF"
 * destination asks for a folder and a filename, and pre-fills that filename
 * from the PDF's own `/Title` metadata. That is why every caller passes the
 * same string to `<Document title>` and to `printPdf` — get them out of step
 * and the preview offers the wrong name.
 */

/**
 * Characters Windows refuses in a filename. Spaces and hyphens are wanted -
 * "John Dela Cruz - Quotation" is the point - so the class stays narrow.
 */
const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|]/g;

/**
 * "John Dela Cruz - Quotation" — the document's name in prose, used both as
 * the PDF title and as the fallback download filename.
 */
export function leadDocumentName(
    firstName: string | undefined,
    lastName: string | undefined,
    document: string,
): string {
    const person = `${firstName ?? ""} ${lastName ?? ""}`.replace(/\s+/g, " ").trim();
    const name = person ? `${person} - ${document}` : document;
    return name.replace(ILLEGAL_IN_FILENAME, "").trim();
}

function downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = fileName;
    window.document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Shows `blob` in the print preview. Resolves with what actually happened, so
 * the caller can word its toast honestly rather than claiming a download that
 * may not have happened.
 *
 * Falls back to a plain download when the preview can't be opened — Firefox and
 * Safari don't reliably print a PDF embedded in an iframe, and there is no
 * feature test for it, only the failure. A new tab would be the nicer fallback
 * but `window.open` is pop-up blocked here: generating the PDF is async, so by
 * the time this runs the click that started it is no longer the current user
 * gesture. A download link still works without one.
 */
export function printPdf(blob: Blob, fallbackFileName: string): Promise<"printed" | "downloaded"> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(blob);
        const frame = window.document.createElement("iframe");

        // Not `display: none` — several browsers refuse to print a frame that
        // was never laid out. A zero-sized fixed frame is laid out and unseen.
        frame.style.position = "fixed";
        frame.style.right = "0";
        frame.style.bottom = "0";
        frame.style.width = "0";
        frame.style.height = "0";
        frame.style.border = "0";
        frame.setAttribute("aria-hidden", "true");
        frame.setAttribute("tabindex", "-1");

        let settled = false;

        function fallback() {
            if (settled) return;
            settled = true;
            window.clearTimeout(timer);
            frame.remove();
            URL.revokeObjectURL(url);
            downloadBlob(blob, fallbackFileName);
            resolve("downloaded");
        }

        // If the frame never fires `load` — a blocked or absent PDF viewer —
        // nothing else will ever settle this promise.
        const timer = window.setTimeout(fallback, 5_000);

        frame.onload = () => {
            if (settled) return;
            window.clearTimeout(timer);
            try {
                const view = frame.contentWindow;
                if (!view) throw new Error("The print preview could not be opened");
                view.focus();
                view.print();
                settled = true;
                // Chrome blocks in `print()` until the dialog closes, but not
                // every browser does, and revoking the URL or removing the
                // frame while the dialog is open prints a blank page. Outliving
                // the dialog by a wide margin costs one detached iframe.
                setTimeout(() => {
                    frame.remove();
                    URL.revokeObjectURL(url);
                }, 60_000);
                resolve("printed");
            } catch {
                fallback();
            }
        };

        frame.onerror = fallback;
        frame.src = url;
        window.document.body.appendChild(frame);
    });
}
