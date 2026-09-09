/**
 * Dated notes on a lead's Overview.
 *
 * Distinct from `activity_log`, which is the system's own record of what it
 * did and stays machine-written and append-only. These are what people choose
 * to write down — a phone call, a promise made, a reason the customer went
 * quiet — and their author can correct them afterwards.
 *
 * Writing a note still leaves one line in the activity log, without the body:
 * the log stays the answer to "when was this lead last touched", and the note
 * itself stays the one place its text lives.
 */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { LeadNoteRow } from "../database.types.ts";
import { displayName, toLeadNote, type Id, type LeadNoteEntry } from "../types.ts";
import { logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

/** Longest a single note may be. Past this it wants to be a document. */
export const NOTE_MAX_LENGTH = 4000;

export async function listLeadNotes(leadId: Id<"leads">): Promise<LeadNoteEntry[]> {
    const [{ data: auth }, rows] = await Promise.all([
        supabase.auth.getUser(),
        (async () =>
            unwrap(
                await supabase
                    .from("lead_notes")
                    .select("*, author:users!lead_notes_author_id_fkey(name, email)")
                    .eq("lead_id", leadId)
                    .order("created_at", { ascending: false })
                    .returns<(LeadNoteRow & { author: NameOnly })[]>(),
                "Failed to load notes",
            ))(),
    ]);

    return rows.map((row) => {
        const note = toLeadNote(row);
        return {
            ...note,
            authorName: displayName(row.author, "Removed user"),
            isOwn: !!auth.user && row.author_id === auth.user.id,
            // A note saved once has updated_at == created_at to the microsecond;
            // anything later means somebody changed the text.
            edited: Date.parse(row.updated_at) - Date.parse(row.created_at) > 1000,
        };
    });
}

export async function addLeadNote(args: {
    leadId: Id<"leads">;
    body: string;
}): Promise<Id<"leadNotes">> {
    const body = args.body.trim();
    if (!body) throw new Error("A note needs something in it");
    if (body.length > NOTE_MAX_LENGTH) {
        throw new Error(`Notes are limited to ${NOTE_MAX_LENGTH} characters`);
    }

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const row = unwrap(
        await supabase
            .from("lead_notes")
            .insert({ lead_id: args.leadId, author_id: auth.user.id, body })
            .select("id")
            .single(),
        "Failed to save the note",
    ) as { id: string };

    // No `details`: the body lives in the note, and copying it here would give
    // the same sentence two homes that can disagree after an edit.
    await logActivity({
        leadId: args.leadId,
        action: "Note added",
        entityType: "leadNote",
        entityId: row.id,
    });

    return row.id;
}

/** Only the body is writable — the trigger in 0014 pins everything else. */
export async function updateLeadNote(args: {
    noteId: Id<"leadNotes">;
    body: string;
}): Promise<void> {
    const body = args.body.trim();
    if (!body) throw new Error("A note needs something in it");
    if (body.length > NOTE_MAX_LENGTH) {
        throw new Error(`Notes are limited to ${NOTE_MAX_LENGTH} characters`);
    }

    const { error } = await supabase
        .from("lead_notes")
        .update({ body })
        .eq("id", args.noteId);
    if (error) throw toAppError(error, "Failed to save the note");
}

/**
 * Removes a note.
 *
 * The lead is looked up first because the row is about to be gone, and the log
 * line is the only thing left saying a note was ever here. `touchLead: false`
 * — deleting something should not make a stale lead look freshly worked.
 */
export async function deleteLeadNote(args: { noteId: Id<"leadNotes"> }): Promise<void> {
    const note = unwrap(
        await supabase.from("lead_notes").select("lead_id").eq("id", args.noteId).single(),
        "Note not found",
    ) as { lead_id: string };

    const { error } = await supabase.from("lead_notes").delete().eq("id", args.noteId);
    if (error) throw toAppError(error, "Failed to delete the note");

    await logActivity({
        leadId: note.lead_id,
        action: "Note deleted",
        entityType: "leadNote",
        entityId: args.noteId,
        touchLead: false,
    });
}
