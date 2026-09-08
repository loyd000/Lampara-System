import { useState } from "react";
import { useEnrichedLeads, useUpdateStage } from "@/lib/supabase/hooks.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { useNavigate } from "react-router-dom";
import { STAGES, STAGE_LABELS, STAGE_COLORS, type Stage } from "@/lib/constants.ts";
import type { EnrichedLead } from "@/lib/supabase/types.ts";
import { Plus, Users, AlertTriangle } from "lucide-react";
import CreateLeadDialog from "../leads/_components/CreateLeadDialog.tsx";
import { useNow } from "@/hooks/use-now.ts";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

export default function PipelinePage() {
    const { data: page } = useEnrichedLeads();
    const leads = page?.leads;
    const navigate = useNavigate();
    const [createOpen, setCreateOpen] = useState(false);
    const { mutateAsync: updateStage } = useUpdateStage();
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<Stage | null>(null);

    const byStage = STAGES.reduce<Record<Stage, EnrichedLead[]>>((acc, s) => {
        acc[s] = [];
        return acc;
    }, {} as Record<Stage, EnrichedLead[]>);

    (leads ?? []).forEach((l) => {
        if (byStage[l.stage]) byStage[l.stage].push(l);
    });

    async function handleDrop(stage: Stage) {
        if (!dragging || !leads) return;
        const lead = leads.find((l) => l._id === dragging);
        if (!lead || lead.stage === stage) {
            setDragging(null);
            setDragOver(null);
            return;
        }
        try {
            await updateStage({ id: lead._id, stage });
            toast.success(`Moved to ${STAGE_LABELS[stage]}`);
        } catch {
            toast.error("Failed to move lead");
        }
        setDragging(null);
        setDragOver(null);
    }

    const totalActive = leads?.filter(
        (l) => !["active_customer", "installation_complete"].includes(l.stage),
    ).length ?? 0;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
                <div>
                    <h1 className="text-xl font-bold">Pipeline</h1>
                    <p className="text-muted-foreground text-sm mt-0.5">
                        {leads === undefined
                            ? "Loading…"
                            : page?.truncated
                                ? `${totalActive} active · showing the ${leads.length} most recent of ${page.total.toLocaleString()}`
                                : `${totalActive} active · drag cards to move stages`}
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)} size="sm">
                    <Plus className="w-4 h-4 mr-1.5" />New Lead
                </Button>
            </div>

            {/* Kanban board */}
            {leads === undefined ? (
                <div className="flex gap-3 overflow-x-auto p-6">
                    {STAGES.map((s) => (
                        <Skeleton key={s} className="h-96 w-52 flex-shrink-0 rounded-xl" />
                    ))}
                </div>
            ) : (
                <div className="flex gap-3 overflow-x-auto p-6 flex-1 min-h-0 items-start">
                    {STAGES.map((stage) => {
                        const cards = byStage[stage];
                        const isOver = dragOver === stage;
                        return (
                            <div
                                key={stage}
                                className="flex-shrink-0 w-52 flex flex-col"
                                onDragOver={(e) => { e.preventDefault(); setDragOver(stage); }}
                                onDragLeave={() => setDragOver(null)}
                                onDrop={() => handleDrop(stage)}
                            >
                                {/* Column header */}
                                <div className={cn(
                                    "flex items-center justify-between mb-2.5 px-1 py-1 rounded-lg transition-colors",
                                    isOver && "bg-primary/8",
                                )}>
                                    <div className="flex items-center gap-2">
                                        <Badge className={`${STAGE_COLORS[stage]} text-[11px] font-semibold px-2 py-0.5`}>
                                            {STAGE_LABELS[stage]}
                                        </Badge>
                                    </div>
                                    <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                                        {cards.length}
                                    </span>
                                </div>

                                {/* Drop zone */}
                                <div className={cn(
                                    "space-y-2 min-h-[6rem] rounded-xl transition-all p-1",
                                    isOver && "bg-primary/5 ring-2 ring-primary/20 ring-dashed",
                                )}>
                                    {cards.map((lead) => (
                                        <PipelineCard
                                            key={lead._id}
                                            lead={lead}
                                            onDragStart={() => setDragging(lead._id)}
                                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
                                            onClick={() => navigate(`/leads/${lead._id}`)}
                                            isDragging={dragging === lead._id}
                                        />
                                    ))}
                                    {cards.length === 0 && !isOver && (
                                        <div className="border-2 border-dashed border-border rounded-xl py-8 flex flex-col items-center justify-center gap-1">
                                            <Users className="w-4 h-4 text-muted-foreground/30" />
                                            <span className="text-[11px] text-muted-foreground/40">Drop here</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <CreateLeadDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </div>
    );
}

function PipelineCard({
    lead,
    onDragStart,
    onDragEnd,
    onClick,
    isDragging,
}: {
    lead: EnrichedLead;
    onDragStart: () => void;
    onDragEnd: () => void;
    onClick: () => void;
    isDragging: boolean;
}) {
    const now = useNow();
    const daysSinceActivity = Math.floor(
        (now - new Date(lead.lastActivityAt).getTime()) / 86400000,
    );
    const isStale = daysSinceActivity >= 7;

    return (
        <div
            draggable
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onClick}
            className={cn(
                "bg-card border border-border rounded-xl p-3 cursor-grab active:cursor-grabbing",
                "hover:shadow-md hover:border-primary/30 transition-all select-none",
                isDragging && "opacity-40 scale-95",
                isStale && "border-amber-300/60 dark:border-amber-700/40",
            )}
        >
            {/* Name + stale indicator */}
            <div className="flex items-start justify-between gap-1">
                <p className="font-semibold text-sm text-card-foreground leading-tight">
                    {lead.firstName} {lead.lastName}
                </p>
                {isStale && (
                    <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
            </div>

            {/* Phone */}
            <p className="text-xs text-muted-foreground mt-1">{lead.phone}</p>

            {/* Property */}
            {lead.property && (
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {lead.property.city}, {lead.property.state}
                </p>
            )}

            {/* Footer row */}
            <div className="flex items-center justify-between mt-2">
                {lead.assignedRepName ? (
                    <div className="flex items-center gap-1">
                        <div className="w-4 h-4 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary">
                            {lead.assignedRepName.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                            {lead.assignedRepName.split(" ")[0]}
                        </span>
                    </div>
                ) : (
                    <span className="text-[10px] text-muted-foreground/50">Unassigned</span>
                )}
                <span className={cn(
                    "text-[10px] font-medium",
                    isStale ? "text-amber-500" : "text-muted-foreground",
                )}>
                    {daysSinceActivity === 0 ? "Today" : daysSinceActivity === 1 ? "1d" : `${daysSinceActivity}d`}
                </span>
            </div>
        </div>
    );
}
