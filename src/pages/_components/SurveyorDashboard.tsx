import { useSurveysForSurveyor } from "@/lib/supabase/hooks.ts";
import type { Doc } from "@/lib/supabase/types.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useNavigate } from "react-router-dom";
import { Camera, ClipboardCheck, CalendarDays, MapPin, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";

type Props = { user: Doc<"users"> };

const STATUS_STYLES = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
} as const;

export default function SurveyorDashboard({ user }: Props) {
    const { data: upcoming } = useSurveysForSurveyor({ status: "scheduled" });
    const { data: completed } = useSurveysForSurveyor({ status: "completed" });
    const navigate = useNavigate();

    const todaySurveys = upcoming?.filter((s) => {
        const d = new Date(s.scheduledAt);
        const now = new Date();
        return d.toDateString() === now.toDateString();
    }) ?? [];

    return (
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">My Surveys</h1>
                <p className="text-muted-foreground mt-0.5">Welcome back, {user.name?.split(" ")[0]}</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-5 flex items-center gap-3">
                        <div className="p-2.5 bg-blue-50 dark:bg-blue-950/20 rounded-xl">
                            <CalendarDays className="w-5 h-5 text-blue-600" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Upcoming</p>
                            <p className="text-2xl font-bold">{upcoming?.length ?? "—"}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-5 flex items-center gap-3">
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/20 rounded-xl">
                            <Clock className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Today</p>
                            <p className="text-2xl font-bold">{todaySurveys.length}</p>
                        </div>
                    </CardContent>
                </Card>
                <Card className="col-span-2 md:col-span-1">
                    <CardContent className="pt-5 flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground">Completed</p>
                            <p className="text-2xl font-bold">{completed?.length ?? "—"}</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Today's surveys */}
            {todaySurveys.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Today
                    </h2>
                    <div className="space-y-2">
                        {todaySurveys.map((s) => (
                            <SurveyCard key={s._id} survey={s} onClick={() => navigate(`/leads/${s.leadId}`)} urgent />
                        ))}
                    </div>
                </div>
            )}

            {/* Upcoming */}
            <div>
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                    Upcoming Surveys
                </h2>
                {upcoming === undefined ? (
                    <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
                ) : upcoming.filter((s) => {
                    const d = new Date(s.scheduledAt);
                    const now = new Date();
                    return d.toDateString() !== now.toDateString();
                }).length === 0 ? (
                    <Card>
                        <CardContent className="py-8 flex flex-col items-center gap-2 text-muted-foreground">
                            <CalendarDays className="w-8 h-8 opacity-30" />
                            <p className="text-sm">No upcoming surveys scheduled</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2">
                        {upcoming
                            .filter((s) => new Date(s.scheduledAt).toDateString() !== new Date().toDateString())
                            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
                            .map((s) => (
                                <SurveyCard key={s._id} survey={s} onClick={() => navigate(`/leads/${s.leadId}`)} />
                            ))}
                    </div>
                )}
            </div>

            {/* Recent completed */}
            {(completed?.length ?? 0) > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                        Recently Completed
                    </h2>
                    <div className="space-y-2">
                        {completed!.slice(0, 4).map((s) => (
                            <SurveyCard key={s._id} survey={s} onClick={() => navigate(`/leads/${s.leadId}`)} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

type SurveyItem = {
    _id: string;
    leadId: string;
    status: "scheduled" | "completed" | "cancelled";
    scheduledAt: string;
    completedAt?: string;
    leadName: string;
    address: string | null;
    surveyorName: string;
};

function SurveyCard({
    survey, onClick, urgent,
}: { survey: SurveyItem; onClick: () => void; urgent?: boolean }) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-start gap-4 p-4 rounded-xl border bg-card cursor-pointer",
                "hover:shadow-md hover:border-primary/30 transition-all",
                urgent && "border-amber-300/60 dark:border-amber-700/40",
            )}
        >
            <div className={cn(
                "p-2.5 rounded-lg flex-shrink-0",
                survey.status === "completed"
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : urgent
                        ? "bg-amber-100 dark:bg-amber-900/20"
                        : "bg-blue-100 dark:bg-blue-900/20",
            )}>
                {survey.status === "completed"
                    ? <Camera className="w-4 h-4 text-emerald-600" />
                    : <ClipboardCheck className="w-4 h-4 text-blue-600" />}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{survey.leadName}</p>
                    <Badge className={`${STATUS_STYLES[survey.status]} text-[10px]`}>
                        {survey.status}
                    </Badge>
                </div>
                {survey.address && (
                    <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">{survey.address}</p>
                    </div>
                )}
                <p className="text-xs text-muted-foreground mt-0.5">
                    {survey.status === "completed" && survey.completedAt
                        ? `Completed ${new Date(survey.completedAt).toLocaleDateString()}`
                        : new Date(survey.scheduledAt).toLocaleString(undefined, {
                            weekday: "short", month: "short", day: "numeric",
                            hour: "2-digit", minute: "2-digit",
                        })}
                </p>
            </div>
        </div>
    );
}
