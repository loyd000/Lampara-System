import { useMemo } from "react";
import { addDays, format } from "date-fns";

import { useCalendarEvents, useLeads, usePipelineSummary } from "@/lib/supabase/hooks.ts";
import type { CalendarEvent } from "@/lib/supabase/queries/calendar.ts";
import type { Doc } from "@/lib/supabase/types.ts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

/** The "Recent Leads" card shows a handful; no reason to fetch more. */
const RECENT_LEAD_COUNT = 6;
/** How far ahead the "Upcoming" card looks. */
const UPCOMING_DAYS_AHEAD = 6;
/** How many of those events it actually lists — a peek, not the calendar. */
const UPCOMING_SHOWN = 4;
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";
import {
    Users, TrendingUp, ClipboardList, SunMedium, CalendarDays, ClipboardCheck, Wrench,
} from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/constants.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";
import { cn } from "@/lib/utils.ts";

const EVENT_KIND_STYLES: Record<CalendarEvent["kind"], string> = {
    inspection: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    installation: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function eventTab(event: CalendarEvent): string {
    return event.kind === "inspection" ? "ocular" : "installation";
}

type Props = { user: Doc<"users"> };

export default function AdminDashboard({ user }: Props) {
    // Counts come from the pipeline report, which aggregates in Postgres — the
    // dashboard no longer pulls every lead into the browser to count them.
    const pipelineQuery = usePipelineSummary();
    const leadsQuery = useLeads({ limit: RECENT_LEAD_COUNT });

    const today = useMemo(() => new Date(), []);
    const calendarRange = useMemo(
        () => ({
            from: format(today, "yyyy-MM-dd"),
            to: format(addDays(today, UPCOMING_DAYS_AHEAD), "yyyy-MM-dd"),
        }),
        [today],
    );
    // Field technicians see only their own jobs from this same hook; an
    // admin/superadmin viewer (the only roles this dashboard renders for)
    // gets the whole company's board, which is the point of a dashboard peek.
    const calendarQuery = useCalendarEvents(calendarRange);

    const { data: pipeline } = pipelineQuery;
    const { data: recentLeads } = leadsQuery;
    const { data: calendarEvents } = calendarQuery;
    const navigate = useNavigate();

    if (pipelineQuery.isError || leadsQuery.isError || calendarQuery.isError) {
        return <QueryError title="Couldn't load your dashboard" onRetry={() => {
            void pipelineQuery.refetch(); void leadsQuery.refetch(); void calendarQuery.refetch();
        }} />;
    }

    const byStage = pipeline?.stageCounts ?? {};
    const countIn = (...stages: string[]) =>
        stages.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0);

    const stats = pipeline
        ? {
            total: pipeline.totalLeads,
            active:
                pipeline.totalLeads -
                countIn("installation_complete", "active_customer", "cancelled"),
            contracts: pipeline.converted,
            installs: countIn(
                "installation_scheduled",
                "installation_complete",
                "active_customer",
            ),
        }
        : null;

    // The query sorts longest-first per start date — right for laying a
    // multi-day install out as one bar on the calendar grid, wrong for a flat
    // "what's next" list, which wants strict chronological order instead.
    // Installations carry no time-of-day (`allDay: true`, no `at`), so they
    // sort as the start of their day; inspections sort by their real time
    // within it.
    const eventSortKey = (e: CalendarEvent) =>
        e.kind === "inspection" ? e.at : `${e.startDate}T00:00:00`;
    const upcoming = [...(calendarEvents ?? [])]
        .sort((a, b) => eventSortKey(a).localeCompare(eventSortKey(b)))
        .slice(0, UPCOMING_SHOWN);

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">
                    Good {getGreeting()}, {user.name?.split(" ")[0] ?? "there"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">Here's what's happening at Lampara today.</p>
            </div>

            {/* Stat line — one unified panel, hairline-separated, not fragmented cards */}
            <Card className="py-0">
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y divide-border lg:divide-y-0 lg:divide-x">
                    <StatCell title="Total Projects" value={stats?.total} icon={<Users className="w-4 h-4" />} />
                    <StatCell title="Active Pipeline" value={stats?.active} icon={<TrendingUp className="w-4 h-4" />} />
                    <StatCell title="Contracts Signed" value={stats?.contracts} icon={<ClipboardList className="w-4 h-4" />} />
                    <StatCell title="Installations" value={stats?.installs} icon={<SunMedium className="w-4 h-4" />} />
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Recent Activity */}
                <Card className="lg:col-span-2">
                    <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                        <CardTitle className="text-base">Recent Projects</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => navigate("/projects")}>View all</Button>
                    </CardHeader>
                    <CardContent className="p-0 overflow-x-auto">
                        {recentLeads === undefined ? (
                            <div className="px-4 py-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                        ) : recentLeads.length === 0 ? (
                            <p className="px-4 py-8 text-muted-foreground text-sm">No projects yet.</p>
                        ) : (
                            <table className="w-full text-sm min-w-[380px]">
                                <thead>
                                    <tr className="border-b">
                                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Name</th>
                                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden sm:table-cell">Phone</th>
                                        <th className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide">Stage</th>
                                        <th className="text-right px-4 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wide hidden md:table-cell">Last Activity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentLeads.map(lead => (
                                        <tr
                                            key={lead._id}
                                            className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                                            onClick={() => navigate(`/projects/${lead._id}`)}
                                        >
                                            <td className="px-4 py-3.5 font-medium">{lead.firstName} {lead.lastName}</td>
                                            <td className="px-4 py-3.5 text-muted-foreground hidden sm:table-cell">{lead.phone}</td>
                                            <td className="px-4 py-3.5">
                                                <Badge className={STAGE_COLORS[lead.stage]}>{STAGE_LABELS[lead.stage]}</Badge>
                                            </td>
                                            <td className="px-4 py-3.5 text-muted-foreground text-xs hidden md:table-cell text-right">
                                                {timeAgo(lead.lastActivityAt)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>

                {/* Upcoming — the next week's inspections and installations,
                    company-wide. Replaces the old stale-leads alert card now
                    that Reports (where "View Full Report" pointed) is gone;
                    this is the thing an admin actually checks each morning. */}
                <Card className="h-full">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <CalendarDays className="w-4 h-4 text-muted-foreground" />
                            Upcoming
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {calendarQuery.isPending ? (
                            <div className="px-6 pb-6 space-y-2">
                                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                            </div>
                        ) : upcoming.length === 0 ? (
                            <div className="px-6 pb-6 flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                                <CalendarDays className="w-4 h-4" />
                                Nothing scheduled this week
                            </div>
                        ) : (
                            <ul className="divide-y">
                                {upcoming.map((event) => {
                                    const Icon = event.kind === "inspection" ? ClipboardCheck : Wrench;
                                    return (
                                        <li
                                            key={`${event.kind}-${event.id}`}
                                            className="flex items-start gap-3 px-6 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
                                            onClick={() => navigate(`/projects/${event.leadId}?tab=${eventTab(event)}`)}
                                        >
                                            <div
                                                className={cn(
                                                    "mt-0.5 flex items-center justify-center rounded-md size-7 shrink-0",
                                                    EVENT_KIND_STYLES[event.kind],
                                                )}
                                            >
                                                <Icon className="size-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium truncate">{event.leadName}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">
                                                    {event.kind === "inspection"
                                                        ? format(new Date(event.at), "EEE, MMM d · h:mm a")
                                                        : format(new Date(`${event.startDate}T00:00:00`), "EEE, MMM d")}
                                                </p>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <div className="px-6 pb-4 pt-3 border-t">
                            <Button size="sm" variant="ghost" className="w-full" onClick={() => navigate("/calendar")}>
                                <CalendarDays className="w-3.5 h-3.5 mr-1.5" />View Calendar
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

// Value-above-label, `items-center` — matches FieldDashboard's own StatCell
// exactly. The two used to disagree (this one ran label-above-value,
// `items-start`), so the same stat strip read as two different panels
// depending which role happened to sign in.
function StatCell({ title, value, icon }: { title: string; value: number | string | undefined; icon: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-5">
            <div>
                <p className="text-[26px] font-bold tracking-[-0.02em] text-foreground tabular-nums">
                    {value ?? "—"}
                </p>
                <p className="text-xs font-medium text-muted-foreground mt-0.5">{title}</p>
            </div>
            <div className="text-muted-foreground">{icon}</div>
        </div>
    );
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    return "evening";
}

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

