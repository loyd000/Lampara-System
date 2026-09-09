import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
    ArrowLeft,
    Building2,
    Clock,
    FileText,
    Mail,
    MapPin,
    Pencil,
    Phone,
    Shield,
    Trash2,
    UserCircle,
} from "lucide-react";
import { toast } from "sonner";

import {
    useAddNote,
    useCurrentUser,
    useDeleteLead,
    useInstallationForLead,
    useLead,
    useLeadActivity,
    useLeadProperties,
    usePermitsForLead,
    useQuotesForLead,
    useSurveysForLead,
    useTicketsForLead,
    useUpdateStage,
} from "@/lib/supabase/hooks.ts";
import { useNow } from "@/hooks/use-now.ts";
import type { Id } from "@/lib/supabase/types.ts";
import {
    INSPECTION_LABEL_SHORT,
    SOURCE_LABELS,
    STAGES,
    STAGE_COLORS,
    STAGE_LABELS,
    type Stage,
} from "@/lib/constants.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
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
import EditLeadDialog from "../../_components/EditLeadDialog.tsx";
import OcularInspectionTab from "../_components/ocular/OcularInspectionTab.tsx";
import QuotesSection from "../_components/QuotesSection.tsx";
import ContractSection from "../_components/ContractSection.tsx";
import PermitsSection from "../_components/PermitsSection.tsx";
import InstallationSection from "../_components/InstallationSection.tsx";
import ServiceTicketsSection from "../_components/ServiceTicketsSection.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * One lead, one tab per stage of its life.
 *
 * The tab lives in the URL (`?tab=permits`) so a link can point at the part of
 * the record being discussed — which is what the calendar, the map and the
 * notification emails will all want to do.
 */

const TABS = [
    { value: "overview", label: "Overview" },
    { value: "ocular", label: INSPECTION_LABEL_SHORT },
    { value: "quotes", label: "Quotes" },
    { value: "permits", label: "Permits" },
    { value: "installation", label: "Installation" },
    { value: "maintenance", label: "Maintenance" },
    { value: "activity", label: "Activity History" },
] as const;

export default function LeadDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: lead } = useLead(id as Id<"leads">);
    const { data: properties } = useLeadProperties(id as Id<"leads">);
    const { data: activity } = useLeadActivity(id as Id<"leads">);
    const { data: currentUser } = useCurrentUser();

    // These share React Query keys with the sections below, so asking for them
    // here costs nothing extra and lets the tab strip carry counts.
    const { data: surveys } = useSurveysForLead(id as Id<"leads">);
    const { data: quotes } = useQuotesForLead(id as Id<"leads">);
    const { data: permits } = usePermitsForLead(id as Id<"leads">);
    const { data: installation } = useInstallationForLead(id as Id<"leads">);
    const { data: tickets } = useTicketsForLead(id as Id<"leads">);

    const { mutateAsync: updateStage } = useUpdateStage();
    const { mutateAsync: deleteLead } = useDeleteLead();
    const { mutateAsync: addNote } = useAddNote();

    const [note, setNote] = useState("");
    const [savingNote, setSavingNote] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const now = useNow();

    const requested = searchParams.get("tab");
    const tab = TABS.some((t) => t.value === requested) ? requested! : "overview";

    function setTab(value: string) {
        // `replace` so paging through tabs doesn't bury the previous page under
        // a dozen history entries.
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (value === "overview") next.delete("tab");
                else next.set("tab", value);
                return next;
            },
            { replace: true },
        );
    }

    if (lead === undefined || properties === undefined) {
        return (
            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-md" />
                    <Skeleton className="h-8 w-56 rounded-md" />
                </div>
                <Skeleton className="h-9 w-full max-w-2xl rounded-lg" />
                <div className="grid md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-48 w-full rounded-lg" />
                    ))}
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
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    Back to Leads
                </Button>
            </div>
        );
    }

    const prop = properties[0];
    const daysOld = Math.floor((now - new Date(lead.lastActivityAt).getTime()) / 86400000);
    const isStale =
        daysOld >= 7 && !["active_customer", "installation_complete"].includes(lead.stage);
    const canEdit = ["admin", "sales", "office"].includes(currentUser?.role ?? "");
    const canDelete = currentUser?.role === "admin";

    const openTickets = tickets?.filter((t) => !["resolved", "closed"].includes(t.status)) ?? [];
    const counts: Record<string, number | undefined> = {
        ocular: surveys?.length,
        quotes: quotes?.length,
        permits: permits?.length,
        installation: installation ? 1 : 0,
        maintenance: openTickets.length,
    };

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
            toast.success("Note added");
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
        <div className="p-6 space-y-5 max-w-7xl mx-auto">
            {/* ── Header ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => navigate(-1)}
                    className="self-start"
                    aria-label="Go back"
                >
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">
                            {lead.firstName} {lead.lastName}
                        </h1>
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
                                <UserCircle className="w-3 h-3" />
                                {lead.assignedRepName}
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                            <Pencil className="w-3.5 h-3.5 mr-1.5" />
                            Edit
                        </Button>
                    )}
                    {canDelete && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This will permanently remove {lead.firstName}{" "}
                                        {lead.lastName} and all associated data. This cannot be
                                        undone.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDelete}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
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
                                <SelectItem key={s} value={s}>
                                    {STAGE_LABELS[s]}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* ── Tabs ───────────────────────────────────── */}
            <Tabs value={tab} onValueChange={setTab}>
                {/* Scrolls rather than wrapping: seven tabs do not fit a phone. */}
                <div className="-mx-6 px-6 overflow-x-auto sticky top-0 z-20 bg-background/95 backdrop-blur-sm py-1">
                    <TabsList variant="line" className="w-max">
                        {TABS.map((t) => (
                            <TabsTrigger key={t.value} value={t.value} className="whitespace-nowrap">
                                {t.label}
                                {!!counts[t.value] && (
                                    <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                        {counts[t.value]}
                                    </span>
                                )}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </div>

                {/* Overview */}
                <TabsContent value="overview" className="mt-4">
                    <div className="grid md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2">
                                    <UserCircle className="w-4 h-4 text-muted-foreground" />
                                    Contact Info
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2.5 text-sm">
                                <div className="flex items-center gap-2.5">
                                    <Phone className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    <a
                                        href={`tel:${lead.phone}`}
                                        className="hover:text-primary transition-colors"
                                    >
                                        {lead.phone}
                                    </a>
                                </div>
                                {lead.email && (
                                    <div className="flex items-center gap-2.5">
                                        <Mail className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                        <a
                                            href={`mailto:${lead.email}`}
                                            className="hover:text-primary transition-colors truncate"
                                        >
                                            {lead.email}
                                        </a>
                                    </div>
                                )}
                                {lead.convertedAt && (
                                    <div className="flex items-center gap-2.5 text-emerald-600 text-xs">
                                        <Shield className="w-3.5 h-3.5 flex-shrink-0" />
                                        Customer since{" "}
                                        {new Date(lead.convertedAt).toLocaleDateString()}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {prop ? (
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-muted-foreground" />
                                        Property
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-2 text-sm">
                                    <div className="flex items-start gap-2.5">
                                        <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                                        <div>
                                            <p className="text-foreground">{prop.address}</p>
                                            <p className="text-muted-foreground">
                                                {prop.city}, {prop.state} {prop.zip}
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="secondary" className="text-xs capitalize">
                                        {prop.propertyType}
                                    </Badge>
                                    {prop.notes && (
                                        <p className="text-xs text-muted-foreground">{prop.notes}</p>
                                    )}
                                </CardContent>
                            </Card>
                        ) : (
                            <Card>
                                <CardContent className="py-8 flex flex-col items-center gap-2 text-center">
                                    <Building2 className="w-7 h-7 text-muted-foreground/30" />
                                    <p className="text-sm text-muted-foreground">
                                        No property on this lead yet
                                    </p>
                                    {canEdit && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-xs h-7"
                                            onClick={() => setEditOpen(true)}
                                        >
                                            Add a property
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="flex items-center gap-2">
                                    <FileText className="w-4 h-4 text-muted-foreground" />
                                    Notes
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {lead.notes ? (
                                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                        {lead.notes}
                                    </p>
                                ) : (
                                    <p className="text-sm text-muted-foreground/60">
                                        Nothing recorded.
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Site Ocular Inspection */}
                <TabsContent value="ocular" className="mt-4">
                    <OcularInspectionTab
                        leadId={lead._id}
                        propertyId={prop?._id}
                        canSchedule={canEdit}
                    />
                </TabsContent>

                {/* Quotes & Contract */}
                <TabsContent value="quotes" className="mt-4">
                    <div className="grid lg:grid-cols-2 gap-4 items-start">
                        <QuotesSection leadId={lead._id} stage={lead.stage} canEdit={canEdit} />
                        <ContractSection leadId={lead._id} stage={lead.stage} canEdit={canEdit} />
                    </div>
                </TabsContent>

                <TabsContent value="permits" className="mt-4">
                    <div className="max-w-2xl">
                        <PermitsSection leadId={lead._id} stage={lead.stage} canEdit={canEdit} />
                    </div>
                </TabsContent>

                <TabsContent value="installation" className="mt-4">
                    <div className="max-w-2xl">
                        <InstallationSection
                            leadId={lead._id}
                            stage={lead.stage}
                            canEdit={canEdit}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="maintenance" className="mt-4">
                    <div className="max-w-2xl">
                        <ServiceTicketsSection
                            leadId={lead._id}
                            stage={lead.stage}
                            canEdit={canEdit}
                        />
                    </div>
                </TabsContent>

                {/* Activity history — full height, not a 420px well */}
                <TabsContent value="activity" className="mt-4">
                    <Card className="max-w-3xl">
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                                Activity History
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="px-6 pb-4 border-b space-y-2">
                                <Textarea
                                    placeholder="Add a note or update…"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="text-sm min-h-[72px] resize-none"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                            handleAddNote();
                                        }
                                    }}
                                />
                                <div className="flex items-center justify-between gap-3">
                                    <p className="text-[11px] text-muted-foreground">
                                        ⌘/Ctrl + Enter to save
                                    </p>
                                    <Button
                                        size="sm"
                                        onClick={handleAddNote}
                                        disabled={savingNote || !note.trim()}
                                    >
                                        {savingNote ? "Saving…" : "Add Note"}
                                    </Button>
                                </div>
                            </div>

                            <div className="divide-y">
                                {activity === undefined ? (
                                    <div className="px-6 py-4 space-y-2">
                                        {[...Array(3)].map((_, i) => (
                                            <Skeleton key={i} className="h-12 w-full" />
                                        ))}
                                    </div>
                                ) : activity.length === 0 ? (
                                    <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                                        No activity yet. Notes and pipeline changes show up here.
                                    </p>
                                ) : (
                                    activity.map((log) => (
                                        <div key={log._id} className="px-6 py-3.5">
                                            <p className="text-xs font-semibold text-foreground">
                                                {log.action}
                                            </p>
                                            {log.details && (
                                                <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                                                    {log.details}
                                                </p>
                                            )}
                                            <p className="text-[10px] text-muted-foreground/60 mt-1">
                                                {log.userName} ·{" "}
                                                {new Date(log._creationTime).toLocaleString(
                                                    undefined,
                                                    {
                                                        month: "short",
                                                        day: "numeric",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    },
                                                )}
                                            </p>
                                        </div>
                                    ))
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <EditLeadDialog
                lead={lead}
                property={prop}
                open={editOpen}
                onClose={() => setEditOpen(false)}
            />
        </div>
    );
}
