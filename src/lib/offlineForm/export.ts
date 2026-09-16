/**
 * Saves an offline draft to a `.json` file the technician can carry back to
 * the office. A plain `<a download>` Blob link — the standard web approach —
 * doesn't reliably do anything visible inside a Capacitor WebView on Android
 * (no download notification, no file anyone can find afterward), so native
 * gets the real thing: write the file via @capacitor/filesystem, then hand
 * it to Android's native Share sheet via @capacitor/share, which lets the
 * technician pick "Save to Files", email it, send it via Drive, etc.
 */

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { OfflineDraft } from "./drafts.ts";

function fileName(draft: OfflineDraft): string {
    const safe = (draft.customerName || "offline-report")
        .trim()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    const date = draft.savedAt.slice(0, 10);
    return `ocular-report-${safe || "untitled"}-${date}.json`;
}

export async function exportDraft(draft: OfflineDraft): Promise<void> {
    const json = JSON.stringify(draft, null, 2);
    const name = fileName(draft);

    if (Capacitor.isNativePlatform()) {
        const { uri } = await Filesystem.writeFile({
            path: name,
            data: json,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
        });
        await Share.share({
            title: "Offline Ocular Report",
            dialogTitle: "Save or share this report",
            files: [uri],
        });
        return;
    }

    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } finally {
        URL.revokeObjectURL(url);
    }
}
