import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
    CalendarDays,
    CheckCircle2,
    ClipboardCheck,
    Clock,
    MapPin,
    Sun,
    Wrench,
} from "lucide-react";

import { useMyInspections, useMyInstallations } from "@/lib/supabase/hooks.ts";
import type { ChecklistItem, Doc } from "@/lib/supabase/types.ts";
import {
    INSPECTION_LABEL_SHORT,
    INSTALLATION_STATUS_LABELS,
    SURVEY_STATUS_COLORS,
    SURVEY_STATUS_LABELS,
} from "@/lib/constants.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * The single dashboard for the merged `field` role.
 *
 * Replaces SurveyorDashboard + InstallerDashboard: one technician now does both
 * ocular inspections and installations, so their day is one list, not two. Both
 * job types are normalised into `FieldJob` and interleaved chronologically —
 * seeing "10am inspection, 2pm install" in one column is the whole point of the
 * merge.
 */

type Props = { user: Doc<"users"> };

type JobKind = "inspection" | "installation";

type FieldJob = {
    id: string;
    kind: JobKind;
    leadId: string;
    customerName: string;
    address: string | null;
    /** Local Date for the scheduled moment. */
    at: Date;
    /** Installations carry a date with no time; don't render a clock for them. */
    allDay: boolean;
    status: string;
    /**
     * Whether the job is finished. The two job types disagree on what that
     * means — an inspection ends `approved` (0009), an installation ends
     * `completed` — so it is resolved once, here, rather than by string
     * matching at every call site.
     */
    done: boolean;
    statusLabel: string;
    statusClass: string;
    completedAt?: string;
    checklist?: ChecklistItem[];
};

// Installations have their own status vocabulary; inspections gained
// submitted/approved in 0009. Each is resolved against its own map at
// normalisation time so the two can never be looked up in the wrong one.
const INSTALL_STATUS_COLORS: Record<string, string> = {
    scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    on_hold: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

/**
 * `installations.scheduled_date` is a bare `YYYY-MM-DD`, which `new Date()`
 * reads as UTC midnight — that lands a job on the previous day for anyone west
 * of UTC. Parse date-only strings as local midnight instead.
 */
function parseJobDate(value: string): Date {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.exec(value);
    if (dateOnly) {
        const [y, m, d] = value.split("-").map(Number);
        return new Date(y, m - 1, d);
    }
    return new Date(value);
}

function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export default function FieldDashboard({ user }: Props) {
    const { data: inspections } = useMyInspections();
    const { data: installations } = useMyInstallations();
    const navigate = useNavigate();

    const loading = inspections === undefined || installations === undefined;

    const jobs = useMemo<FieldJob[]>(() => {
        const fromInspections: FieldJob[] = (inspections ?? []).map((s) => ({
            id: s._id,
            kind: "inspection",
            leadId: s.leadId,
            customerName: s.leadName,
            address: s.address,
            at: parseJobDate(s.scheduledAt),
            allDay: false,
            status: s.status,
            done: s.status === "approved",
            statusLabel: SURVEY_STATUS_LABELS[s.status] ?? s.status,
            statusClass: SURVEY_STATUS_COLORS[s.status] ?? "",
            completedAt: s.completedAt,
        }));

        const fromInstalls: FieldJob[] = (installations ?? []).map((i) => ({
            id: i._id,
            kind: "installation",
            leadId: i.leadId,
            customerName: i.customerName,
            address: i.address,
            at: parseJobDate(i.scheduledDate),
            allDay: true,
            status: i.status,
            done: i.status === "completed",
            statusLabel: INSTALLATION_STATUS_LABELS[i.status] ?? i.status,
            statusClass: INSTALL_STATUS_COLORS[i.status] ?? "",
            completedAt: i.completedAt,
            checklist: i.materialsChecklist,
        }));

        return [...fromInspections, ...fromInstalls].sort(
            (a, b) => a.at.getTime() - b.at.getTime(),
        );
    }, [inspections, installations]);

    const today = startOfDay(new Date());
    const weekEnd = new Date(today.getTime() + 7 * 86400000);
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);

    const isOpen = (j: FieldJob) => !j.done && j.status !== "cancelled";

    const todayJobs = jobs.filter(
        (j) => isOpen(j) && startOfDay(j.at).getTime() === today.getTime(),
    );
    const upcoming = jobs.filter(
        (j) => isOpen(j) && j.status !== "on_hold" && startOfDay(j.at) > today,
    );
    const overdue = jobs.filter(
        (j) => isOpen(j) && j.status !== "on_hold" && startOfDay(j.at) < today,
    );
    const onHold = jobs.filter((j) => j.status === "on_hold");
    const completed = jobs
        .filter((j) => j.done)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

    const thisWeek = jobs.filter(
        (j) => isOpen(j) && startOfDay(j.at) >= today && startOfDay(j.at) < weekEnd,
    );
    const completedRecently = completed.filter(
        (j) => j.completedAt && new Date(j.completedAt) >= thirtyDaysAgo,
    );

    const open = (job: FieldJob) => navigate(`/leads/${job.leadId}`);

    if (loading) {
        return (
            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                <Skeleton className="h-8 w-56 rounded-md" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[...Array(4)].map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-20 w-full rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                    Good {greeting()}, {user.name?.split(" ")[0] ?? "there"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Your inspections and installations at Lampara
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard icon={<Clock className="size-4" />} label="Today" value={todayJobs.length} />
                <StatCard icon={<CalendarDays className="size-4" />} label="Next 7 days" value={thisWeek.length} />
                <StatCard icon={<Wrench className="size-4" />} label="Open jobs" value={jobs.filter(isOpen).length} />
                <StatCard icon={<CheckCircle2 className="size-4" />} label="Done (30d)" value={completedRecently.length} />
            </div>

            {/* Overdue — anything still open with a date in the past */}
            {overdue.length > 0 && (
                <Section title="Overdue">
                    {overdue.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => open(job)} tone="overdue" />
                    ))}
                </Section>
            )}

            {/* Today */}
            {todayJobs.length > 0 && (
                <Section title="Today">
                    {todayJobs.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => open(job)} tone="today" />
                    ))}
                </Section>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
                <Section title="Upcoming">
                    {upcoming.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => open(job)} />
                    ))}
                </Section>
            )}

            {/* On hold */}
            {onHold.length > 0 && (
                <Section title="On Hold">
                    {onHold.map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => open(job)} />
                    ))}
                </Section>
            )}

            {/* Nothing assigned */}
            {jobs.filter(isOpen).length === 0 && (
                <Card>
                    <CardContent className="py-10 px-6 flex flex-col items-center gap-2 text-muted-foreground">
                        <Wrench className="w-8 h-8 opacity-30" />
                        <p className="text-sm">No jobs assigned to you yet</p>
                        <p className="text-xs text-muted-foreground/70">
                            Inspections and installations scheduled for you will appear here.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* Recently completed */}
            {completed.length > 0 && (
                <Section title="Recently Completed">
                    {completed.slice(0, 5).map((job) => (
                        <JobCard key={job.id} job={job} onClick={() => open(job)} />
                    ))}
                </Section>
            )}
        </div>
    );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                {title}
            </h2>
            <div className="space-y-2">{children}</div>
        </div>
    );
}

function StatCard({ icon, label, value }: {
    icon: React.ReactNode;
    label: string;
    value: number;
}) {
    return (
        <Card>
            <CardContent>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
                        <p className="text-xs font-medium text-muted-foreground mt-0.5">{label}</p>
                    </div>
                    <div className="size-8 flex items-center justify-center rounded-md bg-secondary text-foreground border border-border">
                        {icon}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function JobCard({ job, onClick, tone }: {
    job: FieldJob;
    onClick: () => void;
    tone?: "today" | "overdue";
}) {
    const checked = job.checklist?.filter((i) => i.checked).length ?? 0;
    const total = job.checklist?.length ?? 0;
    const isInspection = job.kind === "inspection";

    return (
        <div
            onClick={onClick}
            className={cn(
                "flex items-start gap-4 px-5 py-4 rounded-lg border bg-card cursor-pointer",
                "hover:shadow-md hover:border-primary/30 transition-all",
                tone === "today" && "border-amber-300/60 dark:border-amber-700/40",
                tone === "overdue" && "border-destructive/40",
            )}
        >
            {/* Kind icon */}
            <div className={cn(
                "p-2.5 rounded-lg flex-shrink-0",
                job.done
                    ? "bg-emerald-100 dark:bg-emerald-900/30"
                    : isInspection
                        ? "bg-blue-100 dark:bg-blue-900/20"
                        : "bg-purple-100 dark:bg-purple-900/20",
            )}>
                {isInspection
                    ? <ClipboardCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    : <Sun className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm truncate">{job.customerName}</p>
                    <Badge variant="secondary" className="text-[10px] font-medium">
                        {isInspection ? INSPECTION_LABEL_SHORT : "Installation"}
                    </Badge>
                    <Badge className={cn(job.statusClass, "text-[10px]")}>
                        {job.statusLabel}
                    </Badge>
                </div>

                {job.address && (
                    <div className="flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">{job.address}</p>
                    </div>
                )}

                <p className="text-xs text-muted-foreground mt-1">
                    {job.done && job.completedAt
                        ? `Completed ${new Date(job.completedAt).toLocaleDateString()}`
                        : job.at.toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            ...(job.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
                        })}
                </p>

                {total > 0 && !job.done && (
                    <p className="text-xs text-muted-foreground mt-1">
                        Materials: {checked}/{total} checked
                    </p>
                )}
            </div>
        </div>
    );
}

function greeting() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    return "evening";
}
