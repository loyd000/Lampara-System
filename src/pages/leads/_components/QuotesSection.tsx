import { useState } from "react";
import {
    useDeleteQuote,
    useQuotesForLead,
    useReviseQuote,
    useUpdateQuoteStatus,
} from "@/lib/supabase/hooks.ts";
import type { Id, QuoteStatus } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { FileText, Plus, Send, RefreshCw, Trash2, CheckCircle2, ChevronDown, ChevronUp, FileBadge2 } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import CreateQuoteDialog from "./CreateQuoteDialog.tsx";
import CreateContractDialog from "./CreateContractDialog.tsx";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    draft: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    accepted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    rejected: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300",
    superseded: "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
};

const FINANCING_LABELS: Record<string, string> = {
    cash: "Cash", loan: "Loan", lease: "Lease", ppa: "PPA",
};

export default function QuotesSection({ leadId, stage, canEdit }: Props) {
    const { data: quotes } = useQuotesForLead(leadId);
    const { mutateAsync: updateStatus } = useUpdateQuoteStatus();
    const { mutateAsync: revise } = useReviseQuote();
    const { mutateAsync: deleteQuote } = useDeleteQuote();
    const [createOpen, setCreateOpen] = useState(false);
    const [contractOpen, setContractOpen] = useState<Id<"quotes"> | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const activeQuotes = quotes?.filter((q) => q.status !== "superseded") ?? [];
    const supersededQuotes = quotes?.filter((q) => q.status === "superseded") ?? [];
    const [showHistory, setShowHistory] = useState(false);

    function toggleExpand(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleStatus(quoteId: Id<"quotes">, status: QuoteStatus) {
        try {
            await updateStatus({ quoteId, status });
            toast.success(`Quote marked ${status}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update quote");
        }
    }

    async function handleRevise(quoteId: Id<"quotes">) {
        try {
            await revise({ quoteId });
            toast.success("New revision created");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create revision");
        }
    }

    async function handleDelete(quoteId: Id<"quotes">) {
        try {
            await deleteQuote({ quoteId });
            toast.success("Draft deleted");
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to delete";
            toast.error(msg);
        }
    }

    const isUnlocked = !["lead", "survey_scheduled"].includes(stage);

    return (
        <>
            <Card className={cn(!isUnlocked && "opacity-60")}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />Quotes
                        </CardTitle>
                        {isUnlocked && canEdit && (
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCreateOpen(true)}>
                                <Plus className="w-3.5 h-3.5 mr-1" />New Quote
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    {!isUnlocked ? (
                        <p className="text-xs text-muted-foreground">Quotes are created after a site survey is completed.</p>
                    ) : quotes === undefined ? (
                        <div className="space-y-2">{[...Array(2)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                    ) : activeQuotes.length === 0 ? (
                        <div className="text-center py-4">
                            <FileBadge2 className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                            <p className="text-xs text-muted-foreground">No quotes yet</p>
                            {canEdit && (
                                <Button size="sm" variant="ghost" className="mt-2 text-xs h-7" onClick={() => setCreateOpen(true)}>
                                    <Plus className="w-3 h-3 mr-1" />Create first quote
                                </Button>
                            )}
                        </div>
                    ) : (
                        <>
                            {activeQuotes.map((quote) => {
                                const expanded = expandedIds.has(quote._id);
                                return (
                                    <div key={quote._id} className="rounded-lg border overflow-hidden">
                                        {/* Quote header */}
                                        <div
                                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                                            onClick={() => toggleExpand(quote._id)}
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <Badge className={cn(STATUS_BADGE[quote.status], "text-[10px] shrink-0")}>
                                                    {quote.status}
                                                </Badge>
                                                <span className="text-sm font-semibold">
                                                    ${quote.totalPriceUsd.toLocaleString()}
                                                </span>
                                                <span className="text-xs text-muted-foreground">v{quote.version}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs text-muted-foreground">{quote.systemSizeKw} kW</span>
                                                {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                                            </div>
                                        </div>

                                        {/* Expanded detail */}
                                        {expanded && (
                                            <div className="px-3 pb-3 space-y-3 border-t bg-muted/10">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs pt-3">
                                                    <div><span className="text-muted-foreground">Panels: </span><span className="font-medium">{quote.panelCount}× {quote.panelModel}</span></div>
                                                    <div><span className="text-muted-foreground">Inverter: </span><span className="font-medium">{quote.inverterType}</span></div>
                                                    <div><span className="text-muted-foreground">Financing: </span><span className="font-medium">{FINANCING_LABELS[quote.financingOption]}</span></div>
                                                    {quote.validUntil && (
                                                        <div><span className="text-muted-foreground">Valid until: </span><span className="font-medium">{new Date(quote.validUntil).toLocaleDateString()}</span></div>
                                                    )}
                                                    {quote.notes && (
                                                        <div className="col-span-2"><span className="text-muted-foreground">Notes: </span><span>{quote.notes}</span></div>
                                                    )}
                                                    <div className="col-span-2 text-muted-foreground/60">
                                                        Created by {quote.createdByName} {quote.sentAt && `· Sent ${new Date(quote.sentAt).toLocaleDateString()}`}
                                                    </div>
                                                </div>
                                                {canEdit && (
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {quote.status === "draft" && (
                                                            <>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                                                    onClick={() => handleStatus(quote._id as Id<"quotes">, "sent")}>
                                                                    <Send className="w-3 h-3 mr-1" />Mark Sent
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                                                                    onClick={() => handleDelete(quote._id as Id<"quotes">)}>
                                                                    <Trash2 className="w-3 h-3 mr-1" />Delete
                                                                </Button>
                                                            </>
                                                        )}
                                                        {quote.status === "sent" && (
                                                            <>
                                                                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                                                    onClick={() => handleStatus(quote._id as Id<"quotes">, "accepted")}>
                                                                    <CheckCircle2 className="w-3 h-3 mr-1" />Accept
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-500 hover:text-red-600"
                                                                    onClick={() => handleStatus(quote._id as Id<"quotes">, "rejected")}>
                                                                    Reject
                                                                </Button>
                                                                <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                                    onClick={() => handleRevise(quote._id as Id<"quotes">)}>
                                                                    <RefreshCw className="w-3 h-3 mr-1" />Revise
                                                                </Button>
                                                            </>
                                                        )}
                                                        {quote.status === "accepted" && (
                                                            <Button size="sm" className="h-7 text-xs"
                                                                onClick={() => setContractOpen(quote._id as Id<"quotes">)}>
                                                                <FileBadge2 className="w-3 h-3 mr-1" />Create Contract
                                                            </Button>
                                                        )}
                                                        {quote.status === "rejected" && (
                                                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                                                                onClick={() => handleRevise(quote._id as Id<"quotes">)}>
                                                                <RefreshCw className="w-3 h-3 mr-1" />Revise & Resubmit
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Version history */}
                            {supersededQuotes.length > 0 && (
                                <div>
                                    <button
                                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                                        onClick={() => setShowHistory((v) => !v)}
                                    >
                                        {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                        {supersededQuotes.length} earlier version{supersededQuotes.length !== 1 ? "s" : ""}
                                    </button>
                                    {showHistory && (
                                        <div className="mt-2 space-y-1.5">
                                            {supersededQuotes.map((q) => (
                                                <div key={q._id} className="flex items-center justify-between text-xs px-3 py-2 rounded-md bg-muted/40 text-muted-foreground">
                                                    <span>v{q.version} — ${q.totalPriceUsd.toLocaleString()} · {q.systemSizeKw} kW</span>
                                                    <Badge className={cn(STATUS_BADGE[q.status], "text-[10px]")}>superseded</Badge>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <CreateQuoteDialog
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                leadId={leadId}
            />
            {contractOpen && (
                <CreateContractDialog
                    open={!!contractOpen}
                    onClose={() => setContractOpen(null)}
                    leadId={leadId}
                    quoteId={contractOpen}
                />
            )}
        </>
    );
}
