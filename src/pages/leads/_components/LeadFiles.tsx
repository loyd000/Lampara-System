import { useRef, useState } from "react";
import {
    Download,
    FileSpreadsheet,
    FileText,
    ImageOff,
    Loader2,
    Paperclip,
    Trash2,
    Upload,
} from "lucide-react";
import { toast } from "sonner";

import { useDeleteLeadFile, useLeadFiles, useUploadLeadFiles } from "@/lib/supabase/hooks.ts";
import {
    ACCEPTED_UPLOAD_TYPES,
    LEAD_FILE_SOFT_CAP,
} from "@/lib/supabase/queries/lead-files.ts";
import { MAX_UPLOAD_BYTES, formatBytes } from "@/lib/supabase/storage.ts";
import type { Id, LeadFileEntry } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
import { cn } from "@/lib/utils.ts";
import { InlineQueryError } from "@/components/query-error.tsx";

/**
 * Photos and documents on the Overview.
 *
 * The list is a **view over two sources**: files attached to the lead here, and
 * the photos already uploaded against its ocular inspections. Report photos are
 * shown with the slot they fill and cannot be removed from this screen — they
 * belong to the report, and deleting one here would silently punch a hole in a
 * document somebody has already printed.
 *
 * Photos are compressed in the browser before they are uploaded (1600px WebP,
 * see src/lib/image.ts). A 4 MB phone photo lands at roughly 250 KB, which is
 * the difference between a free-tier gigabyte holding a few hundred photos and
 * a few thousand.
 */
export default function LeadFiles({
    leadId,
    canWrite,
}: {
    leadId: Id<"leads">;
    canWrite: boolean;
}) {
    const filesQuery = useLeadFiles(leadId);
    const { data: files } = filesQuery;
    const { mutateAsync: upload } = useUploadLeadFiles();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);

    const photos = files?.filter((f) => f.kind === "photo") ?? [];
    const documents = files?.filter((f) => f.kind === "document") ?? [];

    async function handleFiles(picked: File[]) {
        if (!picked.length || uploading) return;

        // A soft cap: it warns, it does not refuse. Forty files on one lead is
        // unusual enough to mention and rare enough that blocking would be wrong.
        if ((files?.length ?? 0) + picked.length > LEAD_FILE_SOFT_CAP) {
            toast.warning(
                `This lead will have more than ${LEAD_FILE_SOFT_CAP} files — worth a tidy-up soon.`,
            );
        }

        setUploading(true);
        try {
            const { saved, rejected } = await upload({ leadId, files: picked });
            for (const reason of rejected) toast.error(reason);
            if (saved > 0) {
                toast.success(`${saved} file${saved !== 1 ? "s" : ""} attached`);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Upload failed");
        } finally {
            setUploading(false);
        }
    }

    return (
        <section
            className="space-y-4"
            onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                setDragging(false);
                void handleFiles(Array.from(e.dataTransfer.files));
            }}
        >
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <h2 className="text-sm font-semibold text-foreground">Files</h2>
                    {!!files?.length && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                            {files.length}
                        </span>
                    )}
                </div>

                {canWrite && (
                    <>
                        <input
                            ref={inputRef}
                            type="file"
                            multiple
                            accept={ACCEPTED_UPLOAD_TYPES}
                            className="hidden"
                            onChange={(e) => {
                                const picked = Array.from(e.target.files ?? []);
                                e.target.value = "";
                                void handleFiles(picked);
                            }}
                        />
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={uploading}
                            onClick={() => inputRef.current?.click()}
                        >
                            {uploading ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Upload className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {uploading ? "Uploading…" : "Add files"}
                        </Button>
                    </>
                )}
            </div>

            {dragging && (
                <div className="rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-3 py-6 text-center text-xs text-primary">
                    Drop to attach
                </div>
            )}

            {filesQuery.isError ? (
                <InlineQueryError
                    message="Couldn't load files."
                    onRetry={() => void filesQuery.refetch()}
                />
            ) : files === undefined ? (
                <div className="flex flex-wrap gap-2">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="w-24 h-24 rounded-md" />
                    ))}
                </div>
            ) : files.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                    {canWrite ? (
                        <>
                            Nothing attached yet. Drop photos or documents here, or use{" "}
                            <button
                                type="button"
                                className="underline underline-offset-4 hover:text-foreground transition-colors"
                                onClick={() => inputRef.current?.click()}
                            >
                                Add files
                            </button>
                            . Images, PDF, Word and Excel, up to {formatBytes(MAX_UPLOAD_BYTES)}{" "}
                            each.
                        </>
                    ) : (
                        "Nothing attached yet."
                    )}
                </p>
            ) : (
                <div className="space-y-4">
                    {photos.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {photos.map((file) => (
                                <PhotoTile key={file._id} file={file} leadId={leadId} />
                            ))}
                        </div>
                    )}

                    {documents.length > 0 && (
                        <ul className="divide-y divide-border border-t border-border">
                            {documents.map((file) => (
                                <DocumentRow key={file._id} file={file} leadId={leadId} />
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </section>
    );
}

function stamp(file: LeadFileEntry): string {
    return new Date(file._creationTime).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
    });
}

/** What a row says under its name: where it came from, who added it, when. */
function provenance(file: LeadFileEntry): string {
    return [file.sourceLabel, file.uploadedByName, stamp(file)].filter(Boolean).join(" · ");
}

function PhotoTile({ file, leadId }: { file: LeadFileEntry; leadId: Id<"leads"> }) {
    return (
        <figure className="relative group w-24">
            {file.url ? (
                <a href={file.url} target="_blank" rel="noopener noreferrer" title={file.name}>
                    <img
                        src={file.url}
                        alt={file.name}
                        loading="lazy"
                        className={cn(
                            "w-24 h-24 object-cover rounded-md border",
                            "hover:opacity-80 transition-opacity",
                        )}
                    />
                </a>
            ) : (
                <div className="w-24 h-24 rounded-md border grid place-content-center bg-muted/30">
                    <ImageOff className="w-4 h-4 text-muted-foreground/50" />
                </div>
            )}

            <figcaption className="mt-1 text-[10px] leading-tight text-muted-foreground truncate">
                {file.source === "inspection" ? file.sourceLabel : file.name}
            </figcaption>

            {file.removable && <RemoveButton file={file} leadId={leadId} floating />}
        </figure>
    );
}

function DocumentRow({ file, leadId }: { file: LeadFileEntry; leadId: Id<"leads"> }) {
    const Icon = /sheet|excel/.test(file.mime ?? "") ? FileSpreadsheet : FileText;

    return (
        <li className="flex items-center gap-3 py-2.5 group">
            <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">{file.name}</p>
                <p className="text-[11px] text-muted-foreground">
                    {provenance(file)}
                    {file.sizeBytes !== null && ` · ${formatBytes(file.sizeBytes)}`}
                </p>
            </div>
            {file.url && (
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" asChild>
                    <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Open ${file.name}`}
                    >
                        <Download className="w-3.5 h-3.5" />
                    </a>
                </Button>
            )}
            {file.removable && <RemoveButton file={file} leadId={leadId} />}
        </li>
    );
}

/**
 * Only ever rendered for `lead_files` rows. An inspection photo is listed here
 * but managed on the report, which is the whole point of the list being a view
 * over both tables rather than a copy of them.
 */
function RemoveButton({
    file,
    leadId,
    floating = false,
}: {
    file: LeadFileEntry;
    leadId: Id<"leads">;
    floating?: boolean;
}) {
    const { mutateAsync: deleteFile } = useDeleteLeadFile();

    async function handleDelete() {
        try {
            await deleteFile({
                fileId: file._id,
                path: file.path,
                kind: file.kind,
                leadId,
                name: file.name,
            });
            toast.success("File removed");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not remove the file");
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    className={cn(
                        "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity",
                        floating
                            ? "absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-sm"
                            : "shrink-0 rounded-md p-1.5 text-destructive hover:bg-destructive/10",
                    )}
                >
                    <Trash2 className={floating ? "w-3 h-3" : "w-3.5 h-3.5"} />
                </button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove this file?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {file.name} is deleted from storage and cannot be recovered.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
