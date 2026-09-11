import { useState } from "react";
import { MessageSquare, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
    useAddLeadNote,
    useDeleteLeadNote,
    useLeadNotes,
    useUpdateLeadNote,
} from "@/lib/supabase/hooks.ts";
import { NOTE_MAX_LENGTH } from "@/lib/supabase/queries/lead-notes.ts";
import type { Id, LeadNoteEntry } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { InlineQueryError } from "@/components/query-error.tsx";

/**
 * Dated notes on the Overview.
 *
 * Separate from the Activity History tab on purpose: that tab is the system's
 * own record of what happened to this lead and is machine-written. This is what
 * a person chose to write down, and their author can correct it afterwards —
 * with an "edited" marker, so a reader can tell.
 *
 * Newest first, composer at the top: the note being written is almost always
 * about the thing that just happened.
 */
export default function LeadNotes({
    leadId,
    canWrite,
}: {
    leadId: Id<"leads">;
    canWrite: boolean;
}) {
    const notesQuery = useLeadNotes(leadId);
    const { data: notes } = notesQuery;
    const { mutateAsync: addNote } = useAddLeadNote();

    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);

    async function handleAdd() {
        const body = draft.trim();
        if (!body || saving) return;
        setSaving(true);
        try {
            await addNote({ leadId, body });
            setDraft("");
            toast.success("Note added");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to add the note");
        } finally {
            setSaving(false);
        }
    }

    return (
        <section className="space-y-4">
            <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Notes</h2>
                {!!notes?.length && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                        {notes.length}
                    </span>
                )}
            </div>

            {canWrite && (
                <div className="space-y-2">
                    <Textarea
                        placeholder="What happened? A call, a promise, something the site needs…"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                        className="text-sm min-h-[80px] resize-none"
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                void handleAdd();
                            }
                        }}
                    />
                    <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-muted-foreground">
                            ⌘/Ctrl + Enter to save
                        </p>
                        <Button size="sm" onClick={handleAdd} disabled={saving || !draft.trim()}>
                            {saving ? "Saving…" : "Add Note"}
                        </Button>
                    </div>
                </div>
            )}

            {notesQuery.isError ? (
                <InlineQueryError
                    message="Couldn't load notes."
                    onRetry={() => void notesQuery.refetch()}
                />
            ) : notes === undefined ? (
                <div className="space-y-2">
                    {[...Array(2)].map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full rounded-lg" />
                    ))}
                </div>
            ) : notes.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                    {canWrite
                        ? "No notes yet. Anything worth remembering about this lead goes here."
                        : "No notes yet."}
                </p>
            ) : (
                <ul className="divide-y divide-border border-t border-border">
                    {notes.map((note) => (
                        <NoteRow key={note._id} note={note} />
                    ))}
                </ul>
            )}
        </section>
    );
}

function formatStamp(iso: string): string {
    return new Date(iso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function NoteRow({ note }: { note: LeadNoteEntry }) {
    const { mutateAsync: updateNote } = useUpdateLeadNote();
    const { mutateAsync: deleteNote } = useDeleteLeadNote();

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(note.body);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        const body = draft.trim();
        if (!body || saving) return;
        if (body === note.body) {
            setEditing(false);
            return;
        }
        setSaving(true);
        try {
            await updateNote({ noteId: note._id, body });
            setEditing(false);
            toast.success("Note updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to save the note");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete() {
        try {
            await deleteNote({ noteId: note._id });
            toast.success("Note deleted");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete the note");
        }
    }

    return (
        <li className="py-3.5 group">
            <div className="flex items-start justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{note.authorName}</span>
                    {" · "}
                    {formatStamp(new Date(note._creationTime).toISOString())}
                    {note.edited && (
                        <span title={`Edited ${formatStamp(note.updatedAt)}`}> · edited</span>
                    )}
                </p>

                {note.isOwn && !editing && (
                    // Visible by default on touch — there is no hover on a
                    // phone, so an author had no way at all to reach these.
                    // Fades in on hover only once a pointer is available.
                    <div className="flex items-center gap-0.5 shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit note"
                            onClick={() => {
                                setDraft(note.body);
                                setEditing(true);
                            }}
                        >
                            <Pencil className="w-3 h-3" />
                        </Button>
                        <DeleteNoteButton onConfirm={handleDelete} />
                    </div>
                )}
            </div>

            {editing ? (
                <div className="mt-2 space-y-2">
                    <Textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
                        className="text-sm min-h-[80px] resize-none"
                        onKeyDown={(e) => {
                            if (e.key === "Escape") setEditing(false);
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSave();
                        }}
                    />
                    <div className="flex items-center gap-2">
                        <Button size="sm" onClick={handleSave} disabled={saving || !draft.trim()}>
                            {saving ? "Saving…" : "Save"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                            Cancel
                        </Button>
                    </div>
                </div>
            ) : (
                <p className="text-sm text-foreground mt-1 whitespace-pre-wrap break-words">
                    {note.body}
                </p>
            )}
        </li>
    );
}

/** Its own component so each row keeps its own dialog state. */
function DeleteNoteButton({ onConfirm }: { onConfirm: () => void }) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete note"
                >
                    <Trash2 className="w-3 h-3" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                    <AlertDialogDescription>
                        The text is gone for good. The activity history will still show that a
                        note was written and removed.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Delete Note
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
