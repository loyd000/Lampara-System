import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    ArrowLeft,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    ClipboardCheck,
    Plus,
    RotateCcw,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
    useCurrentUser,
    useDeleteSurvey,
    useSetSurveyCompleted,
    useSurveysForLead,
} from "@/lib/supabase/hooks.ts";
import type { Id, Lead, Property, SurveyForLead } from "@/lib/supabase/types.ts";
import {
    INSPECTION_LABEL,
} from "@/lib/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
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
import ScheduleSurveyDialog from "../ScheduleSurveyDialog.tsx";
import OcularReportForm from "./OcularReportForm.tsx";
import PhotoSlots from "./PhotoSlots.tsx";
import DownloadReportButton from "./DownloadReportButton.tsx";

/**
 * The Ocular Inspection tab.
 *
 * A lead can carry more than one report — a return visit after the roof is
 * repaired, a second site, a call that had to be rebooked. So the tab opens on
 * the list of them and a report is something you deliberately open, rather than
 * dropping into whichever one happens to be newest.
 *
 * The open report lives in the URL (`?report=<id>`), so a link can point at one
 * specific write-up the same way `?tab=` points at this tab.
 */
export default function OcularInspectionTab({
    lead,
    property,
    canSchedule,
}: {
    lead: Lead;
    property: Property | undefined;
    canSchedule: boolean;
}) {
    const leadId = lead._id as Id<"leads">;
    const propertyId = property?._id as Id<"properties"> | undefined;
    const surveysQuery = useSurveysForLead(leadId);
    const { data: surveys } = surveysQuery;
    const { data: currentUser } = useCurrentUser();
    const [searchParams, setSearchParams] = useSearchParams();
    const [createOpen, setCreateOpen] = useState(false);

    function openReport(id: string | null) {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (id) next.set("report", id);
                else next.delete("report");
                return next;
            },
            { replace: true },
        );
    }

    // Say so when the query fails, rather than sitting on the loading state.
    // Without this branch `surveys` simply stays undefined on error and the
    // tab shows skeletons for ever — which is how a stale PostgREST embed
    // (0029 dropped the FK it named) presented as a blank page rather than an
    // error anyone could act on.
    if (surveysQuery.isError) {
        return (
            <QueryError
                title="Couldn't load inspections"
                onRetry={() => void surveysQuery.refetch()}
            />
        );
    }

    if (surveys === undefined) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-9 w-48 rounded-md" />
                <Skeleton className="h-40 w-full rounded-lg" />
            </div>
        );
    }

    // A stale `?report=` — deleted, or belonging to another lead — falls back to
    // the list rather than an error.
    const openId = searchParams.get("report");
    const active = openId ? (surveys.find((s) => s._id === openId) ?? null) : null;

    const createDialog = propertyId ? (
        <ScheduleSurveyDialog
            open={createOpen}
            onClose={() => setCreateOpen(false)}
            onCreated={(id) => openReport(id)}
            leadId={leadId}
            propertyId={propertyId}
        />
    ) : null;

    // ── One report ────────────────────────────────────────────────────────
    if (active) {
        const isAssignedTech = currentUser?._id === active.assignedSurveyorId;

        // Admins and the assigned technician share one editable report. The
        // legacy status column is retained for existing rows, but no longer
        // gates editing or requires an approval handoff.
        const editable = active.status !== "cancelled" && (canSchedule || isAssignedTech);

        return (
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openReport(null)}
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    All reports
                </Button>

                <StatusBar
                    survey={active}
                    lead={lead}
                    property={property}
                    canSchedule={canSchedule}
                    editable={editable}
                    onDeleted={() => openReport(null)}
                />

                <OcularReportForm survey={active} editable={editable} />

                <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                        Report Photos
                    </h3>
                    <PhotoSlots
                        surveyId={active._id as Id<"surveys">}
                        photos={active.photos}
                        editable={editable}
                    />
                </div>

                {/* Photos taken before the report had named slots. */}
                {active.photoUrls.length > 0 && (
                    <div>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Earlier photos
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {active.photoUrls.map((url, i) => (
                                <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                                    <img
                                        src={url}
                                        alt={`Inspection photo ${i + 1}`}
                                        loading="lazy"
                                        className="w-24 h-24 object-cover rounded-md border hover:opacity-80 transition-opacity"
                                    />
                                </a>
                            ))}
                        </div>
                    </div>
                )}

                {createDialog}
            </div>
        );
    }

    // ── Nothing yet ───────────────────────────────────────────────────────
    if (surveys.length === 0) {
        return (
            <>
                <Empty>
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <ClipboardCheck className="size-6" />
                        </EmptyMedia>
                        <EmptyTitle>No reports yet</EmptyTitle>
                        <EmptyDescription>
                            A {INSPECTION_LABEL.toLowerCase()} records the roof, the electrical
                            setup and the photos the quote is built from.
                        </EmptyDescription>
                    </EmptyHeader>
                    {canSchedule && propertyId && (
                        <Button size="sm" onClick={() => setCreateOpen(true)}>
                            <Plus className="w-3.5 h-3.5 mr-1.5" />
                            Make ocular report
                        </Button>
                    )}
                    {canSchedule && !propertyId && (
                        <p className="text-xs text-muted-foreground">
                            Add a property to this lead first — a report is written against a
                            site.
                        </p>
                    )}
                </Empty>
                {createDialog}
            </>
        );
    }

    // ── The list ──────────────────────────────────────────────────────────
    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                    {surveys.length} report{surveys.length !== 1 ? "s" : ""}
                </p>
                {canSchedule && propertyId && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Make ocular report
                    </Button>
                )}
            </div>

            <ul className="border-y divide-y divide-border">
                {surveys.map((survey) => (
                    <li key={survey._id}>
                        <button
                            type="button"
                            onClick={() => openReport(survey._id)}
                            className="group w-full flex items-start gap-3 px-2 py-4 text-left rounded-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                        >
                            <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-foreground">
                                        {new Date(survey.scheduledAt).toLocaleString(undefined, {
                                            weekday: "short",
                                            day: "numeric",
                                            month: "short",
                                            year: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {survey.surveyorName}
                                    {progressOf(survey) && ` · ${progressOf(survey)}`}
                                </p>
                            </div>
                            <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                        </button>
                    </li>
                ))}
            </ul>

            {createDialog}
        </div>
    );
}

/**
 * What the row says about a report's progress.
 *
 * "Not started" is the useful signal on a list of reports filled over days;
 * a percentage would be false precision when most of the ~40 fields are
 * optional on any given site.
 */
function progressOf(survey: SurveyForLead): string | null {
    // A finished visit says so — otherwise the list gives no way to tell a
    // completed inspection from one still being filled in.
    if (survey.completedAt) return "Completed";

    const started =
        survey.inspectionDate ||
        survey.usageHabit ||
        survey.monthlyBillPhp !== undefined ||
        survey.monthlyConsumptionKwh !== undefined ||
        survey.roofType ||
        survey.roofAreaSqm !== undefined ||
        survey.meterPhase ||
        survey.systemCapacity ||
        survey.reportNotes ||
        survey.supportPurlins.length > 0 ||
        survey.mounting.length > 0 ||
        survey.roofOrientation.length > 0 ||
        survey.photos.length > 0;

    if (!started) return "Not started";

    const photos = survey.photos.length;
    return photos > 0 ? `${photos} photo${photos !== 1 ? "s" : ""}` : "In progress";
}

// ── Status and sign-off ─────────────────────────────────────────────────────

function StatusBar({
    survey,
    lead,
    property,
    canSchedule,
    editable,
    onDeleted,
}: {
    survey: SurveyForLead;
    lead: Lead;
    property: Property | undefined;
    canSchedule: boolean;
    /**
     * Admin staff *or* the assigned technician — completing a visit is the
     * technician's call to make, not something they wait on the office for.
     */
    editable: boolean;
    /** Deleting removes the report entirely, so the view goes back to the list. */
    onDeleted: () => void;
}) {
    const { mutateAsync: deleteSurvey } = useDeleteSurvey();
    const { mutateAsync: setCompleted } = useSetSurveyCompleted();
    const [busy, setBusy] = useState(false);

    const surveyId = survey._id as Id<"surveys">;

    async function run(action: () => Promise<unknown>, success: string) {
        setBusy(true);
        try {
            await action();
            toast.success(success);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Something went wrong");
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card>
            <CardContent className="py-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">
                                {survey.surveyorName}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(survey.scheduledAt).toLocaleString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                            })}
                        </p>
                        {survey.completedAt && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
                                <CheckCircle2 className="w-3 h-3" />
                                Completed {new Date(survey.completedAt).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    year: "numeric",
                                })}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                        <DownloadReportButton survey={survey} lead={lead} property={property} />
                        {editable && (
                            <Button
                                size="sm"
                                variant={survey.completedAt ? "ghost" : "default"}
                                className="h-9 text-xs"
                                disabled={busy}
                                onClick={() =>
                                    void run(
                                        () => setCompleted({
                                            surveyId,
                                            completed: !survey.completedAt,
                                        }),
                                        survey.completedAt
                                            ? "Inspection reopened"
                                            : "Inspection marked complete",
                                    )
                                }
                            >
                                {survey.completedAt ? (
                                    <>
                                        <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                        Reopen
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                        Mark complete
                                    </>
                                )}
                            </Button>
                        )}
                        {canSchedule && (
                            <ConfirmButton
                                label="Delete Report"
                                variant="ghost"
                                destructive
                                icon={<Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                                title="Delete this report?"
                                description="This permanently removes the report and its photos. This cannot be undone."
                                disabled={busy}
                                onConfirm={() =>
                                    run(
                                        () => deleteSurvey({ surveyId }).then(onDeleted),
                                        "Report deleted",
                                    )
                                }
                            />
                        )}
                    </div>
                </div>

            </CardContent>
        </Card>
    );
}

function ConfirmButton({
    label,
    icon,
    title,
    description,
    onConfirm,
    disabled,
    variant = "outline",
    destructive,
}: {
    label: string;
    icon: React.ReactNode;
    title: string;
    description: string;
    onConfirm: () => void;
    disabled?: boolean;
    variant?: "outline" | "ghost" | "default";
    destructive?: boolean;
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    size="sm"
                    variant={variant}
                    disabled={disabled}
                    className={cn("h-9 text-xs", destructive && "text-destructive hover:text-destructive")}
                >
                    {icon}
                    {label}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={onConfirm}
                        className={cn(
                            destructive &&
                                "bg-destructive text-destructive-foreground hover:bg-destructive/90",
                        )}
                    >
                        {label}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
