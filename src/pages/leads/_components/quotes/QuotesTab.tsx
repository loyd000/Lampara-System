import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    ChevronRight,
    FileBadge2,
    FileText,
    Loader2,
    Lock,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
    useContractForLead,
    useCreateQuote,
    useDeleteQuote,
    useDeleteQuotes,
    useQuotesForLead,
} from "@/lib/supabase/hooks.ts";
import type { Id, Lead, Property } from "@/lib/supabase/types.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import QuoteBuilder from "./QuoteBuilder.tsx";
import DownloadQuotePdfButton from "./DownloadQuotePdfButton.tsx";
import CreateContractDialog from "../CreateContractDialog.tsx";
import { cn } from "@/lib/utils.ts";
import { formatPhp } from "@/lib/money.ts";

export default function QuotesTab({
    lead,
    property,
    canEdit,
}: {
    lead: Lead;
    property?: Property;
    canEdit: boolean;
}) {
    const leadId = lead._id as Id<"leads">;
    const { data: quotes, isLoading } = useQuotesForLead(leadId);
    const { data: contract } = useContractForLead(leadId);
    const { mutateAsync: createQuote, isPending: creating } = useCreateQuote();
    const { mutateAsync: deleteQuote, isPending: deletingSingle } = useDeleteQuote();
    const { mutateAsync: deleteQuotes, isPending: deletingBatch } = useDeleteQuotes();

    const [searchParams, setSearchParams] = useSearchParams();
    const [contractQuoteId, setContractQuoteId] = useState<Id<"quotes"> | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);
    const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);

    function openQuote(id: string | null) {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (id) next.set("quote", id);
                else next.delete("quote");
                return next;
            },
            { replace: true },
        );
    }

    const openId = searchParams.get("quote");
    const activeQuote = openId
        ? (quotes?.find((q) => q._id === openId) ?? null)
        : null;

    async function handleNewQuote() {
        try {
            const quoteId = await createQuote({
                leadId,
            });
            toast.success("New quote draft created");
            openQuote(quoteId);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create quote");
        }
    }

    function toggleSelect(id: string, e?: React.MouseEvent) {
        if (e) e.stopPropagation();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    function toggleSelectAll() {
        if (!quotes) return;
        if (selectedIds.size === quotes.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(quotes.map((q) => q._id)));
        }
    }

    async function handleDeleteSingle(quoteId: string) {
        try {
            await deleteQuote({ quoteId: quoteId as Id<"quotes"> });
            toast.success("Quote deleted");
            setSelectedIds((prev) => {
                const next = new Set(prev);
                next.delete(quoteId);
                return next;
            });
            setQuoteToDelete(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete quote");
        }
    }

    async function handleDeleteBatch() {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds) as Id<"quotes">[];
        try {
            await deleteQuotes({ quoteIds: ids });
            toast.success(`${ids.length} quote${ids.length > 1 ? "s" : ""} deleted`);
            setSelectedIds(new Set());
            setBatchDeleteOpen(false);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete quotes");
        }
    }

    // ── Single Quote Builder View ─────────────────────────────────────────
    if (activeQuote) {
        return (
            <QuoteBuilder
                key={activeQuote._id}
                quote={activeQuote}
                lead={lead}
                property={property}
                onClose={() => openQuote(null)}
                canEdit={canEdit}
            />
        );
    }

    const allSelected = Boolean(
        quotes && quotes.length > 0 && selectedIds.size === quotes.length,
    );
    const someSelected = selectedIds.size > 0 && !allSelected;

    // ── Quotes List View ──────────────────────────────────────────────────
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3 border-b">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                                <FileText className="w-4 h-4 text-primary" />
                                Quotes & Proposals
                            </CardTitle>
                            {quotes && quotes.length > 0 && (
                                <Badge variant="secondary" className="text-xs">
                                    {quotes.length}
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                            {/* Bulk Delete Button */}
                            {selectedIds.size > 0 && canEdit && (
                                <AlertDialog
                                    open={batchDeleteOpen}
                                    onOpenChange={setBatchDeleteOpen}
                                >
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            size="sm"
                                            variant="destructive"
                                            className="h-8 text-xs font-medium"
                                            disabled={deletingBatch}
                                        >
                                            {deletingBatch ? (
                                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                                            ) : (
                                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                            )}
                                            Delete Selected ({selectedIds.size})
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>
                                                Delete {selectedIds.size} quote
                                                {selectedIds.size > 1 ? "s" : ""}?
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This action cannot be undone. The selected quotes and all
                                                their line items will be permanently removed.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleDeleteBatch}
                                                className="bg-destructive hover:bg-destructive/90 text-white"
                                            >
                                                Delete {selectedIds.size} Quotes
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}

                            {canEdit && (
                                <Button
                                    size="sm"
                                    onClick={handleNewQuote}
                                    disabled={creating}
                                    className="h-8 text-xs font-medium"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                    {creating ? "Creating…" : "New Quote"}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Selection Sub-Header */}
                    {quotes && quotes.length > 0 && canEdit && (
                        <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground border-t mt-3">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <Checkbox
                                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                    onCheckedChange={toggleSelectAll}
                                />
                                <span>
                                    {selectedIds.size > 0
                                        ? `${selectedIds.size} of ${quotes.length} selected`
                                        : "Select all"}
                                </span>
                            </label>

                            {selectedIds.size > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setSelectedIds(new Set())}
                                    className="underline hover:text-foreground transition-colors"
                                >
                                    Clear selection
                                </button>
                            )}
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                    {isLoading ? (
                        <div className="space-y-2.5">
                            {[...Array(2)].map((_, i) => (
                                <Skeleton key={i} className="h-24 w-full rounded-lg" />
                            ))}
                        </div>
                    ) : !quotes || quotes.length === 0 ? (
                        <Empty className="py-8">
                            <EmptyHeader>
                                <EmptyMedia variant="icon">
                                    <FileBadge2 className="size-6" />
                                </EmptyMedia>
                                <EmptyTitle>No quotes yet</EmptyTitle>
                                <EmptyDescription>
                                    Create itemised solar proposals with pre-configured packages
                                    or custom component line items.
                                </EmptyDescription>
                            </EmptyHeader>
                            {canEdit && (
                                <Button
                                    size="sm"
                                    onClick={handleNewQuote}
                                    disabled={creating}
                                    className="text-xs h-8 font-medium"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                    Create first quote
                                </Button>
                            )}
                        </Empty>
                    ) : (
                        quotes.map((q) => {
                            const isApproved = q.status === "approved";
                            const isChecked = selectedIds.has(q._id);
                            return (
                                <div
                                    key={q._id}
                                    onClick={() => openQuote(q._id)}
                                    className={cn(
                                        "group p-4 rounded-lg border bg-card hover:border-primary/50 transition-all cursor-pointer shadow-sm",
                                        "flex flex-col sm:flex-row sm:items-start gap-3",
                                        isChecked && "border-primary/60 bg-primary/5",
                                    )}
                                >
                                    <div className="flex items-start gap-3 min-w-0 flex-1">
                                        {/* Multi-Select Checkbox */}
                                        {canEdit && (
                                            <div
                                                className="pt-0.5 shrink-0"
                                                onClick={(e) => toggleSelect(q._id, e)}
                                            >
                                                <Checkbox
                                                    checked={isChecked}
                                                    onCheckedChange={() => toggleSelect(q._id)}
                                                />
                                            </div>
                                        )}

                                        <div className="min-w-0 flex-1 space-y-1.5">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                                    {q.quotationNo || `Quotation v${q.version}`}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] font-semibold"
                                                >
                                                    v{q.version}
                                                </Badge>
                                                {isApproved ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                                        <Lock className="w-2.5 h-2.5" />
                                                        Approved
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] font-semibold">
                                                        In Progress
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                                                <span className="font-bold font-mono text-foreground text-sm">
                                                    {formatPhp(q.totalPhp)}
                                                </span>
                                                <span className="text-muted-foreground/40" aria-hidden>•</span>
                                                <span>
                                                    {q.items?.length ?? 0}{" "}
                                                    {(q.items?.length ?? 0) === 1 ? "item" : "items"}
                                                </span>
                                                <span className="text-muted-foreground/40" aria-hidden>•</span>
                                                <span className="truncate">
                                                    Prepared by {q.preparerName || q.createdByName}
                                                </span>
                                            </div>

                                            {q.items && q.items.length > 0 && (
                                                <p className="text-[11px] text-muted-foreground/70 truncate pt-0.5">
                                                    {q.items.map((it) => it.description).join(" · ")}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Buttons — wraps below the content on mobile,
                                        lines up on the right on wider screens */}
                                    <div
                                        className="flex items-center flex-wrap gap-2 pl-8 sm:pl-0 sm:shrink-0 sm:self-center"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DownloadQuotePdfButton
                                            quote={q}
                                            lead={lead}
                                            property={property}
                                            size="sm"
                                            variant="outline"
                                            className="h-9 sm:h-8 text-xs"
                                        />

                                        {isApproved && canEdit && (
                                            contract ? (
                                                contract.quoteId === q._id ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(
                                                            "h-9 sm:h-8 text-xs font-medium",
                                                            contract.status === "cancelled"
                                                                ? "text-muted-foreground bg-muted/40 hover:bg-muted/70 border-muted"
                                                                : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-800",
                                                        )}
                                                        onClick={() => {
                                                            setSearchParams((prev) => {
                                                                const next = new URLSearchParams(prev);
                                                                next.set("tab", "contracts");
                                                                next.delete("quote");
                                                                return next;
                                                            });
                                                        }}
                                                    >
                                                        <FileBadge2 className="w-3 h-3 mr-1" />
                                                        {contract.status === "cancelled"
                                                            ? "Cancelled Contract"
                                                            : "View Contract"}
                                                    </Button>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        Contract on v{contract.quoteVersion}
                                                    </Badge>
                                                )
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-9 sm:h-8 text-xs"
                                                    onClick={() =>
                                                        setContractQuoteId(q._id as Id<"quotes">)
                                                    }
                                                >
                                                    <FileBadge2 className="w-3 h-3 mr-1" />
                                                    Create Contract
                                                </Button>
                                            )
                                        )}

                                        {canEdit && (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="size-9 sm:size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                title="Delete quote"
                                                onClick={() => setQuoteToDelete(q._id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}

                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-9 sm:size-8 ml-auto sm:ml-0 group-hover:translate-x-0.5 transition-transform"
                                            onClick={() => openQuote(q._id)}
                                            aria-label="Open quote"
                                        >
                                            <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </CardContent>
            </Card>

            {/* Single Quote Delete Confirmation Dialog */}
            {quoteToDelete && (
                <AlertDialog
                    open={Boolean(quoteToDelete)}
                    onOpenChange={(v) => !v && setQuoteToDelete(null)}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete this quote?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This action cannot be undone. The quote and all its line items will be
                                permanently removed.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => handleDeleteSingle(quoteToDelete)}
                                className="bg-destructive hover:bg-destructive/90 text-white"
                                disabled={deletingSingle}
                            >
                                {deletingSingle ? "Deleting…" : "Delete Quote"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            )}

            {/* Contract creation dialog */}
            {contractQuoteId && (
                <CreateContractDialog
                    open={!!contractQuoteId}
                    onClose={() => setContractQuoteId(null)}
                    leadId={leadId}
                    quoteId={contractQuoteId}
                />
            )}
        </div>
    );
}
