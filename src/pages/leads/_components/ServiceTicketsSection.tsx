import { useState } from "react";
import {
    useInstallationForLead,
    useTicketsForLead,
    useUpdateTicketStatus,
} from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
    Wrench, Plus, ChevronDown, ChevronUp, ShieldCheck, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import CreateTicketDialog from "./CreateTicketDialog.tsx";
import { InlineQueryError } from "@/components/query-error.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const PRIORITY_BADGE: Record<string, string> = {
    low: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
    medium: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    high: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

const STATUS_BADGE: Record<string, string> = {
    open: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",
    in_progress: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    resolved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    closed: "bg-slate-500/15 text-slate-700 dark:text-slate-400 border-slate-500/30",
};

const STATUS_LABEL: Record<string, string> = {
    open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};

export default function ServiceTicketsSection({ leadId, stage, canEdit }: Props) {
    const { data: installation } = useInstallationForLead(leadId);
    const ticketsQuery = useTicketsForLead(leadId);
    const { data: tickets } = ticketsQuery;
    const { mutateAsync: updateStatus } = useUpdateTicketStatus();
    const [createOpen, setCreateOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

    const isUnlocked = stage === "active_customer" || stage === "installation_complete";

    function toggleExpand(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleStatusChange(
        ticketId: Id<"serviceTickets">,
        status: "open" | "in_progress" | "resolved" | "closed",
    ) {
        setChangingStatusId(ticketId);
        try {
            await updateStatus({ ticketId, status });
            toast.success(`Ticket ${status.replace("_", " ")}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update ticket");
        } finally {
            setChangingStatusId(null);
        }
    }

    const openCount = tickets?.filter((t) => ["open", "in_progress"].includes(t.status)).length ?? 0;

    return (
        <>
            <Card>
                <CardHeader className="pb-3 border-b">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />
                            Service & Maintenance
                            {openCount > 0 && (
                                <Badge className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30">
                                    {openCount} open
                                </Badge>
                            )}
                        </CardTitle>
                        {isUnlocked && canEdit && installation && (
                            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCreateOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />New Ticket
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">
                            Service tickets are available once installation is complete.
                        </p>
                    ) : ticketsQuery.isError ? (
                        <InlineQueryError
                            message="Couldn't load service tickets."
                            onRetry={() => void ticketsQuery.refetch()}
                        />
                    ) : tickets === undefined ? (
                        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : tickets.length === 0 ? (
                        <Empty className="py-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <ShieldCheck className="size-6" />
                                </EmptyMedia>
                                <EmptyTitle>No Service Tickets</EmptyTitle>
                                <EmptyDescription>System is healthy.</EmptyDescription>
                            </EmptyHeader>
                            {canEdit && installation && (
                                <Button size="sm" variant="outline" className="text-xs h-8" onClick={() => setCreateOpen(true)}>
                                    <Plus className="w-3.5 h-3.5 mr-1" />Create ticket
                                </Button>
                            )}
                        </Empty>
                    ) : (
                        tickets.map((ticket, idx) => {
                            const expanded = expandedIds.has(ticket._id);
                            return (
                                // A hairline-separated row, not a bordered card per
                                // ticket — matches the Quotes/Ocular list idiom.
                                <div
                                    key={ticket._id}
                                    className={cn("-mx-4 px-4", idx > 0 && "border-t border-border")}
                                >
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        aria-expanded={expanded}
                                        className="-mx-4 flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-muted/40 transition-colors"
                                        onClick={() => toggleExpand(ticket._id)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                toggleExpand(ticket._id);
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {ticket.priority === "high" && (
                                                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                            )}
                                            <span className="text-sm font-medium truncate">{ticket.title}</span>
                                            {ticket.warrantyRelated && (
                                                <Badge className="bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30 shrink-0">
                                                    Warranty
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Badge className={STATUS_BADGE[ticket.status]}>
                                                {STATUS_LABEL[ticket.status]}
                                            </Badge>
                                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                        </div>
                                    </div>

                                    {/* No boxed/tinted panel — the row's own
                                        border-t above already separates it from
                                        the next ticket; this just continues it. */}
                                    {expanded && (
                                        <div className="pb-3.5 space-y-3">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs [&>div]:min-w-0">
                                                <div>
                                                    <span className="text-muted-foreground">Priority: </span>
                                                    <Badge className={PRIORITY_BADGE[ticket.priority]}>{ticket.priority}</Badge>
                                                </div>
                                                {ticket.assignedToName && (
                                                    <div><span className="text-muted-foreground">Assigned: </span><span>{ticket.assignedToName}</span></div>
                                                )}
                                                {ticket.scheduledVisitAt && (
                                                    <div className="col-span-2">
                                                        <span className="text-muted-foreground">Scheduled visit: </span>
                                                        <span>{new Date(ticket.scheduledVisitAt).toLocaleString(undefined, {
                                                            month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                                                        })}</span>
                                                    </div>
                                                )}
                                                {ticket.resolvedAt && (
                                                    <div><span className="text-muted-foreground">Resolved: </span><span>{new Date(ticket.resolvedAt).toLocaleDateString()}</span></div>
                                                )}
                                                <div className="col-span-2">
                                                    <span className="text-muted-foreground">Description: </span>
                                                    <span className="whitespace-pre-wrap">{ticket.description}</span>
                                                </div>
                                            </div>

                                            {canEdit && (
                                                <div className="flex flex-wrap gap-1.5">
                                                    {ticket.status === "open" && (
                                                        <Button size="sm" variant="outline" className="h-8 text-xs"
                                                            disabled={changingStatusId === ticket._id}
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "in_progress")}>
                                                            Start Work
                                                        </Button>
                                                    )}
                                                    {ticket.status === "in_progress" && (
                                                        <Button size="sm" variant="outline" className="h-8 text-xs text-emerald-600 dark:text-emerald-400 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                                            disabled={changingStatusId === ticket._id}
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "resolved")}>
                                                            Mark Resolved
                                                        </Button>
                                                    )}
                                                    {ticket.status === "resolved" && (
                                                        <Button size="sm" variant="ghost" className="h-8 text-xs"
                                                            disabled={changingStatusId === ticket._id}
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "closed")}>
                                                            Close Ticket
                                                        </Button>
                                                    )}
                                                    {["resolved", "closed"].includes(ticket.status) && (
                                                        <Button size="sm" variant="ghost" className="h-8 text-xs"
                                                            disabled={changingStatusId === ticket._id}
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "open")}>
                                                            Reopen
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            {installation && (
                <CreateTicketDialog
                    open={createOpen}
                    onClose={() => setCreateOpen(false)}
                    leadId={leadId}
                    installationId={installation._id as Id<"installations">}
                />
            )}
        </>
    );
}
