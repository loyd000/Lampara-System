import { useLeads, usePipelineSummary } from "@/lib/supabase/hooks.ts";
import type { Doc } from "@/lib/supabase/types.ts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";

/** The "Recent Leads" card shows a handful; no reason to fetch more. */
const RECENT_LEAD_COUNT = 6;
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";
import {
    Users, TrendingUp, ClipboardList, AlertTriangle, SunMedium, CheckCircle2, BarChart3,
} from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/constants.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";

type Props = { user: Doc<"users"> };

export default function AdminDashboard({ user }: Props) {
    // Counts come from the pipeline report, which aggregates in Postgres — the
    // dashboard no longer pulls every lead into the browser to count them.
    const pipelineQuery = usePipelineSummary();
    const leadsQuery = useLeads({ limit: RECENT_LEAD_COUNT });
    const { data: pipeline } = pipelineQuery;
    const { data: recentLeads } = leadsQuery;
    const navigate = useNavigate();

    if (pipelineQuery.isError || leadsQuery.isError) {
        return <QueryError title="Couldn't load your dashboard" onRetry={() => {
            void pipelineQuery.refetch(); void leadsQuery.refetch();
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

    const staleLeads = pipeline?.staleLeads ?? [];
    const hasAlerts = staleLeads.length > 0;

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
                    <StatCell title="Total Leads" value={stats?.total} icon={<Users className="w-4 h-4" />} />
                    <StatCell title="Active Pipeline" value={stats?.active} icon={<TrendingUp className="w-4 h-4" />} />
                    <StatCell title="Contracts Signed" value={stats?.contracts} icon={<ClipboardList className="w-4 h-4" />} />
                    <StatCell title="Installations" value={stats?.installs} icon={<SunMedium className="w-4 h-4" />} />
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Recent Activity */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-base">Recent Leads</CardTitle>
                            <Button size="sm" onClick={() => navigate("/leads")}>View all</Button>
                        </CardHeader>
                        <CardContent className="p-0 overflow-x-auto">
                            {recentLeads === undefined ? (
                                <div className="px-6 py-4 space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                            ) : recentLeads.length === 0 ? (
                                <p className="px-6 py-8 text-muted-foreground text-sm">No leads yet.</p>
                            ) : (
                                <table className="w-full text-sm min-w-[380px]">
                                    <tbody>
                                        {recentLeads.map(lead => (
                                            <tr
                                                key={lead._id}
                                                className="border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors"
                                                onClick={() => navigate(`/leads/${lead._id}`)}
                                            >
                                                <td className="px-6 py-3.5 font-medium">{lead.firstName} {lead.lastName}</td>
                                                <td className="px-6 py-3.5 text-muted-foreground hidden sm:table-cell">{lead.phone}</td>
                                                <td className="px-6 py-3.5">
                                                    <Badge className={STAGE_COLORS[lead.stage]}>{STAGE_LABELS[lead.stage]}</Badge>
                                                </td>
                                                <td className="px-6 py-3.5 text-muted-foreground text-xs hidden md:table-cell text-right">
                                                    {timeAgo(lead.lastActivityAt)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* Alerts */}
                <div>
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                                Needs Attention
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {pipelineQuery.isPending ? (
                                <Skeleton className="h-10 mx-6 mb-6" />
                            ) : !hasAlerts ? (
                                <div className="px-6 pb-6 flex items-center gap-2 text-sm text-emerald-600">
                                    <CheckCircle2 className="w-4 h-4" />
                                    All leads are up to date
                                </div>
                            ) : (
                                <ul className="divide-y">
                                    {staleLeads.slice(0, 3).map(lead => (
                                        <li
                                            key={lead._id}
                                            className="px-6 py-3.5 cursor-pointer hover:bg-muted/40 transition-colors"
                                            onClick={() => navigate(`/leads/${lead._id}`)}
                                        >
                                            <p className="text-sm font-medium">{lead.name}</p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                No activity for {lead.daysStale}d · {STAGE_LABELS[lead.stage]}
                                            </p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div className="px-6 pb-4 pt-3 border-t">
                                <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => navigate("/reports")}>
                                    <BarChart3 className="w-3.5 h-3.5 mr-1.5" />View Full Report
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

function StatCell({ title, value, icon }: { title: string; value: number | string | undefined; icon: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 px-5 py-5">
            <div>
                <p className="text-xs font-medium text-muted-foreground">{title}</p>
                <p className="text-[26px] font-bold tracking-[-0.02em] text-foreground mt-1 tabular-nums">
                    {value ?? "—"}
                </p>
            </div>
            <div className="text-muted-foreground mt-0.5">{icon}</div>
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

