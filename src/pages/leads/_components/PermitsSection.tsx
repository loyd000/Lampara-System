import { useState, useRef } from "react";
import {
    useAttachPermitDocument,
    useDeletePermit,
    usePermitsForLead,
    useUpdatePermitStatus,
} from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Shield, Plus, Upload, ExternalLink, FileText, Trash2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import AddPermitDialog from "./AddPermitDialog.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    not_submitted: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    submitted: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_LABEL: Record<string, string> = {
    not_submitted: "Not Submitted",
    submitted: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
};

const TYPE_LABEL: Record<string, string> = {
    building_permit: "Building Permit",
    electrical_permit: "Electrical Permit",
    hoa_approval: "HOA Approval",
    utility_interconnection: "Utility Interconnection",
    other: "Other Permit",
};

const STATUS_ORDER = ["not_submitted", "submitted", "approved", "rejected"];

function isOverdue(permit: { dueDate?: string; status: string }) {
    if (!permit.dueDate || permit.status === "approved") return false;
    return new Date(permit.dueDate) < new Date();
}

export default function PermitsSection({ leadId, stage, canEdit }: Props) {
    const { data: permits } = usePermitsForLead(leadId);
    const { mutateAsync: updateStatus } = useUpdatePermitStatus();
    const { mutateAsync: deletePermit } = useDeletePermit();
    const { mutateAsync: attachDocument } = useAttachPermitDocument();
    const [addOpen, setAddOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const [uploadingId, setUploadingId] = useState<string | null>(null);

    const isUnlocked = !["lead", "survey_scheduled", "survey_completed", "proposal_sent"].includes(stage);

    function toggleExpand(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleStatusChange(
        permitId: Id<"permits">,
        newStatus: "not_submitted" | "submitted" | "approved" | "rejected",
    ) {
        try {
            await updateStatus({ permitId, status: newStatus });
            toast.success(`Permit marked ${STATUS_LABEL[newStatus]}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update permit");
        }
    }

    async function handleDelete(permitId: Id<"permits">) {
        try {
            await deletePermit({ permitId });
            toast.success("Permit removed");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to remove permit");
        }
    }

    async function handleFileUpload(permitId: Id<"permits">, file: File) {
        setUploadingId(permitId);
        try {
            await attachDocument({ permitId, file });
            toast.success("Document uploaded");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to upload document");
        } finally { setUploadingId(null); }
    }

    const overdueCount = permits?.filter(isOverdue).length ?? 0;

    return (
        <>
            <Card className={cn(!isUnlocked && "opacity-60")}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            Permits & Compliance
                            {overdueCount > 0 && (
                                <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 text-[10px] ml-1">
                                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />{overdueCount} overdue
                                </Badge>
                            )}
                        </CardTitle>
                        {isUnlocked && canEdit && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setAddOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />Add Permit
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">Permit tracking begins once a contract is signed.</p>
                    ) : permits === undefined ? (
                        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : permits.length === 0 ? (
                        <div className="text-center py-4">
                            <Shield className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">No permits tracked yet</p>
                            {canEdit && (
                                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setAddOpen(true)}>
                                    <Plus className="w-3 h-3 mr-1" />Add first permit
                                </Button>
                            )}
                        </div>
                    ) : (
                        permits.map((permit) => {
                            const expanded = expandedIds.has(permit._id);
                            const overdue = isOverdue(permit);
                            const currentIdx = STATUS_ORDER.indexOf(permit.status);
                            const nextStatus = STATUS_ORDER[currentIdx + 1] as "submitted" | "approved" | undefined;

                            return (
                                <div key={permit._id} className={cn("rounded-lg border overflow-hidden", overdue && "border-red-200 dark:border-red-800/50")}>
                                    {/* Header */}
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => toggleExpand(permit._id)}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {overdue && <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                                            <span className="text-sm font-medium truncate">{TYPE_LABEL[permit.type]}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge className={cn(STATUS_BADGE[permit.status], "text-[10px]")}>
                                                {STATUS_LABEL[permit.status]}
                                            </Badge>
                                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                        </div>
                                    </div>

                                    {/* Expanded detail */}
                                    {expanded && (
                                        <div className="px-3 pb-3 border-t bg-muted/10 space-y-3">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-3">
                                                {permit.submittedAt && (
                                                    <div><span className="text-muted-foreground">Submitted: </span><span>{new Date(permit.submittedAt).toLocaleDateString()}</span></div>
                                                )}
                                                {permit.approvedAt && (
                                                    <div><span className="text-muted-foreground">Approved: </span><span>{new Date(permit.approvedAt).toLocaleDateString()}</span></div>
                                                )}
                                                {permit.rejectedAt && (
                                                    <div><span className="text-muted-foreground">Rejected: </span><span>{new Date(permit.rejectedAt).toLocaleDateString()}</span></div>
                                                )}
                                                {permit.dueDate && (
                                                    <div className={cn(overdue && "text-red-500")}>
                                                        <span className="text-muted-foreground">Due: </span>
                                                        <span className={cn(overdue && "font-semibold text-red-500")}>{new Date(permit.dueDate).toLocaleDateString()}</span>
                                                        {overdue && <span className="ml-1">(Overdue)</span>}
                                                    </div>
                                                )}
                                                {permit.assignedToName && (
                                                    <div><span className="text-muted-foreground">Assigned: </span><span>{permit.assignedToName}</span></div>
                                                )}
                                                {permit.notes && (
                                                    <div className="col-span-2"><span className="text-muted-foreground">Notes: </span><span>{permit.notes}</span></div>
                                                )}
                                            </div>

                                            {/* Document */}
                                            {permit.documentUrl ? (
                                                <a href={permit.documentUrl} target="_blank" rel="noopener noreferrer"
                                                    className="flex items-center gap-2 p-2 rounded-md border bg-muted/20 hover:bg-muted/40 text-xs">
                                                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                                                    <span className="flex-1">View Document</span>
                                                    <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                                </a>
                                            ) : canEdit && (
                                                <>
                                                    <input
                                                        ref={(el) => { fileRefs.current[permit._id] = el; }}
                                                        type="file"
                                                        accept=".pdf,.doc,.docx,.jpg,.png"
                                                        className="hidden"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleFileUpload(permit._id as Id<"permits">, file);
                                                            e.target.value = "";
                                                        }}
                                                    />
                                                    <button type="button"
                                                        onClick={() => fileRefs.current[permit._id]?.click()}
                                                        disabled={uploadingId === permit._id}
                                                        className="w-full border border-dashed border-border rounded-md py-2 flex items-center justify-center gap-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer disabled:opacity-50">
                                                        <Upload className="w-3 h-3" />
                                                        {uploadingId === permit._id ? "Uploading…" : "Upload document"}
                                                    </button>
                                                </>
                                            )}

                                            {/* Actions */}
                                            {canEdit && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {nextStatus && permit.status !== "rejected" && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                            onClick={() => handleStatusChange(permit._id as Id<"permits">, nextStatus)}>
                                                            Mark {STATUS_LABEL[nextStatus]}
                                                        </Button>
                                                    )}
                                                    {permit.status === "submitted" && (
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600"
                                                            onClick={() => handleStatusChange(permit._id as Id<"permits">, "rejected")}>
                                                            Mark Rejected
                                                        </Button>
                                                    )}
                                                    {permit.status === "rejected" && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                            onClick={() => handleStatusChange(permit._id as Id<"permits">, "submitted")}>
                                                            Resubmit
                                                        </Button>
                                                    )}
                                                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
                                                        onClick={() => handleDelete(permit._id as Id<"permits">)}>
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            <AddPermitDialog
                open={addOpen}
                onClose={() => setAddOpen(false)}
                leadId={leadId}
            />
        </>
    );
}
