import { useLeads, usePipelineSummary } from "@/lib/supabase/hooks.ts";
import type { Doc } from "@/lib/supabase/types.ts";

/** The "My Leads" card shows a handful; no reason to fetch more. */
const RECENT_LEAD_COUNT = 6;
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";
import { Users, TrendingUp, FileText, CheckCircle2, AlertTriangle } from "lucide-react";
import { STAGE_LABELS, STAGE_COLORS } from "@/lib/constants.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type Props = { user: Doc<"users"> };

export default function SalesDashboard({ user }: Props) {
    // RLS already scopes every lead query to this rep, so the pipeline report
    // returns their numbers rather than the whole business — no client-side
    // counting, and no unbounded fetch behind it.
    const { data: pipeline } = usePipelineSummary();
    const { data: myLeads } = useLeads({
        assignedSalesRepId: user._id,
        limit: RECENT_LEAD_COUNT,
    });
    const navigate = useNavigate();

    const byStage = pipeline?.stageCounts ?? {};
    const countIn = (...stages: string[]) =>
        stages.reduce((sum, stage) => sum + (byStage[stage] ?? 0), 0);

    const stats = pipeline
        ? {
            total: pipeline.totalLeads,
            active:
                pipeline.totalLeads -
                countIn("installation_complete", "active_customer"),
            proposals: countIn("proposal_sent"),
            contracts: pipeline.converted,
        }
        : null;

    const stale = pipeline?.staleLeads ?? [];

    return (
        <div className="p-6 space-y-6 max-w-5xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold">My Pipeline</h1>
                <p className="text-muted-foreground mt-0.5">Welcome back, {user.name?.split(" ")[0]}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: "My Leads", val: stats?.total, icon: <Users className="w-4 h-4 text-primary" /> },
                    { label: "Active", val: stats?.active, icon: <TrendingUp className="w-4 h-4 text-amber-600" /> },
                    { label: "Proposals Sent", val: stats?.proposals, icon: <FileText className="w-4 h-4 text-blue-500" /> },
                    { label: "Converted", val: stats?.contracts, icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" /> },
                ].map(s => (
                    <Card key={s.label}>
                        <CardContent className="pt-4">
                            <div className="flex items-center gap-2 mb-1">{s.icon}<span className="text-xs text-muted-foreground">{s.label}</span></div>
                            <p className="text-2xl font-bold">{s.val ?? "—"}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle className="text-base">My Leads</CardTitle>
                        <Button size="sm" onClick={() => navigate("/leads")}>View all</Button>
                    </CardHeader>
                    <CardContent className="p-0">
                        {myLeads === undefined ? (
                            <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
                        ) : myLeads.length === 0 ? (
                            <p className="p-4 text-sm text-muted-foreground">No leads assigned yet.</p>
                        ) : (
                            <table className="w-full text-sm">
                                <tbody>
                                    {myLeads.slice(0, 6).map(l => (
                                        <tr key={l._id} className="border-b last:border-0 hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/leads/${l._id}`)}>
                                            <td className="px-4 py-3 font-medium">{l.firstName} {l.lastName}</td>
                                            <td className="px-4 py-3"><Badge className={STAGE_COLORS[l.stage]}>{STAGE_LABELS[l.stage]}</Badge></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-amber-500" />Follow Up Needed
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {stale.length === 0 ? (
                            <p className="px-4 pb-4 text-sm text-emerald-600 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />All caught up!</p>
                        ) : stale.slice(0, 5).map(l => (
                            <div key={l._id} className="px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/leads/${l._id}`)}>
                                <p className="text-sm font-medium">{l.name}</p>
                                <p className="text-xs text-muted-foreground">{l.daysStale}d inactive · {STAGE_LABELS[l.stage]}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
