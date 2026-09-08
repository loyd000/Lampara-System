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
    Wrench, Plus, ChevronDown, ChevronUp, ShieldCheck, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import CreateTicketDialog from "./CreateTicketDialog.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const PRIORITY_BADGE: Record<string, string> = {
    low: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    high: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
};

const STATUS_BADGE: Record<string, string> = {
    open: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    in_progress: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    resolved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    closed: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
    open: "Open", in_progress: "In Progress", resolved: "Resolved", closed: "Closed",
};

export default function ServiceTicketsSection({ leadId, stage, canEdit }: Props) {
    const { data: installation } = useInstallationForLead(leadId);
    const { data: tickets } = useTicketsForLead(leadId);
    const { mutateAsync: updateStatus } = useUpdateTicketStatus();
    const [createOpen, setCreateOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
        try {
            await updateStatus({ ticketId, status });
            toast.success(`Ticket ${status.replace("_", " ")}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update ticket");
        }
    }

    const openCount = tickets?.filter((t) => ["open", "in_progress"].includes(t.status)).length ?? 0;

    return (
        <>
            <Card className={cn(!isUnlocked && "opacity-60")}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-muted-foreground" />
                            Service & Maintenance
                            {openCount > 0 && (
                                <Badge className="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300 text-[10px]">
                                    {openCount} open
                                </Badge>
                            )}
                        </CardTitle>
                        {isUnlocked && canEdit && installation && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />New Ticket
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">
                            Service tickets are available once installation is complete.
                        </p>
                    ) : tickets === undefined ? (
                        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                    ) : tickets.length === 0 ? (
                        <div className="text-center py-4">
                            <ShieldCheck className="w-6 h-6 text-emerald-500/50 mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">No service tickets — system is healthy</p>
                            {canEdit && installation && (
                                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setCreateOpen(true)}>
                                    <Plus className="w-3 h-3 mr-1" />Create ticket
                                </Button>
                            )}
                        </div>
                    ) : (
                        tickets.map((ticket) => {
                            const expanded = expandedIds.has(ticket._id);
                            return (
                                <div key={ticket._id} className="rounded-lg border overflow-hidden">
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                        onClick={() => toggleExpand(ticket._id)}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {ticket.priority === "high" && (
                                                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                                            )}
                                            <span className="text-sm font-medium truncate">{ticket.title}</span>
                                            {ticket.warrantyRelated && (
                                                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 text-[10px] shrink-0">
                                                    Warranty
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <Badge className={cn(STATUS_BADGE[ticket.status], "text-[10px]")}>
                                                {STATUS_LABEL[ticket.status]}
                                            </Badge>
                                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                        </div>
                                    </div>

                                    {expanded && (
                                        <div className="px-3 pb-3 border-t bg-muted/10 space-y-3">
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-3">
                                                <div>
                                                    <span className="text-muted-foreground">Priority: </span>
                                                    <Badge className={cn(PRIORITY_BADGE[ticket.priority], "text-[10px]")}>{ticket.priority}</Badge>
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
                                                        <Button size="sm" variant="outline" className="h-7 text-xs"
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "in_progress")}>
                                                            Start Work
                                                        </Button>
                                                    )}
                                                    {ticket.status === "in_progress" && (
                                                        <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800"
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "resolved")}>
                                                            Mark Resolved
                                                        </Button>
                                                    )}
                                                    {ticket.status === "resolved" && (
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                            onClick={() => handleStatusChange(ticket._id as Id<"serviceTickets">, "closed")}>
                                                            Close Ticket
                                                        </Button>
                                                    )}
                                                    {["resolved", "closed"].includes(ticket.status) && (
                                                        <Button size="sm" variant="ghost" className="h-7 text-xs"
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
