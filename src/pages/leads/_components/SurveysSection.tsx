import { useState } from "react";
import { useCancelSurvey, useSurveysForLead } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SunMedium, Plus, CheckCircle2, Camera, CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import ScheduleSurveyDialog from "./ScheduleSurveyDialog.tsx";
import CompleteSurveyDialog from "./CompleteSurveyDialog.tsx";
import { toast } from "sonner";

type Props = {
    leadId: Id<"leads">;
    propertyId: Id<"properties"> | undefined;
    stage: string;
    canSchedule: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function SurveysSection({ leadId, propertyId, stage, canSchedule }: Props) {
    const { data: surveys } = useSurveysForLead(leadId);
    const { mutateAsync: cancelSurvey } = useCancelSurvey();
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [completeId, setCompleteId] = useState<Id<"surveys"> | null>(null);

    const hasScheduled = surveys?.some((s) => s.status === "scheduled");

    async function handleCancel(surveyId: Id<"surveys">) {
        try {
            await cancelSurvey({ surveyId });
            toast.success("Survey cancelled");
        } catch {
            toast.error("Failed to cancel survey");
        }
    }

    return (
        <>
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <SunMedium className="w-4 h-4 text-muted-foreground" />
                            Site Surveys
                        </CardTitle>
                        {canSchedule && !hasScheduled && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setScheduleOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />Schedule
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {surveys === undefined ? (
                        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : surveys.length === 0 ? (
                        <div className="text-center py-4">
                            <CalendarDays className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">No surveys yet</p>
                            {canSchedule && (
                                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setScheduleOpen(true)}>
                                    <Plus className="w-3 h-3 mr-1" />Schedule first survey
                                </Button>
                            )}
                        </div>
                    ) : (
                        surveys.map((survey) => (
                            <div key={survey._id} className="rounded-lg border p-3 space-y-2">
                                {/* Header row */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <Badge className={cn(STATUS_BADGE[survey.status], "text-[10px]")}>
                                                {survey.status}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                                {survey.status === "completed" && survey.completedAt
                                                    ? `Completed ${new Date(survey.completedAt).toLocaleDateString()}`
                                                    : new Date(survey.scheduledAt).toLocaleString(undefined, {
                                                        month: "short", day: "numeric", year: "numeric",
                                                        hour: "2-digit", minute: "2-digit",
                                                    })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Surveyor: {survey.surveyorName}
                                        </p>
                                    </div>
                                    <div className="flex gap-1">
                                        {survey.status === "scheduled" && canSchedule && (
                                            <>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-xs text-emerald-600 hover:text-emerald-700"
                                                    onClick={() => setCompleteId(survey._id as Id<"surveys">)}
                                                >
                                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />Complete
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 text-destructive hover:text-destructive"
                                                    onClick={() => handleCancel(survey._id as Id<"surveys">)}
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Survey results */}
                                {survey.status === "completed" && (
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs pt-1 border-t">
                                        {survey.estimatedSystemSizeKw && (
                                            <div>
                                                <span className="text-muted-foreground">System size: </span>
                                                <span className="font-medium">{survey.estimatedSystemSizeKw} kW</span>
                                            </div>
                                        )}
                                        {survey.roofType && (
                                            <div>
                                                <span className="text-muted-foreground">Roof: </span>
                                                <span className="font-medium capitalize">{survey.roofType.replace(/_/g, " ")}</span>
                                            </div>
                                        )}
                                        {survey.roofAgeYears != null && (
                                            <div>
                                                <span className="text-muted-foreground">Roof age: </span>
                                                <span className="font-medium">{survey.roofAgeYears} yrs</span>
                                            </div>
                                        )}
                                        {survey.shadingNotes && (
                                            <div className="col-span-2">
                                                <span className="text-muted-foreground">Shading: </span>
                                                <span>{survey.shadingNotes}</span>
                                            </div>
                                        )}
                                        {survey.additionalNotes && (
                                            <div className="col-span-2">
                                                <span className="text-muted-foreground">Notes: </span>
                                                <span>{survey.additionalNotes}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Photos */}
                                {survey.photoUrls && survey.photoUrls.length > 0 && (
                                    <div className="pt-1 border-t">
                                        <div className="flex items-center gap-1 mb-1.5">
                                            <Camera className="w-3 h-3 text-muted-foreground" />
                                            <span className="text-xs text-muted-foreground">{survey.photoUrls.length} photo{survey.photoUrls.length !== 1 ? "s" : ""}</span>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {survey.photoUrls.map((url, i) => (
                                                <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                                    <img
                                                        src={url}
                                                        alt={`Survey photo ${i + 1}`}
                                                        className="w-16 h-16 object-cover rounded-md border hover:opacity-80 transition-opacity cursor-pointer"
                                                    />
                                                </a>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
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
            {completeId && (
                <CompleteSurveyDialog
                    open={!!completeId}
                    onClose={() => setCompleteId(null)}
                    surveyId={completeId}
                />
            )}
        </>
    );
}
