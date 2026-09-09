import { useState } from "react";
import {
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Plus,
    RotateCcw,
    Send,
    ShieldCheck,
    X,
} from "lucide-react";
import { toast } from "sonner";

import {
    useApproveSurveyReport,
    useCancelSurvey,
    useCurrentUser,
    useReopenSurveyReport,
    useSubmitSurveyReport,
    useSurveysForLead,
} from "@/lib/supabase/hooks.ts";
import type { Id, SurveyForLead } from "@/lib/supabase/types.ts";
import {
    INSPECTION_LABEL,
    SURVEY_STATUS_COLORS,
    SURVEY_STATUS_LABELS,
} from "@/lib/constants.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
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
import ScheduleSurveyDialog from "../ScheduleSurveyDialog.tsx";
import OcularReportForm from "./OcularReportForm.tsx";
import PhotoSlots from "./PhotoSlots.tsx";

/**
 * The Ocular Inspection tab: schedule the visit, fill the report, sign it off.
 *
 * Who may edit follows the report's own lifecycle rather than one blanket role
 * check — the technician owns it while it is theirs to fill, the office owns it
 * from the moment it is handed in.
 */
export default function OcularInspectionTab({
    leadId,
    propertyId,
    canSchedule,
}: {
    leadId: Id<"leads">;
    propertyId: Id<"properties"> | undefined;
    canSchedule: boolean;
}) {
    const { data: surveys } = useSurveysForLead(leadId);
    const { data: currentUser } = useCurrentUser();
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    if (surveys === undefined) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        );
    }

    const active = surveys.find((s) => s._id === selectedId) ?? surveys[0];
    const hasOpen = surveys.some((s) => s.status === "scheduled" || s.status === "submitted");

    if (!active) {
        return (
            <>
                <Card>
                    <CardContent className="py-12 flex flex-col items-center gap-2 text-center">
                        <ClipboardCheck className="w-9 h-9 text-muted-foreground/30" />
                        <p className="font-medium text-foreground">No inspection scheduled</p>
                        <p className="text-sm text-muted-foreground max-w-sm">
                            Book a {INSPECTION_LABEL.toLowerCase()} to capture the roof, the
                            electrical setup and the photos the quote is built from.
                        </p>
                        {canSchedule && propertyId && (
                            <Button size="sm" className="mt-2" onClick={() => setScheduleOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                Schedule inspection
                            </Button>
                        )}
                        {canSchedule && !propertyId && (
                            <p className="text-xs text-muted-foreground mt-2">
                                Add a property to this lead first — an inspection is booked
                                against a site.
                            </p>
                        )}
                    </CardContent>
                </Card>
                {propertyId && (
                    <ScheduleSurveyDialog
                        open={scheduleOpen}
                        onClose={() => setScheduleOpen(false)}
                        leadId={leadId}
                        propertyId={propertyId}
                    />
                )}
            </>
        );
    }

    const role = currentUser?.role ?? "";
    const isOffice = role === "admin" || role === "office";
    const isAssignedTech = currentUser?._id === active.assignedSurveyorId;

    // While it is scheduled the report belongs to whoever is on site; once it is
    // handed in, only the office can touch it. Approved and cancelled reports
    // are read-only — reopen to change one, so the change is deliberate.
    const editable =
        active.status === "scheduled"
            ? canSchedule || isAssignedTech
            : active.status === "submitted"
              ? isOffice
              : false;

    return (
        <div className="space-y-4">
            {/* Which inspection, when there has been more than one */}
            {surveys.length > 1 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1">Inspection:</span>
                    {surveys.map((s, i) => (
                        <Button
                            key={s._id}
                            size="sm"
                            variant={s._id === active._id ? "secondary" : "ghost"}
                            className="h-7 text-xs"
                            onClick={() => setSelectedId(s._id)}
                        >
                            {new Date(s.scheduledAt).toLocaleDateString()}
                            {i === 0 && " (latest)"}
                        </Button>
                    ))}
                </div>
            )}

            <StatusBar
                survey={active}
                canSchedule={canSchedule}
                isOffice={isOffice}
                editable={editable}
                onSchedule={() => setScheduleOpen(true)}
                allowSchedule={canSchedule && !hasOpen && !!propertyId}
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

            {propertyId && (
                <ScheduleSurveyDialog
                    open={scheduleOpen}
                    onClose={() => setScheduleOpen(false)}
                    leadId={leadId}
                    propertyId={propertyId}
                />
            )}
        </div>
    );
}

// ── Status and sign-off ─────────────────────────────────────────────────────

function StatusBar({
    survey,
    canSchedule,
    isOffice,
    editable,
    onSchedule,
    allowSchedule,
}: {
    survey: SurveyForLead;
    canSchedule: boolean;
    isOffice: boolean;
    editable: boolean;
    onSchedule: () => void;
    allowSchedule: boolean;
}) {
    const { mutateAsync: submitReport } = useSubmitSurveyReport();
    const { mutateAsync: approveReport } = useApproveSurveyReport();
    const { mutateAsync: reopenReport } = useReopenSurveyReport();
    const { mutateAsync: cancelSurvey } = useCancelSurvey();
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
                            <Badge
                                className={cn(
                                    SURVEY_STATUS_COLORS[survey.status],
                                    "text-[10px] font-semibold",
                                )}
                            >
                                {SURVEY_STATUS_LABELS[survey.status]}
                            </Badge>
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
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {survey.status === "scheduled" && editable && (
                            <ConfirmButton
                                label="Submit for approval"
                                icon={<Send className="w-3.5 h-3.5 mr-1.5" />}
                                title="Submit this report?"
                                description="The office reviews it next. You won't be able to edit it while it's under review."
                                disabled={busy}
                                onConfirm={() =>
                                    run(() => submitReport({ surveyId }), "Report submitted")
                                }
                            />
                        )}
                        {survey.status === "submitted" && isOffice && (
                            <>
                                <ConfirmButton
                                    label="Approve"
                                    icon={<ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
                                    title="Approve this report?"
                                    description="This signs the report off, marks the inspection complete and unlocks quoting for this lead."
                                    disabled={busy}
                                    onConfirm={() =>
                                        run(() => approveReport({ surveyId }), "Report approved")
                                    }
                                />
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs"
                                    disabled={busy}
                                    onClick={() =>
                                        run(() => reopenReport({ surveyId }), "Sent back for changes")
                                    }
                                >
                                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                    Send back
                                </Button>
                            </>
                        )}
                        {survey.status === "approved" && isOffice && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                disabled={busy}
                                onClick={() =>
                                    run(() => reopenReport({ surveyId }), "Report reopened")
                                }
                            >
                                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                                Reopen
                            </Button>
                        )}
                        {survey.status === "scheduled" && canSchedule && (
                            <ConfirmButton
                                label="Cancel"
                                variant="ghost"
                                destructive
                                icon={<X className="w-3.5 h-3.5 mr-1.5" />}
                                title="Cancel this inspection?"
                                description="The visit is called off. Anything already filled in stays on the record."
                                disabled={busy}
                                onConfirm={() =>
                                    run(() => cancelSurvey({ surveyId }), "Inspection cancelled")
                                }
                            />
                        )}
                        {allowSchedule && (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onSchedule}>
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                New inspection
                            </Button>
                        )}
                    </div>
                </div>

                {/* The two signature blocks at the foot of the printed report */}
                {(survey.preparedByName || survey.approvedByName) && (
                    <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t text-xs">
                        <SignOff
                            label="Prepared by"
                            name={survey.preparedByName}
                            at={survey.preparedAt}
                        />
                        <SignOff
                            label="Approved by"
                            name={survey.approvedByName}
                            at={survey.approvedAt}
                        />
                    </div>
                )}

                {!editable && survey.status === "submitted" && !isOffice && (
                    <p className="text-xs text-muted-foreground pt-1">
                        Submitted for approval — ask the office to send it back if something
                        needs changing.
                    </p>
                )}
                {survey.status === "approved" && (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 pt-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approved — this lead is ready to quote.
                    </p>
                )}
            </CardContent>
        </Card>
    );
}

function SignOff({
    label,
    name,
    at,
}: {
    label: string;
    name: string | null;
    at?: string;
}) {
    return (
        <div>
            <p className="text-muted-foreground">{label}</p>
            <p className="font-medium text-foreground">{name ?? "—"}</p>
            {at && (
                <p className="text-muted-foreground/70 text-[11px]">
                    {new Date(at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                    })}
                </p>
            )}
        </div>
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
                    className={cn("h-8 text-xs", destructive && "text-destructive hover:text-destructive")}
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
