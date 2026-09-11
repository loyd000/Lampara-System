import { useState, useRef } from "react";
import {
    useActivateCustomer,
    useDeleteInstallation,
    useAddChecklistItem,
    useAddCompletionPhotos,
    useCurrentUser,
    useInstallationForLead,
    useToggleChecklistItem,
    useUpdateInstallationStatus,
} from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Wrench, Plus, Camera, CheckSquare, Square, CheckCircle2, Zap, PauseCircle, CalendarClock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { canScheduleInstallation } from "@/lib/constants.ts";
import { toast } from "sonner";
import ScheduleInstallationDialog from "./ScheduleInstallationDialog.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { countTicketsForInstallation } from "@/lib/supabase/queries/installations.ts";
import { InlineQueryError } from "@/components/query-error.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    scheduled: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    completed: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    on_hold: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
};

/**
 * "Mon, Sep 14 2026" for a one-day job, "Mon, Sep 14 – Thu, Sep 17 2026" for a
 * run of days. The year appears once, at the end, where it belongs.
 */
function formatSchedule(start: string, end: string): string {
    const day = (iso: string, withYear: boolean) =>
        new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            ...(withYear ? { year: "numeric" as const } : {}),
        });
    return start === end ? day(start, true) : `${day(start, false)} – ${day(end, true)}`;
}

const STATUS_LABEL: Record<string, string> = {
    scheduled: "Scheduled",
    in_progress: "In Progress",
    completed: "Completed",
    on_hold: "On Hold",
};


export default function InstallationSection({ leadId, stage, canEdit }: Props) {
    const installationQuery = useInstallationForLead(leadId);
    const { data: installation } = installationQuery;
    const { data: currentUser } = useCurrentUser();
    const { mutateAsync: updateStatus } = useUpdateInstallationStatus();
    const { mutateAsync: toggleChecklistItem } = useToggleChecklistItem();
    const { mutateAsync: addChecklistItem } = useAddChecklistItem();
    const { mutateAsync: addPhotos } = useAddCompletionPhotos();
    const { mutateAsync: activateCustomer } = useActivateCustomer();
    const { mutateAsync: deleteInstallation, isPending: deleting } = useDeleteInstallation();

    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [rescheduleOpen, setRescheduleOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    // Counted when the confirm dialog opens rather than watched continuously —
    // it is only ever read to word one sentence.
    const [ticketsAtRisk, setTicketsAtRisk] = useState<number | null>(null);
    const [newItem, setNewItem] = useState("");
    const [addingItem, setAddingItem] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const [changingStatus, setChangingStatus] = useState(false);
    const [activating, setActivating] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    // `canEdit` is about *running the pipeline* — scheduling the job, converting
    // the customer. Working the job is a different permission: the technicians
    // crewed on it tick the checklist, move the status and upload photos, which
    // is exactly what installations_update in RLS lets them do. Without this
    // split a field technician can open their own job and change nothing.
    const isCrew =
        !!currentUser &&
        !!installation &&
        installation.assignedCrewIds.includes(currentUser._id);
    const canWork = canEdit || isCrew;

    const isUnlocked = canScheduleInstallation(stage);

    async function handleStatusChange(status: "scheduled" | "in_progress" | "completed" | "on_hold") {
        if (!installation) return;
        setChangingStatus(true);
        try {
            await updateStatus({ installationId: installation._id, status });
            toast.success(`Installation marked ${STATUS_LABEL[status]}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update status");
        } finally {
            setChangingStatus(false);
        }
    }

    async function handleToggleItem(idx: number) {
        if (!installation) return;
        // Only the index goes to the server — it flips that entry in place, so
        // another crew member's ticks are not overwritten by our stale copy.
        try {
            await toggleChecklistItem({ installationId: installation._id, index: idx });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update checklist");
        }
    }

    async function handleAddItem() {
        if (!installation || !newItem.trim()) return;
        setAddingItem(true);
        try {
            await addChecklistItem({ installationId: installation._id, item: newItem.trim() });
            setNewItem("");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to add item");
        } finally { setAddingItem(false); }
    }

    async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!installation) return;
        const files = Array.from(e.target.files ?? []);
        if (!files.length) return;
        e.target.value = "";
        setUploadingPhotos(true);
        try {
            const count = await addPhotos({ installationId: installation._id, files });
            toast.success(`${count} photo(s) uploaded`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to upload photos");
        } finally { setUploadingPhotos(false); }
    }

    async function openDeleteDialog() {
        setTicketsAtRisk(null);
        setDeleteOpen(true);
        if (!installation) return;
        try {
            setTicketsAtRisk(await countTicketsForInstallation(installation._id));
        } catch {
            // The count only sharpens the warning; failing to get it must not
            // stop someone deleting a job they meant to delete.
            setTicketsAtRisk(null);
        }
    }

    async function handleDelete() {
        if (!installation) return;
        try {
            await deleteInstallation({ installationId: installation._id });
            toast.success("Installation deleted");
            setDeleteOpen(false);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete the installation");
        }
    }

    async function handleActivateCustomer() {
        setActivating(true);
        try {
            await activateCustomer({ leadId });
            toast.success("Lead activated as customer");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to activate customer");
        } finally {
            setActivating(false);
        }
    }

    return (
        <>
            <Card>
                <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />Installation
                        </CardTitle>
                        {isUnlocked && canEdit && !installation && (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setScheduleOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />Schedule
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">Installation is scheduled once the contract is signed.</p>
                    ) : installationQuery.isError ? (
                        <InlineQueryError
                            message="Couldn't load the installation."
                            onRetry={() => void installationQuery.refetch()}
                        />
                    ) : installation === undefined ? (
                        <Skeleton className="h-28 w-full rounded-lg" />
                    ) : installation === null ? (
                        <Empty className="py-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <Wrench className="size-6" />
                                </EmptyMedia>
                                <EmptyTitle>No Installation Scheduled Yet</EmptyTitle>
                            </EmptyHeader>
                            {canEdit && (
                                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setScheduleOpen(true)}>
                                    <Plus className="w-3.5 h-3.5 mr-1" />Schedule installation
                                </Button>
                            )}
                        </Empty>
                    ) : (
                        <>
                            {/* Status + date */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Badge className={STATUS_BADGE[installation.status]}>
                                        {STATUS_LABEL[installation.status]}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {formatSchedule(
                                            installation.scheduledDate,
                                            installation.scheduledEndDate,
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Crew */}
                            {installation.crewNames.length > 0 && (
                                <div className="text-xs">
                                    <span className="text-muted-foreground">Crew: </span>
                                    <span>{installation.crewNames.map((c) => c.name).join(", ")}</span>
                                </div>
                            )}

                            {/* Installer note */}
                            {installation.leadInstallerNote && (
                                <div className="text-xs p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                                    <span className="text-muted-foreground font-medium">Note for crew: </span>
                                    <span>{installation.leadInstallerNote}</span>
                                </div>
                            )}

                            {/* Status actions */}
                            {canWork && (
                                // Delete lives in its own `ml-auto` sibling rather
                                // than inside this wrapping row: with enough status
                                // buttons to wrap onto a second line, `ml-auto`
                                // inside the same row pushed it to the end of
                                // *whichever* line it landed on — sometimes right
                                // beside "Activate as Customer" rather than at the
                                // true end of the cluster.
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        {installation.status === "scheduled" && (
                                            <Button size="sm" variant="outline" className="h-8 text-xs"
                                                disabled={changingStatus}
                                                onClick={() => handleStatusChange("in_progress")}>
                                                <Zap className="w-3 h-3 mr-1" />Start Installation
                                            </Button>
                                        )}
                                        {installation.status === "in_progress" && (
                                            <>
                                                <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                                    disabled={changingStatus}
                                                    onClick={() => handleStatusChange("completed")}>
                                                    <CheckCircle2 className="w-3 h-3 mr-1" />Mark Complete
                                                </Button>
                                                <Button size="sm" variant="ghost" className="h-8 text-xs"
                                                    disabled={changingStatus}
                                                    onClick={() => handleStatusChange("on_hold")}>
                                                    <PauseCircle className="w-3 h-3 mr-1" />Pause
                                                </Button>
                                            </>
                                        )}
                                        {installation.status === "on_hold" && (
                                            <Button size="sm" variant="outline" className="h-8 text-xs"
                                                disabled={changingStatus}
                                                onClick={() => handleStatusChange("in_progress")}>
                                                <Zap className="w-3 h-3 mr-1" />Resume
                                            </Button>
                                        )}
                                        {installation.status === "completed" && stage !== "active_customer" && canEdit && (
                                            <Button size="sm" className="h-8 text-xs"
                                                disabled={activating}
                                                onClick={handleActivateCustomer}>
                                                <CheckCircle2 className="w-3 h-3 mr-1" />Activate as Customer
                                            </Button>
                                        )}

                                        {/* Changing the job, as opposed to working it:
                                            running the schedule is `canEdit`, not
                                            something the crew on site does. */}
                                        {canEdit && (
                                            <Button size="sm" variant="outline" className="h-8 text-xs"
                                                onClick={() => setRescheduleOpen(true)}>
                                                <CalendarClock className="w-3 h-3 mr-1" />Reschedule
                                            </Button>
                                        )}
                                    </div>

                                    {canEdit && (
                                        <div className="ml-auto flex items-center gap-2 shrink-0">
                                            <Button size="sm" variant="ghost"
                                                className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                onClick={openDeleteDialog}>
                                                <Trash2 className="w-3 h-3 mr-1" />Delete
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Materials checklist */}
                            <div>
                                <p className="text-xs font-medium text-muted-foreground mb-2">Materials Checklist</p>
                                {(installation.materialsChecklist ?? []).length === 0 ? (
                                    <p className="text-xs text-muted-foreground/60">No items yet</p>
                                ) : (
                                    <div className="space-y-1.5">
                                        {(installation.materialsChecklist ?? []).map((item, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                className="flex items-center gap-2 w-full text-left hover:bg-muted/30 rounded-md px-2 py-1 transition-colors group"
                                                onClick={() => canWork && handleToggleItem(idx)}
                                                disabled={!canWork}
                                            >
                                                {item.checked ? (
                                                    <CheckSquare className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                                ) : (
                                                    <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                                )}
                                                <span className={cn("text-xs flex-1", item.checked && "line-through text-muted-foreground")}>
                                                    {item.item}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {canWork && installation.status !== "completed" && (
                                    <div className="flex gap-2 mt-2">
                                        {/* The house Input, not a hand-rolled
                                            one — this bypassed the app's
                                            focus-visible:ring-[3px] token and
                                            sat a size off from the button
                                            beside it. */}
                                        <Input
                                            type="text"
                                            value={newItem}
                                            onChange={(e) => setNewItem(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                                            placeholder="Add material item…"
                                            className="flex-1 min-w-0 h-8 text-xs"
                                        />
                                        <Button size="sm" variant="ghost" className="h-8 px-2 text-xs"
                                            onClick={handleAddItem} disabled={!newItem.trim() || addingItem}>
                                            <Plus className="w-3 h-3" />
                                        </Button>
                                    </div>
                                )}
                            </div>

                            {/* Completion photos */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-medium text-muted-foreground">Completion Photos</p>
                                    {canWork && (
                                        <>
                                            <input
                                                ref={photoInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={handlePhotoUpload}
                                            />
                                            <Button size="sm" variant="ghost" className="h-8 text-xs"
                                                onClick={() => photoInputRef.current?.click()}
                                                disabled={uploadingPhotos}>
                                                <Camera className="w-3 h-3 mr-1" />
                                                {uploadingPhotos ? "Uploading…" : "Add Photos"}
                                            </Button>
                                        </>
                                    )}
                                </div>
                                {installation.photoUrls.length === 0 ? (
                                    <p className="text-xs text-muted-foreground/60">No photos yet</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {installation.photoUrls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                <img
                                                    src={url}
                                                    alt={`Completion photo ${i + 1}`}
                                                    className="w-16 h-16 object-cover rounded-md border hover:opacity-80 transition-opacity cursor-pointer"
                                                />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* General notes */}
                            {installation.notes && (
                                <p className="text-xs text-muted-foreground">{installation.notes}</p>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <ScheduleInstallationDialog
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                leadId={leadId}
            />

            {installation && (
                <ScheduleInstallationDialog
                    open={rescheduleOpen}
                    onClose={() => setRescheduleOpen(false)}
                    leadId={leadId}
                    installation={installation}
                />
            )}

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this installation?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The schedule, crew, materials checklist and any completion
                            photos are removed for good, and the lead can then have a
                            new installation scheduled.
                            {ticketsAtRisk !== null && ticketsAtRisk > 0 && (
                                <>
                                    {" "}
                                    <strong>
                                        {ticketsAtRisk} service ticket
                                        {ticketsAtRisk === 1 ? "" : "s"} raised against
                                        this job will be deleted with it.
                                    </strong>
                                </>
                            )}{" "}
                            The stage is left as it is — change it yourself if the work
                            is no longer going ahead.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Keep Installation</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                            disabled={deleting}
                        >
                            {deleting ? "Deleting…" : "Delete Installation"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
