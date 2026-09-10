import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Clock, Pencil, Trash2, UserCircle } from "lucide-react";
import { toast } from "sonner";

import {
    useCurrentUser,
    useContractForLead,
    useDeleteLead,
    useInstallationForLead,
    useLead,
    useLeadActivity,
    useLeadProperties,
    usePackages,
    usePermitsForLead,
    useQuotesForLead,
    useSurveysForLead,
    useTicketsForLead,
    useUpdateStage,
} from "@/lib/supabase/hooks.ts";
import { useNow } from "@/hooks/use-now.ts";
import type { Id } from "@/lib/supabase/types.ts";
import {
    DESIGN_TYPE_LABELS,
    INSPECTION_LABEL_SHORT,
    PROPERTY_TYPE_LABELS,
    SOURCE_LABELS,
    STAGE_GROUPS,
    STAGE_GROUP_LABELS,
    STAGE_LABELS,
    type Stage,
    type StageGroup,
} from "@/lib/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import LeadFiles from "../_components/LeadFiles.tsx";
import LeadNotes from "../_components/LeadNotes.tsx";
import OcularInspectionTab from "../_components/ocular/OcularInspectionTab.tsx";
import QuotesTab from "../_components/quotes/QuotesTab.tsx";
import ContractSection from "../_components/ContractSection.tsx";
import PermitsSection from "../_components/PermitsSection.tsx";
import InstallationSection from "../_components/InstallationSection.tsx";
import ServiceTicketsSection from "../_components/ServiceTicketsSection.tsx";

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
    { value: "contracts", label: "Contract" },
    { value: "permits", label: "Permits" },
    { value: "installation", label: "Installation" },
    { value: "maintenance", label: "Maintenance" },
    { value: "activity", label: "Activity History" },
] as const;

/**
 * One labelled fact. The label sits in a fixed rail on desktop so every value
 * starts on the same line, and stacks above the value on a phone where a rail
 * would leave the values too narrow to read.
 */
function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[8.5rem_1fr] gap-0.5 sm:gap-6 py-3.5">
            <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</dt>
            <dd className="text-sm text-foreground min-w-0">{children}</dd>
        </div>
    );
}

/** A fact nobody has filled in, optionally with the way to fill it. */
function NotRecorded({
    label = "Not recorded",
    action,
    onAction,
}: {
    label?: string;
    action?: string;
    onAction?: () => void;
}) {
    return (
        <span className="text-muted-foreground">
            {label}
            {action && onAction && (
                <>
                    {" · "}
                    <button
                        type="button"
                        onClick={onAction}
                        className="underline underline-offset-4 hover:text-foreground transition-colors"
                    >
                        {action}
                    </button>
                </>
            )}
        </span>
    );
}

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
    const { data: contract } = useContractForLead(id as Id<"leads">);
    const { data: permits } = usePermitsForLead(id as Id<"leads">);
    const { data: installation } = useInstallationForLead(id as Id<"leads">);
    const { data: tickets } = useTicketsForLead(id as Id<"leads">);
    // All packages, not just active ones — an approved quote can reference a
    // package that's since been archived, and it should still resolve.
    const { data: packages } = usePackages();

    const { mutateAsync: updateStage } = useUpdateStage();
    const { mutateAsync: deleteLead } = useDeleteLead();

    const [editOpen, setEditOpen] = useState(false);
    const [cancelPromptOpen, setCancelPromptOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
        daysOld >= 7 && !["active_customer", "installation_complete", "cancelled"].includes(lead.stage);
    // Both gates are the same admin/superadmin check today — kept as two names
    // for readability at call sites, but derived from one flag so a future
    // change to one permission can't silently drift from the other.
    const isAdmin = ["superadmin", "admin"].includes(currentUser?.role ?? "");
    const canEdit = isAdmin;
    const canDelete = isAdmin;
    // Notes and files are the two things a technician contributes to a lead
    // they cannot otherwise edit — a note from the crew on site is exactly what
    // the office needs to read.
    const canContribute = ["superadmin", "admin", "field"].includes(currentUser?.role ?? "");

    // A lead has at most one approved quote at a time (approving one is the
    // gate that unlocks the contract) — once it exists, the design type(s) of
    // whatever packages it's built from become a fact about the lead, worth
    // surfacing on the Overview rather than requiring a trip into the Quotes
    // tab's line items.
    const approvedQuote = quotes?.find((q) => q.status === "approved");
    const packageById = new Map((packages ?? []).map((p) => [p._id, p]));
    const designTypeLabels = approvedQuote
        ? [
              ...new Set(
                  approvedQuote.items
                      .map((it) => it.sourcePackageId && packageById.get(it.sourcePackageId)?.designType)
                      .filter((dt): dt is NonNullable<typeof dt> => Boolean(dt))
                      .map((dt) => DESIGN_TYPE_LABELS[dt] ?? dt),
              ),
          ]
        : [];

    const openTickets = tickets?.filter((t) => !["resolved", "closed"].includes(t.status)) ?? [];
    const counts: Record<string, number | undefined> = {
        ocular: surveys?.length,
        quotes: quotes?.length,
        contracts: contract ? 1 : undefined,
        permits: permits?.length,
        installation: installation ? 1 : undefined,
        maintenance: openTickets.length,
    };

    async function applyStageChange(stage: Stage, cancelledReason?: string) {
        try {
            await updateStage({ id: lead!._id, stage, cancelledReason });
            toast.success(stage === "cancelled" ? "Lead cancelled" : `Moved to ${STAGE_LABELS[stage]}`);
        } catch {
            toast.error("Failed to update stage");
        }
    }

    // Cancelling is the one stage change that needs a reason on record — every
    // other move is self-explanatory from the stage name alone.
    function handleStageChange(stage: string) {
        if (stage === "cancelled") {
            setCancelReason("");
            setCancelPromptOpen(true);
            return;
        }
        void applyStageChange(stage as Stage);
    }

    async function confirmCancel() {
        await applyStageChange("cancelled", cancelReason.trim() || undefined);
        setCancelPromptOpen(false);
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
                    <h1 className="text-2xl font-bold tracking-tight text-foreground">
                        {lead.firstName} {lead.lastName}
                    </h1>
                    {/* One quiet line instead of a row of badges. The stage
                        already has a control beside it, and "Customer" is the
                        conversion date on the Overview. Staleness is the only
                        thing here the page does not say twice, so it keeps a
                        little colour and nothing else does. */}
                    <p className="text-muted-foreground text-sm mt-1">
                        {SOURCE_LABELS[lead.source] ?? lead.source}
                        {lead.assignedRepName && ` · ${lead.assignedRepName}`}
                        {isStale && (
                            <span className="text-amber-800 dark:text-amber-500 font-medium">
                                {" · "}
                                No activity for {daysOld} days
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex items-center flex-wrap gap-2 flex-shrink-0">
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
                        <SelectTrigger className="w-full sm:w-52">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {(Object.keys(STAGE_GROUPS) as StageGroup[]).map((group, i) => (
                                <SelectGroup key={group}>
                                    {i > 0 && <SelectSeparator />}
                                    <SelectLabel>{STAGE_GROUP_LABELS[group]}</SelectLabel>
                                    {STAGE_GROUPS[group].map((s) => (
                                        <SelectItem key={s} value={s}>
                                            {STAGE_LABELS[s]}
                                        </SelectItem>
                                    ))}
                                </SelectGroup>
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

                {/* Overview — a spec sheet, not a wall of cards. Labels in a
                    narrow rail, values in a readable column, hairlines instead
                    of boxes. Nothing here is repeated from the header. */}
                <TabsContent value="overview" className="mt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,34rem)_minmax(0,1fr)] gap-8 lg:gap-12 items-start">
                        <dl className="divide-y divide-border">
                            <DetailRow label="Phone">
                                <a
                                    href={`tel:${lead.phone}`}
                                    className="underline-offset-4 hover:underline hover:text-primary transition-colors"
                                >
                                    {lead.phone}
                                </a>
                            </DetailRow>

                            <DetailRow label="Email">
                                {lead.email ? (
                                    <a
                                        href={`mailto:${lead.email}`}
                                        className="underline-offset-4 hover:underline hover:text-primary transition-colors break-all"
                                    >
                                        {lead.email}
                                    </a>
                                ) : (
                                    <NotRecorded />
                                )}
                            </DetailRow>

                            <DetailRow label="Address">
                                {prop ? (
                                    <>
                                        {prop.address}
                                        <span className="block text-muted-foreground">
                                            {prop.city}, {prop.state} {prop.zip}
                                        </span>
                                    </>
                                ) : (
                                    <NotRecorded
                                        action={canEdit ? "Add a property" : undefined}
                                        onAction={() => setEditOpen(true)}
                                    />
                                )}
                            </DetailRow>

                            {prop && (
                                <DetailRow label="Property type">
                                    {PROPERTY_TYPE_LABELS[prop.propertyType] ?? prop.propertyType}
                                </DetailRow>
                            )}

                            {designTypeLabels.length > 0 && (
                                <DetailRow label="Design type">
                                    {designTypeLabels.join(", ")}
                                </DetailRow>
                            )}

                            <DetailRow label="Source">
                                {SOURCE_LABELS[lead.source] ?? lead.source}
                                {lead.referredBy && (
                                    <span className="text-muted-foreground">
                                        {" "}
                                        · referred by {lead.referredBy}
                                    </span>
                                )}
                            </DetailRow>

                            <DetailRow label="Assigned to">
                                {lead.assignedRepName ?? <NotRecorded label="Unassigned" />}
                            </DetailRow>

                            {lead.convertedAt && (
                                <DetailRow label="Customer since">
                                    {new Date(lead.convertedAt).toLocaleDateString(undefined, {
                                        day: "numeric",
                                        month: "long",
                                        year: "numeric",
                                    })}
                                </DetailRow>
                            )}

                            {lead.stage === "cancelled" && (
                                <DetailRow label="Cancelled">
                                    {lead.cancelledAt && (
                                        <span className="text-muted-foreground">
                                            {new Date(lead.cancelledAt).toLocaleDateString(undefined, {
                                                day: "numeric",
                                                month: "long",
                                                year: "numeric",
                                            })}
                                            {lead.cancelledReason && " — "}
                                        </span>
                                    )}
                                    {lead.cancelledReason ?? (
                                        <span className="text-muted-foreground">No reason given</span>
                                    )}
                                </DetailRow>
                            )}

                            {lead.notes && (
                                <DetailRow label="Notes">
                                    <p className="whitespace-pre-wrap">{lead.notes}</p>
                                </DetailRow>
                            )}

                            {prop?.notes && (
                                <DetailRow label="Site notes">
                                    <p className="whitespace-pre-wrap">{prop.notes}</p>
                                </DetailRow>
                            )}
                        </dl>

                        {/* Notes and files: what people write down about this
                            lead, and what they attach to it. Both are additions
                            to the record rather than facts about the property,
                            so they sit beside the spec sheet, not inside it. */}
                        <div className="space-y-8 lg:sticky lg:top-14">
                            <LeadNotes leadId={lead._id} canWrite={canContribute} />
                            <LeadFiles leadId={lead._id} canWrite={canContribute} />
                        </div>
                    </div>
                </TabsContent>

                {/* Site Ocular Inspection */}
                <TabsContent value="ocular" className="mt-4">
                    <OcularInspectionTab lead={lead} property={prop} canSchedule={canEdit} />
                </TabsContent>

                {/* Quotes */}
                <TabsContent value="quotes" className="mt-4">
                    <QuotesTab lead={lead} property={prop} canEdit={canEdit} />
                </TabsContent>

                {/* Contract */}
                <TabsContent value="contracts" className="mt-4">
                    <div className="max-w-3xl">
                        <ContractSection
                            leadId={lead._id}
                            lead={lead}
                            stage={lead.stage}
                            canEdit={canEdit}
                        />
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
                            {/* Read-only. This is the system's own record of
                                what happened; anything a person wants to say is
                                a note on the Overview. */}
                            <div className="divide-y">
                                {activity === undefined ? (
                                    <div className="px-6 py-4 space-y-2">
                                        {[...Array(3)].map((_, i) => (
                                            <Skeleton key={i} className="h-12 w-full" />
                                        ))}
                                    </div>
                                ) : activity.length === 0 ? (
                                    <p className="px-6 py-8 text-sm text-muted-foreground text-center">
                                        No activity yet. Pipeline changes and every note written
                                        show up here.
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

            <Dialog open={cancelPromptOpen} onOpenChange={setCancelPromptOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancel this lead?</DialogTitle>
                        <DialogDescription>
                            {lead.firstName} {lead.lastName} moves to Completed as Cancelled.
                            Say why — this is the only place that reason lives.
                        </DialogDescription>
                    </DialogHeader>
                    <Textarea
                        autoFocus
                        placeholder="Reason (optional, but worth leaving one)"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="min-h-[88px] text-sm"
                    />
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setCancelPromptOpen(false)}>
                            Back
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() => void confirmCancel()}
                        >
                            Cancel Lead
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
