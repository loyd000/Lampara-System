/**
 * Local storage for offline Ocular Report drafts — the entire "offline mode"
 * for the report form. See docs/plans/Offline_Export_Import_plan.md.
 *
 * Deliberately plain `localStorage`, not IndexedDB: this never needs a schema
 * migration, an async open/version lifecycle, or a sync queue, because it
 * doesn't sync at all — a draft is exported to a file and later imported by
 * hand into the real, online form. No network call, no auth check, and no
 * dependency on `navigator.onLine` exists anywhere in this module.
 */

import type { FormValues } from "@/pages/leads/_components/ocular/formValues.ts";

export type OfflineDraft = {
    id: string;
    /** Free text — there's no live leads list to match against (see the
     *  plan's "pure free-text" decision), so this is typed by whoever fills
     *  the report and matched by hand when it's imported back at the office. */
    customerName: string;
    address: string;
    note: string;
    values: FormValues;
    savedAt: string;
};

const KEY = "lampara.offlineDrafts.v1";

export function listDrafts(): OfflineDraft[] {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as OfflineDraft[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function getDraft(id: string): OfflineDraft | undefined {
    return listDrafts().find((d) => d.id === id);
}

/** Upserts by `id` — the offline page calls this on every "Save Draft" tap,
 *  so a draft in progress is overwritten in place, not duplicated. */
export function saveDraft(draft: OfflineDraft): void {
    const drafts = listDrafts().filter((d) => d.id !== draft.id);
    drafts.unshift(draft);
    try {
        localStorage.setItem(KEY, JSON.stringify(drafts));
    } catch {
        // Storage full or private browsing — the draft just won't persist
        // across a reload; the caller's in-memory copy still exports fine.
    }
}

export function deleteDraft(id: string): void {
    const drafts = listDrafts().filter((d) => d.id !== id);
    try {
        localStorage.setItem(KEY, JSON.stringify(drafts));
    } catch {
        // ignore — nothing to roll back to
    }
}

/** Reads and loosely validates an uploaded `.json` file — used by both the
 *  offline page (re-opening a previously exported draft isn't needed today,
 *  but the same reader works for it) and OcularInspectionTab's "Import
 *  Offline Report" button. */
export async function readDraftFile(file: File): Promise<OfflineDraft> {
    const text = await file.text();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error("That file isn't valid JSON.");
    }
    if (!parsed || typeof parsed !== "object" || !("values" in parsed)) {
        throw new Error("This doesn't look like an exported offline report.");
    }
    const draft = parsed as Partial<OfflineDraft>;
    return {
        id: draft.id ?? crypto.randomUUID(),
        customerName: draft.customerName ?? "",
        address: draft.address ?? "",
        note: draft.note ?? "",
        values: draft.values as FormValues,
        savedAt: draft.savedAt ?? new Date().toISOString(),
    };
}
