import { useParams, useNavigate } from "react-router-dom";
import {
    useAddNote,
    useCurrentUser,
    useDeleteLead,
    useLead,
    useLeadActivity,
    useLeadProperties,
    useUpdateStage,
} from "@/lib/supabase/hooks.ts";
import { useNow } from "@/hooks/use-now.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import {
    STAGE_LABELS, STAGE_COLORS, STAGES, SOURCE_LABELS, type Stage,
} from "@/lib/constants.ts";
import {
    ArrowLeft, MapPin, Phone, Mail, Clock, Pencil, Trash2,
    UserCircle, Building2, FileText, Shield,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import EditLeadDialog from "../../_components/EditLeadDialog.tsx";
import SurveysSection from "../_components/SurveysSection.tsx";
import QuotesSection from "../_components/QuotesSection.tsx";
import ContractSection from "../_components/ContractSection.tsx";
import PermitsSection from "../_components/PermitsSection.tsx";
import InstallationSection from "../_components/InstallationSection.tsx";
import ServiceTicketsSection from "../_components/ServiceTicketsSection.tsx";
import { cn } from "@/lib/utils.ts";

export default function LeadDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: lead } = useLead(id as Id<"leads">);
    const { data: properties } = useLeadProperties(id as Id<"leads">);
    const { data: activity } = useLeadActivity(id as Id<"leads">);
    const { data: currentUser } = useCurrentUser();
    const { mutateAsync: updateStage } = useUpdateStage();
    const { mutateAsync: deleteLead } = useDeleteLead();
    const { mutateAsync: addNote } = useAddNote();
    const [note, setNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const now = useNow();

    if (lead === undefined || properties === undefined) {
        return (
            <div className="p-6 space-y-4 max-w-5xl mx-auto">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-56" />
                </div>
                <div className="grid md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="p-6 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <UserCircle className="w-10 h-10 opacity-30" />
                <p>Lead not found.</p>
                <Button variant="ghost" size="sm" onClick={() => navigate("/leads")}>
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Back to Leads
                </Button>
            </div>
        );
    }

    const prop = properties[0];
    const daysOld = Math.floor((now - new Date(lead.lastActivityAt).getTime()) / 86400000);
    const isStale = daysOld >= 7 && !["active_customer", "installation_complete"].includes(lead.stage);
    const canEdit = ["admin", "sales", "office"].includes(currentUser?.role ?? "");
    const canDelete = ["admin"].includes(currentUser?.role ?? "");

    async function handleStageChange(stage: string) {
        try {
            await updateStage({ id: lead!._id, stage: stage as Stage });
            toast.success(`Moved to ${STAGE_LABELS[stage as Stage]}`);
        } catch {
            toast.error("Failed to update stage");
        }
    }

    async function handleAddNote() {
        if (!note.trim()) return;
        setSavingNote(true);
        try {
            await addNote({ id: lead!._id, note: note.trim() });
            setNote("");
        } catch {
            toast.error("Failed to add note");
        } finally {
            setSavingNote(false);
        }
    }

    async function handleDelete() {
        try {
            await deleteLead({ id: lead!._id });
            toast.success("Lead deleted");
            navigate("/leads");
        } catch {
            toast.error("Failed to delete lead");
        }
    }

    return (
        <div className="p-6 space-y-5 max-w-5xl mx-auto">
            {/* ── Header ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="self-start">
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-2xl font-bold">{lead.firstName} {lead.lastName}</h1>
                        <Badge className={cn(STAGE_COLORS[lead.stage], "text-xs font-semibold")}>
                            {STAGE_LABELS[lead.stage]}
                        </Badge>
                        {isStale && (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                                {daysOld}d inactive
                            </Badge>
                        )}
                        {lead.convertedAt && (
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">
                                Customer
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground text-sm mt-1">
                        {SOURCE_LABELS[lead.source]}
                        {lead.referredBy && ` · Referred by ${lead.referredBy}`}
                        {lead.assignedRepName && (
                            <span className="ml-2 inline-flex items-center gap-1">
                                <UserCircle className="w-3 h-3" />{lead.assignedRepName}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                            <Pencil className="w-3.5 h-3.5 mr-1.5" />Edit
                        </Button>
                    )}
                    {canDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently remove {lead.firstName} {lead.lastName} and all associated data. This cannot be undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                        Delete Lead
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <Select value={lead.stage} onValueChange={handleStageChange}>
                        <SelectTrigger className="w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {STAGES.map((s) => (
                                <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Body Grid ──────────────────────────────── */}
            <div className="grid md:grid-cols-3 gap-5">
                {/* LEFT column */}
                <div className="space-y-4">
                    {/* Contact */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <UserCircle className="w-4 h-4 text-muted-foreground" />Contact Info
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2.5 text-sm">
                            <div className="flex items-center gap-2.5">
                                <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                <a href={`tel:${lead.phone}`} className="hover:text-primary transition-colors">{lead.phone}</a>
                            </div>
                            {lead.email && (
                                <div className="flex items-center gap-2.5">
                                    <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    <a href={`mailto:${lead.email}`} className="hover:text-primary transition-colors truncate">{lead.email}</a>
                                </div>
                            )}
                            {lead.convertedAt && (
                                <div className="flex items-center gap-2.5 text-emerald-600 text-xs">
                                    <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                                    Customer since {new Date(lead.convertedAt).toLocaleDateString()}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Property */}
                    {prop && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />Property
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                                <div className="flex items-start gap-2.5">
                                    <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                    <div>
                                        <p className="text-foreground">{prop.address}</p>
                                        <p className="text-muted-foreground">{prop.city}, {prop.state} {prop.zip}</p>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="text-xs capitalize">{prop.propertyType}</Badge>
                                {prop.notes && <p className="text-xs text-muted-foreground">{prop.notes}</p>}
                            </CardContent>
                        </Card>
                    )}

                    {/* Notes */}
                    {lead.notes && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground" />Notes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{lead.notes}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* MIDDLE column — pipeline modules */}
                <div className="space-y-4">
                    {/* Survey section */}
                    <SurveysSection
                        leadId={lead._id}
                        propertyId={prop?._id}
                        stage={lead.stage}
                        canSchedule={canEdit}
                    />
                    {/* Quote section */}
                    <QuotesSection
                        leadId={lead._id}
                        stage={lead.stage}
                        canEdit={canEdit}
                    />
                    {/* Contract section */}
                    <ContractSection
                        leadId={lead._id}
                        stage={lead.stage}
                        canEdit={canEdit}
                    />
                    {/* Permit section */}
                    <PermitsSection
                        leadId={lead._id}
                        stage={lead.stage}
                        canEdit={canEdit}
                    />
                    {/* Installation section */}
                    <InstallationSection
                        leadId={lead._id}
                        stage={lead.stage}
                        canEdit={canEdit}
                    />
                    {/* Service Tickets section */}
                    <ServiceTicketsSection
                        leadId={lead._id}
                        stage={lead.stage}
                        canEdit={canEdit}
                    />
                </div>

                {/* RIGHT column — activity */}
                <div>
                    <Card className="flex flex-col">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />Activity Log
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0 flex flex-col">
                            {/* Note input */}
                            <div className="px-4 pb-3 border-b space-y-2">
                                <Textarea
                                    placeholder="Add a note or update…"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="text-sm min-h-[72px] resize-none"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAddNote();
                                    }}
                                />
                                <Button
                                    size="sm"
                                    onClick={handleAddNote}
                                    disabled={savingNote || !note.trim()}
                                    className="w-full"
                                >
                                    {savingNote ? "Saving…" : "Add Note"}
                                </Button>
                            </div>

                            {/* Log */}
                            <div className="max-h-[420px] overflow-y-auto divide-y">
                                {activity === undefined ? (
                                    <div className="p-4 space-y-2">
                                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                                    </div>
                                ) : activity.length === 0 ? (
                                    <p className="p-4 text-xs text-muted-foreground">No activity yet.</p>
                                ) : (
                                    activity.map((log) => (
                                        <div key={log._id} className="px-4 py-3">
                                            <p className="text-xs font-semibold text-foreground">{log.action}</p>
                                            {log.details && (
                                                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{log.details}</p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                {log.userName} · {new Date(log._creationTime).toLocaleString(undefined, {
                                                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                                                })}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {lead && (
                <EditLeadDialog
                    lead={lead}
                    property={prop}
                    open={editOpen}
                    onClose={() => setEditOpen(false)}
                />
            )}
        </div>
    );
}

// ── End of file ───────────────────────────────────────────────────────────────

