import {
    useInstallationsSummary,
    usePermitsSummary,
    usePipelineSummary,
    useQuotesRevenueSummary,
} from "@/lib/supabase/hooks.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useNavigate } from "react-router-dom";
import {
    BarChart3, TrendingUp, AlertTriangle, Wrench, DollarSign, FileCheck, SunMedium,
    ShieldAlert,
} from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS, STAGES } from "@/lib/constants.ts";
import { cn } from "@/lib/utils.ts";

const PERMIT_TYPE_LABELS: Record<string, string> = {
    building_permit: "Building Permit",
    electrical_permit: "Electrical Permit",
    hoa_approval: "HOA Approval",
    utility_interconnection: "Utility Interconnection",
    other: "Other",
};

const FINANCING_LABELS: Record<string, string> = {
    cash: "Cash", loan: "Loan", lease: "Lease", ppa: "PPA",
};

export default function ReportsPage() {
    const { data: pipeline } = usePipelineSummary();
    const { data: permits } = usePermitsSummary();
    const { data: revenue } = useQuotesRevenueSummary();
    const { data: installations } = useInstallationsSummary();
    const navigate = useNavigate();

    const isLoading = pipeline === undefined || permits === undefined || revenue === undefined || installations === undefined;

    return (
        <div className="p-6 space-y-7 max-w-6xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold">Reports</h1>
                <p className="text-muted-foreground text-sm mt-0.5">Business overview and operational metrics</p>
            </div>

            {/* ── Top KPIs ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Leads"
                    value={pipeline?.totalLeads}
                    icon={<TrendingUp className="w-5 h-5" />}
                    color="bg-primary/8 text-primary"
                    loading={isLoading}
                />
                <KpiCard
                    label="Conversion Rate"
                    value={pipeline ? `${pipeline.conversionRate}%` : undefined}
                    icon={<FileCheck className="w-5 h-5" />}
                    color="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600"
                    loading={isLoading}
                />
                <KpiCard
                    label="Pipeline Value"
                    value={revenue ? `$${(revenue.pipelineValue / 1000).toFixed(0)}k` : undefined}
                    icon={<DollarSign className="w-5 h-5" />}
                    color="bg-amber-50 dark:bg-amber-950/20 text-amber-600"
                    loading={isLoading}
                />
                <KpiCard
                    label="Active Customers"
                    value={pipeline?.activeCustomers}
                    icon={<SunMedium className="w-5 h-5" />}
                    color="bg-orange-50 dark:bg-orange-950/20 text-orange-500"
                    loading={isLoading}
                />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
                {/* ── Pipeline by Stage ─────────────────────────── */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="w-4 h-4 text-muted-foreground" />Pipeline by Stage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <LoadingSkeleton /> : (
                            <div className="space-y-2.5">
                                {STAGES.map((stage) => {
                                    const count = pipeline.stageCounts[stage] ?? 0;
                                    const max = Math.max(...(Object.values(pipeline.stageCounts) as number[]), 1);
                                    const pct = Math.round((count / max) * 100);
                                    return (
                                        <div key={stage} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-muted-foreground">{STAGE_LABELS[stage]}</span>
                                                <span className="font-semibold tabular-nums">{count}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-primary/60 transition-all duration-500"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── Revenue Summary ───────────────────────────── */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <DollarSign className="w-4 h-4 text-muted-foreground" />Revenue & Quotes
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <LoadingSkeleton /> : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <MetricBox label="Closed Value" value={`$${revenue.closedValue.toLocaleString()}`} />
                                    <MetricBox label="Avg Deal Size" value={`$${revenue.avgDealSize.toLocaleString()}`} />
                                    <MetricBox label="Total Quotes" value={revenue.totalQuotes} />
                                    <MetricBox label="Accepted" value={revenue.acceptedQuotes} />
                                </div>
                                {Object.keys(revenue.financingMix).length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-muted-foreground mb-2">Financing Mix</p>
                                        <div className="flex flex-wrap gap-2">
                                            {Object.entries(revenue.financingMix).map(([k, v]) => (
                                                <div key={k} className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-muted">
                                                    <span className="font-medium">{FINANCING_LABELS[k]}</span>
                                                    <span className="text-muted-foreground">{v as number}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── Overdue Permits ───────────────────────────── */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-muted-foreground" />
                            Permit Status
                            {(permits?.overdue.length ?? 0) > 0 && (
                                <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 text-[10px]">
                                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                                    {permits!.overdue.length} overdue
                                </Badge>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <LoadingSkeleton /> : (
                            <div className="space-y-4">
                                {/* Status counts */}
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: "not_submitted", label: "Not Submitted", cls: "text-slate-600" },
                                        { key: "submitted", label: "Submitted", cls: "text-blue-600" },
                                        { key: "approved", label: "Approved", cls: "text-emerald-600" },
                                        { key: "rejected", label: "Rejected", cls: "text-red-600" },
                                    ].map(({ key, label, cls }) => (
                                        <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                                            <span className="text-xs text-muted-foreground">{label}</span>
                                            <span className={cn("text-sm font-bold", cls)}>{permits.byStatus[key] ?? 0}</span>
                                        </div>
                                    ))}
                                </div>

                                {/* Overdue list */}
                                {permits.overdue.length > 0 && (
                                    <div>
                                        <p className="text-xs font-medium text-red-500 mb-2">Overdue Permits</p>
                                        <div className="space-y-2">
                                            {permits.overdue.slice(0, 5).map((p) => (
                                                <div
                                                    key={p._id}
                                                    className="flex items-center justify-between p-2.5 rounded-lg border border-red-100 dark:border-red-900/30 bg-red-50/50 dark:bg-red-900/10 cursor-pointer hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    onClick={() => navigate(`/leads/${p.leadId}`)}
                                                >
                                                    <div>
                                                        <p className="text-xs font-medium">{p.customerName}</p>
                                                        <p className="text-[10px] text-muted-foreground">{PERMIT_TYPE_LABELS[p.type]}</p>
                                                    </div>
                                                    <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 text-[10px]">
                                                        {p.daysOverdue}d overdue
                                                    </Badge>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* ── Installations & Service ───────────────────── */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />Installations & Service
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? <LoadingSkeleton /> : (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    {[
                                        { key: "scheduled", label: "Scheduled", cls: "text-blue-600" },
                                        { key: "in_progress", label: "In Progress", cls: "text-amber-600" },
                                        { key: "completed", label: "Completed", cls: "text-emerald-600" },
                                        { key: "on_hold", label: "On Hold", cls: "text-slate-500" },
                                    ].map(({ key, label, cls }) => (
                                        <div key={key} className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40">
                                            <span className="text-xs text-muted-foreground">{label}</span>
                                            <span className={cn("text-sm font-bold", cls)}>{installations.byStatus[key] ?? 0}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/20">
                                    <span className="text-sm text-muted-foreground">Open Service Tickets</span>
                                    <span className={cn(
                                        "text-lg font-bold",
                                        installations.openServiceTickets > 0 ? "text-amber-600" : "text-emerald-600",
                                    )}>
                                        {installations.openServiceTickets}
                                    </span>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Stale Leads Table ─────────────────────────────── */}
            {(pipeline?.staleLeads.length ?? 0) > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                            Stale Leads
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-[10px]">
                                {pipeline!.staleLeads.length} need attention
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                                    <th className="px-4 py-2.5 text-left">Customer</th>
                                    <th className="px-4 py-2.5 text-left">Stage</th>
                                    <th className="px-4 py-2.5 text-left">Inactive</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pipeline!.staleLeads.map((lead) => (
                                    <tr
                                        key={lead._id}
                                        className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                                        onClick={() => navigate(`/leads/${lead._id}`)}
                                    >
                                        <td className="px-4 py-3 font-medium">{lead.name}</td>
                                        <td className="px-4 py-3">
                                            <Badge className={cn(STAGE_COLORS[lead.stage as keyof typeof STAGE_COLORS], "text-xs")}>
                                                {STAGE_LABELS[lead.stage as keyof typeof STAGE_LABELS]}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                                                {lead.daysStale}d inactive
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
    label, value, icon, color, loading,
}: {
    label: string;
    value: number | string | undefined;
    icon: React.ReactNode;
    color: string;
    loading: boolean;
}) {
    return (
        <Card>
            <CardContent className="pt-5 pb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <p className="text-xs text-muted-foreground">{label}</p>
                        {loading ? (
                            <Skeleton className="h-8 w-16 mt-1" />
                        ) : (
                            <p className="text-3xl font-bold mt-1">{value ?? "—"}</p>
                        )}
                    </div>
                    <div className={cn("p-2.5 rounded-xl", color)}>{icon}</div>
                </div>
            </CardContent>
        </Card>
    );
}

function MetricBox({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
            <p className="text-lg font-bold mt-0.5">{value}</p>
        </div>
    );
}

function LoadingSkeleton() {
    return (
        <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
    );
}
