import { useState, useRef } from "react";
import {
    useActivateCustomer,
    useAddChecklistItem,
    useAddCompletionPhotos,
    useInstallationForLead,
    useToggleChecklistItem,
    useUpdateInstallationStatus,
} from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Wrench, Plus, Camera, CheckSquare, Square, X, CheckCircle2, Zap, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import ScheduleInstallationDialog from "./ScheduleInstallationDialog.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    on_hold: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
    scheduled: "Scheduled",
    in_progress: "In Progress",
    completed: "Completed",
    on_hold: "On Hold",
};

const isUnlockedStage = (stage: string) =>
    !["lead", "survey_scheduled", "survey_completed", "proposal_sent", "contract_signed"].includes(stage);

export default function InstallationSection({ leadId, stage, canEdit }: Props) {
    const { data: installation } = useInstallationForLead(leadId);
    const { mutateAsync: updateStatus } = useUpdateInstallationStatus();
    const { mutateAsync: toggleChecklistItem } = useToggleChecklistItem();
    const { mutateAsync: addChecklistItem } = useAddChecklistItem();
    const { mutateAsync: addPhotos } = useAddCompletionPhotos();
    const { mutateAsync: activateCustomer } = useActivateCustomer();

    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [newItem, setNewItem] = useState("");
    const [addingItem, setAddingItem] = useState(false);
    const [uploadingPhotos, setUploadingPhotos] = useState(false);
    const photoInputRef = useRef<HTMLInputElement>(null);

    const isUnlocked = isUnlockedStage(stage);

    async function handleStatusChange(status: "scheduled" | "in_progress" | "completed" | "on_hold") {
        if (!installation) return;
        try {
            await updateStatus({ installationId: installation._id, status });
            toast.success(`Installation marked ${STATUS_LABEL[status]}`);
        } catch { toast.error("Failed to update status"); }
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
        } catch { toast.error("Failed to add item"); }
        finally { setAddingItem(false); }
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

    async function handleActivateCustomer() {
        try {
            await activateCustomer({ leadId });
            toast.success("Lead activated as customer");
        } catch { toast.error("Failed to activate customer"); }
    }

    return (
        <>
            <Card className={cn(!isUnlocked && "opacity-60")}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />Installation
                        </CardTitle>
                        {isUnlocked && canEdit && !installation && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setScheduleOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />Schedule
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">Installation is scheduled once permits are in place.</p>
                    ) : installation === undefined ? (
                        <Skeleton className="h-20 w-full" />
                    ) : installation === null ? (
                        <div className="text-center py-4">
                            <Wrench className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">No installation scheduled yet</p>
                            {canEdit && (
                                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setScheduleOpen(true)}>
                                    <Plus className="w-3 h-3 mr-1" />Schedule installation
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            {/* Status + date */}
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <Badge className={cn(STATUS_BADGE[installation.status], "text-[10px]")}>
                                        {STATUS_LABEL[installation.status]}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                        {new Date(installation.scheduledDate).toLocaleDateString(undefined, {
                                            weekday: "short", month: "short", day: "numeric", year: "numeric",
                                        })}
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
                            {canEdit && (
                                <div className="flex flex-wrap gap-1.5">
                                    {installation.status === "scheduled" && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                            onClick={() => handleStatusChange("in_progress")}>
                                            <Zap className="w-3 h-3 mr-1" />Start Installation
                                        </Button>
                                    )}
                                    {installation.status === "in_progress" && (
                                        <>
                                            <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                                onClick={() => handleStatusChange("completed")}>
                                                <CheckCircle2 className="w-3 h-3 mr-1" />Mark Complete
                                            </Button>
                                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                onClick={() => handleStatusChange("on_hold")}>
                                                <PauseCircle className="w-3 h-3 mr-1" />Pause
                                            </Button>
                                        </>
                                    )}
                                    {installation.status === "on_hold" && (
                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                            onClick={() => handleStatusChange("in_progress")}>
                                            <Zap className="w-3 h-3 mr-1" />Resume
                                        </Button>
                                    )}
                                    {installation.status === "completed" && stage !== "active_customer" && (
                                        <Button size="sm" className="h-7 text-xs"
                                            onClick={handleActivateCustomer}>
                                            <CheckCircle2 className="w-3 h-3 mr-1" />Activate as Customer
                                        </Button>
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
                                                onClick={() => canEdit && handleToggleItem(idx)}
                                                disabled={!canEdit}
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

                                {canEdit && installation.status !== "completed" && (
                                    <div className="flex gap-2 mt-2">
                                        <input
                                            type="text"
                                            value={newItem}
                                            onChange={(e) => setNewItem(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddItem(); } }}
                                            placeholder="Add material item…"
                                            className="flex-1 text-xs px-2.5 py-1.5 rounded-md border bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
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
                                    {canEdit && (
                                        <>
                                            <input
                                                ref={photoInputRef}
                                                type="file"
                                                accept="image/*"
                                                multiple
                                                className="hidden"
                                                onChange={handlePhotoUpload}
                                            />
                                            <Button size="sm" variant="ghost" className="h-6 text-xs"
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
        </>
    );
}
