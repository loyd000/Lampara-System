import { useInstallationsForInstaller } from "@/lib/supabase/hooks.ts";
import type { Doc } from "@/lib/supabase/types.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Wrench, CalendarDays, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { useNavigate } from "react-router-dom";

type User = Doc<"users"> & { role: string };

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

type Props = { user: User };

export default function InstallerDashboard({ user }: Props) {
    const { data: installations } = useInstallationsForInstaller();
    const navigate = useNavigate();

    const upcoming = installations?.filter((i) =>
        ["scheduled", "in_progress"].includes(i.status) &&
        new Date(i.scheduledDate) >= new Date(new Date().toDateString()),
    ).sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate)) ?? [];

    const onHold = installations?.filter((i) => i.status === "on_hold") ?? [];
    const completed = installations?.filter((i) => i.status === "completed")
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""))
        .slice(0, 5) ?? [];

    const todayStr = new Date().toDateString();
    const todayJobs = upcoming.filter((i) =>
        new Date(i.scheduledDate).toDateString() === todayStr,
    );

    return (
        <div className="p-6 space-y-6 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold">
                    Good {getGreeting()}, {user.name?.split(" ")[0] ?? "there"}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Your installation jobs at Lampara</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard icon={<CalendarDays />} label="Upcoming" value={upcoming.length} />
                <StatCard icon={<Wrench />} label="In Progress" value={installations?.filter((i) => i.status === "in_progress").length ?? 0} color="amber" />
                <StatCard icon={<CheckCircle2 />} label="Completed" value={completed.length} color="emerald" />
            </div>

            {/* Today's jobs */}
            {todayJobs.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today</h2>
                    <div className="space-y-3">
                        {todayJobs.map((job) => (
                            <JobCard key={job._id} job={job} onClick={() => navigate(`/leads/${job.leadId}`)} highlight />
                        ))}
                    </div>
                </div>
            )}

            {/* Upcoming */}
            {upcoming.filter((j) => new Date(j.scheduledDate).toDateString() !== todayStr).length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Upcoming</h2>
                    <div className="space-y-3">
                        {upcoming
                            .filter((j) => new Date(j.scheduledDate).toDateString() !== todayStr)
                            .map((job) => (
                                <JobCard key={job._id} job={job} onClick={() => navigate(`/leads/${job.leadId}`)} />
                            ))}
                    </div>
                </div>
            )}

            {/* On Hold */}
            {onHold.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">On Hold</h2>
                    <div className="space-y-3">
                        {onHold.map((job) => (
                            <JobCard key={job._id} job={job} onClick={() => navigate(`/leads/${job.leadId}`)} />
                        ))}
                    </div>
                </div>
            )}

            {/* No jobs */}
            {installations !== undefined && installations.filter((i) => i.status !== "completed").length === 0 && (
                <Card>
                    <CardContent className="py-10 flex flex-col items-center gap-2 text-muted-foreground">
                        <Wrench className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No jobs assigned to you yet</p>
                    </CardContent>
                </Card>
            )}

            {/* Recent completed */}
            {completed.length > 0 && (
                <div>
                    <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Recently Completed</h2>
                    <div className="space-y-2">
                        {completed.map((job) => (
                            <JobCard key={job._id} job={job} onClick={() => navigate(`/leads/${job.leadId}`)} />
                        ))}
                    </div>
                </div>
            )}

            {installations === undefined && (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
            )}
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ icon, label, value, color }: {
    icon: React.ReactNode;
    label: string;
    value: number;
    color?: "amber" | "emerald";
}) {
    const colorMap = {
        amber: "text-amber-500",
        emerald: "text-emerald-500",
    };
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-bold">{value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                    <div className={cn("w-8 h-8 flex items-center justify-center rounded-lg bg-muted",
                        color && colorMap[color])}>
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

type JobCardProps = {
    job: {
        _id: string;
        status: string;
        scheduledDate: string;
        customerName: string;
        address: string | null;
        completedAt?: string;
        materialsChecklist?: { item: string; checked: boolean }[];
    };
    onClick: () => void;
    highlight?: boolean;
};

function JobCard({ job, onClick, highlight }: JobCardProps) {
    const checklist = job.materialsChecklist ?? [];
    const checked = checklist.filter((i) => i.checked).length;

    return (
        <Card
            className={cn(
                "cursor-pointer hover:shadow-md transition-shadow",
                highlight && "border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10",
            )}
            onClick={onClick}
        >
            <CardContent className="py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">{job.customerName}</p>
                        {job.address && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{job.address}</p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                            <Clock className="w-3 h-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                                {job.status === "completed" && job.completedAt
                                    ? `Completed ${new Date(job.completedAt).toLocaleDateString()}`
                                    : new Date(job.scheduledDate).toLocaleDateString(undefined, {
                                        weekday: "short", month: "short", day: "numeric",
                                    })}
                            </span>
                        </div>
                        {checklist.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                Materials: {checked}/{checklist.length} checked
                            </p>
                        )}
                    </div>
                    <Badge className={cn(STATUS_BADGE[job.status], "text-[10px] shrink-0")}>
                        {STATUS_LABEL[job.status]}
                    </Badge>
                </div>
            </CardContent>
        </Card>
    );
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
}
