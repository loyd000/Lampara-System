import { useState, useRef } from "react";
import { useCurrentUser, useEnrichedLeads, useUpdateStage } from "@/lib/supabase/hooks.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import StageSelect from "@/components/stage-select.tsx";
import { useNavigate } from "react-router-dom";
import {
    STAGES, STAGE_LABELS, STAGE_COLORS, STAGE_GROUPS, STAGE_GROUP_LABELS,
    type Stage, type StageGroup,
} from "@/lib/constants.ts";
import type { EnrichedLead } from "@/lib/supabase/types.ts";
import { Plus, Users, AlertTriangle } from "lucide-react";
import CreateLeadDialog from "../leads/_components/CreateLeadDialog.tsx";
import CancelLeadDialog from "@/components/cancel-lead-dialog.tsx";
import { useNow } from "@/hooks/use-now.ts";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

export default function PipelinePage() {
    const { data: page } = useEnrichedLeads();
    const { data: currentUser } = useCurrentUser();
    const leads = page?.leads;
    const navigate = useNavigate();
    const [createOpen, setCreateOpen] = useState(false);
    const { mutateAsync: updateStage } = useUpdateStage();
    const [dragging, setDragging] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState<Stage | null>(null);
    /** Set when a move lands on `cancelled`, held until the reason is given. */
    const [pendingCancelId, setPendingCancelId] = useState<string | null>(null);

    // Matches the leads_update RLS policy (superadmin/admin only) — without this
    // a field user could drag a card and get nothing but a silent "failed to
    // move lead" from the server rejecting a write the UI never should have
    // offered.
    const canMoveStage = ["superadmin", "admin"].includes(currentUser?.role ?? "");

    const byStage = STAGES.reduce<Record<Stage, EnrichedLead[]>>((acc, s) => {
        acc[s] = [];
        return acc;
    }, {} as Record<Stage, EnrichedLead[]>);

    (leads ?? []).forEach((l) => {
        if (byStage[l.stage]) byStage[l.stage].push(l);
    });

    async function applyMove(leadId: string, stage: Stage, cancelledReason?: string) {
        try {
            await updateStage({ id: leadId, stage, cancelledReason });
            toast.success(
                stage === "cancelled" ? "Lead cancelled" : `Moved to ${STAGE_LABELS[stage]}`,
            );
        } catch {
            toast.error("Failed to move lead");
        }
    }

    /**
     * Every move on this board funnels through here — the drag-and-drop path
     * and the per-card stage picker both — so cancelling asks for its reason
     * either way, the same as it does on the lead detail page.
     */
    async function moveLead(leadId: string, stage: Stage) {
        const lead = leads?.find((l) => l._id === leadId);
        if (!lead || lead.stage === stage) return;
        if (stage === "cancelled") {
            setPendingCancelId(leadId);
            return;
        }
        await applyMove(leadId, stage);
    }

    async function handleDrop(stage: Stage) {
        if (!dragging) {
            setDragOver(null);
            return;
        }
        await moveLead(dragging, stage);
        setDragging(null);
        setDragOver(null);
    }

    const totalActive = leads?.filter(
        (l) => !["active_customer", "installation_complete", "cancelled"].includes(l.stage),
    ).length ?? 0;

    const cancellingLead = pendingCancelId
        ? leads?.find((l) => l._id === pendingCancelId)
        : undefined;
    const cancellingLeadName = cancellingLead
        ? `${cancellingLead.firstName} ${cancellingLead.lastName}`
        : undefined;

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            {/* p-6, no border-b: the board below needs full viewport
                width for its columns, so it can't sit inside the house
                max-w-7xl container like every other page — but the header
                itself can still use the house p-6 rhythm and drop the rule
                no other page header has. */}
            <div className="flex items-center justify-between p-6 shrink-0">
                <div>
                    <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">Pipeline</h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        {leads === undefined
                            ? "Loading…"
                            : page?.truncated
                                ? `${totalActive} active · showing the ${leads.length} most recent of ${page.total.toLocaleString()}`
                                : `${totalActive} active · drag cards to move stages`}
                    </p>
                </div>
                <Button onClick={() => setCreateOpen(true)}>
                    <Plus className="w-4 h-4 mr-1.5" />New Lead
                </Button>
            </div>

            {/* Kanban board: three swim-lanes (New / In Progress / Completed), each
                holding the substatus columns for that group. Grouping only changes
                what the eye clusters; every column still shares one drag surface, so
                a card can move straight from "New Lead" to "Cancelled" in one drop. */}
            {leads === undefined ? (
                // Mirrors the loaded board's own wrapper classes exactly — a
                // skeleton with no group header and no border-l landed at a
                // different x and y than the real columns once data arrived.
                <div className="flex gap-6 overflow-x-auto p-6 flex-1 min-h-0 items-start">
                    {(Object.keys(STAGE_GROUPS) as StageGroup[]).map((group, groupIndex) => (
                        <div
                            key={group}
                            className={cn(
                                "flex flex-col gap-2.5 shrink-0",
                                groupIndex > 0 && "border-l border-border/60 pl-6",
                            )}
                        >
                            <div className="flex items-baseline gap-2 px-1">
                                <Skeleton className="h-3 w-20" />
                            </div>
                            <div className="flex gap-3 items-start">
                                {STAGE_GROUPS[group].map((s) => (
                                    <Skeleton key={s} className="h-96 w-52 shrink-0 rounded-lg" />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="flex gap-6 overflow-x-auto p-6 flex-1 min-h-0 items-start">
                    {(Object.keys(STAGE_GROUPS) as StageGroup[]).map((group, groupIndex) => {
                        const groupStages = STAGE_GROUPS[group];
                        const groupCount = groupStages.reduce((sum, s) => sum + byStage[s].length, 0);
                        return (
                            <div
                                key={group}
                                className={cn(
                                    "flex flex-col gap-2.5 shrink-0",
                                    groupIndex > 0 && "border-l border-border/60 pl-6",
                                )}
                            >
                                <div className="flex items-baseline gap-2 px-1">
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        {STAGE_GROUP_LABELS[group]}
                                    </h2>
                                    <span className="text-[11px] text-muted-foreground/60 tabular-nums">
                                        {groupCount}
                                    </span>
                                </div>
                                <div className="flex gap-3 items-start">
                                    {groupStages.map((stage) => {
                                        const cards = byStage[stage];
                                        const isOver = dragOver === stage;
                                        return (
                                            <div
                                                key={stage}
                                                className="shrink-0 w-52 flex flex-col"
                                                data-stage={stage}
                                                onDragOver={canMoveStage ? (e) => { e.preventDefault(); setDragOver(stage); } : undefined}
                                                onDragLeave={canMoveStage ? () => setDragOver(null) : undefined}
                                                onDrop={canMoveStage ? () => handleDrop(stage) : undefined}
                                            >
                                                {/* Column header */}
                                                <div className={cn(
                                                    "flex items-center justify-between mb-2.5 px-1.5 py-1 rounded-md transition-colors",
                                                    isOver && "bg-secondary",
                                                )}>
                                                    <div className="flex items-center gap-2">
                                                        <Badge className={`${STAGE_COLORS[stage]} font-semibold px-2 py-0.5 rounded-md`}>
                                                            {STAGE_LABELS[stage]}
                                                        </Badge>
                                                    </div>
                                                    <span className="text-xs font-semibold text-muted-foreground bg-muted rounded-md px-1.5 py-0.5">
                                                        {cards.length}
                                                    </span>
                                                </div>

                                                {/* Drop zone */}
                                                <div className={cn(
                                                    "space-y-2 min-h-[6rem] rounded-lg transition-all p-1",
                                                    isOver && "bg-secondary/50 ring-2 ring-foreground/20 ring-dashed",
                                                )}>
                                                    {cards.map((lead) => (
                                                        <PipelineCard
                                                            key={lead._id}
                                                            lead={lead}
                                                            canMoveStage={canMoveStage}
                                                            onDragStart={() => setDragging(lead._id)}
                                                            onDragEnd={() => { setDragging(null); setDragOver(null); }}
                                                            onClick={() => navigate(`/leads/${lead._id}`)}
                                                            onMoveTo={(nextStage) => moveLead(lead._id, nextStage)}
                                                            isDragging={dragging === lead._id}
                                                            onTouchDragOver={canMoveStage ? setDragOver : undefined}
                                                            onTouchDrop={canMoveStage ? (s) => handleDrop(s) : undefined}
                                                        />
                                                    ))}
                                                    {cards.length === 0 && !isOver && (
                                                        <div className="border border-dashed border-border rounded-lg py-8 flex flex-col items-center justify-center gap-1">
                                                            <Users className="w-4 h-4 text-muted-foreground/30" />
                                                            <span className="text-[11px] text-muted-foreground/40">Drop here</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <CreateLeadDialog open={createOpen} onClose={() => setCreateOpen(false)} />

            <CancelLeadDialog
                open={pendingCancelId !== null}
                onOpenChange={(next) => { if (!next) setPendingCancelId(null); }}
                onConfirm={(reason) => {
                    if (pendingCancelId) void applyMove(pendingCancelId, "cancelled", reason);
                    setPendingCancelId(null);
                }}
                leadName={cancellingLeadName}
            />
        </div>
    );
}

function PipelineCard({
    lead,
    canMoveStage,
    onDragStart,
    onDragEnd,
    onClick,
    onMoveTo,
    isDragging,
    onTouchDragOver,
    onTouchDrop,
}: {
    lead: EnrichedLead;
    canMoveStage: boolean;
    onDragStart: () => void;
    onDragEnd: () => void;
    onClick: () => void;
    onMoveTo: (stage: Stage) => void;
    isDragging: boolean;
    onTouchDragOver?: (stage: Stage | null) => void;
    onTouchDrop?: (stage: Stage) => void;
}) {
    const now = useNow();
    const daysSinceActivity = Math.floor(
        (now - new Date(lead.lastActivityAt).getTime()) / 86400000,
    );
    const isStale = daysSinceActivity >= 7;

    // Touch drag state — local so one card's drag doesn't bleed into another.
    const touchDragging = useRef(false);
    const ghostRef = useRef<HTMLDivElement | null>(null);
    const cardRef = useRef<HTMLDivElement | null>(null);

    /**
     * Resolve which pipeline column (if any) is under the current pointer
     * position. We walk up from `elementFromPoint` looking for a `data-stage`
     * attribute that was stamped onto each column div.
     */
    function stageFromPoint(x: number, y: number): Stage | null {
        // Hide the ghost so it doesn't shadow itself in the hit test.
        const ghost = ghostRef.current;
        if (ghost) ghost.style.display = "none";
        const el = document.elementFromPoint(x, y);
        if (ghost) ghost.style.display = "";
        if (!el) return null;
        const col = el.closest("[data-stage]") as HTMLElement | null;
        return (col?.dataset.stage as Stage | undefined) ?? null;
    }

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        if (!canMoveStage) return;
        // Only respond to primary button / first touch.
        if (e.button !== 0 && e.pointerType === "mouse") return;
        // Let mouse drag fall through to the native HTML5 DnD.
        if (e.pointerType === "mouse") return;

        e.preventDefault();
        e.stopPropagation();
        touchDragging.current = true;
        onDragStart();

        // Clone the card as a floating ghost.
        const card = cardRef.current;
        if (!card) return;
        const rect = card.getBoundingClientRect();
        const ghost = card.cloneNode(true) as HTMLDivElement;
        ghost.style.cssText = [
            `position:fixed`,
            `left:${rect.left}px`,
            `top:${rect.top}px`,
            `width:${rect.width}px`,
            `pointer-events:none`,
            `opacity:0.85`,
            `z-index:9999`,
            `transform:scale(1.04)`,
            `transition:transform 0.1s`,
            `border-radius:12px`,
            `box-shadow:0 8px 32px rgba(0,0,0,0.18)`,
        ].join(";");
        document.body.appendChild(ghost);
        ghostRef.current = ghost;

        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        function onMove(me: PointerEvent) {
            if (!touchDragging.current) return;
            const gx = me.clientX - offsetX;
            const gy = me.clientY - offsetY;
            if (ghost) {
                ghost.style.left = `${gx}px`;
                ghost.style.top = `${gy}px`;
            }
            const stage = stageFromPoint(me.clientX, me.clientY);
            onTouchDragOver?.(stage);
        }

        function onUp(ue: PointerEvent) {
            touchDragging.current = false;
            ghost.remove();
            ghostRef.current = null;
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);

            const stage = stageFromPoint(ue.clientX, ue.clientY);
            onTouchDragOver?.(null);
            if (stage) {
                onTouchDrop?.(stage);
            }
            onDragEnd();
        }

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
    }

    return (
        <div
            ref={cardRef}
            draggable={canMoveStage}
            onDragStart={canMoveStage ? onDragStart : undefined}
            onDragEnd={canMoveStage ? onDragEnd : undefined}
            onPointerDown={handlePointerDown}
            onClick={onClick}
            className={cn(
                "bg-card rounded-xl p-3 shadow-2xs transition-all select-none",
                canMoveStage && "cursor-grab active:cursor-grabbing hover:shadow-sm",
                isDragging && "opacity-40 scale-95",
                isStale && "ring-1 ring-amber-300/60 dark:ring-amber-700/40",
            )}
        >
            {/* Name + stale indicator */}
            <div className="flex items-start justify-between gap-1">
                <p className="font-semibold text-sm text-card-foreground leading-tight">
                    {lead.firstName} {lead.lastName}
                </p>
                {isStale && (
                    <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
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

            {/* Tap-to-move — drag works on desktop, but a phone has no drag
                surface, so this is the only way a technician moves a card on
                mobile. Kept visible on every size, not just small screens, since
                it is also just a faster path than a drag on desktop. */}
            {canMoveStage && (
                <div className="mt-2 pt-2 border-t" onClick={(e) => e.stopPropagation()}>
                    <StageSelect value={lead.stage} onChange={onMoveTo} size="sm" />
                </div>
            )}
        </div>
    );
}
