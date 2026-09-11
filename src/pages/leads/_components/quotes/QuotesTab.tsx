import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
    FileBadge2,
    FileText,
    Lock,
    Plus,
    Trash2,
} from "lucide-react";
import { toast } from "sonner";

import {
    useContractForLead,
    useCreateQuote,
    useDeleteQuote,
    useQuotesForLead,
} from "@/lib/supabase/hooks.ts";
import type { Id, Lead, Property } from "@/lib/supabase/types.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
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

    const [searchParams, setSearchParams] = useSearchParams();
    const [contractQuoteId, setContractQuoteId] = useState<Id<"quotes"> | null>(null);
    const [quoteToDelete, setQuoteToDelete] = useState<string | null>(null);

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

    async function handleDeleteSingle(quoteId: string) {
        try {
            await deleteQuote({ quoteId: quoteId as Id<"quotes"> });
            toast.success("Quote deleted");
            setQuoteToDelete(null);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete quote");
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
                        quotes.map((q, idx) => {
                            const isApproved = q.status === "approved";
                            return (
                                // Rows on one panel, separated by a hairline —
                                // not a bordered card inside a bordered card.
                                <div
                                    key={q._id}
                                    onClick={() => openQuote(q._id)}
                                    className={cn(
                                        "group -mx-4 px-4 py-3.5 transition-colors cursor-pointer",
                                        "hover:bg-muted/40",
                                        // Desktop has the width for one line: details
                                        // left, actions right. On phones they stack.
                                        "md:flex md:items-center md:justify-between md:gap-4",
                                        idx > 0 && "border-t border-border",
                                    )}
                                >
                                    <div className="min-w-0 space-y-1 md:flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {/* Version reads as part of the name, as it
                                                does in the builder. */}
                                            <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                                {q.quotationNo || "Quotation"}
                                                <span className="ml-1.5 font-medium text-muted-foreground">
                                                    v{q.version}
                                                </span>
                                            </span>
                                            {isApproved ? (
                                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 font-semibold">
                                                    <Lock className="w-2.5 h-2.5" />
                                                    Approved
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 font-semibold">
                                                    In Progress
                                                </Badge>
                                            )}
                                        </div>

                                        {/* Price and preparer only. The item count and
                                            the line-item summary are both a tap away in
                                            the quote itself. */}
                                        <p className="font-bold font-mono text-foreground text-sm">
                                            {formatPhp(q.totalPhp)}
                                        </p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            Prepared by {q.preparerName || q.createdByName}
                                        </p>
                                    </div>

                                    {/* One row of actions: the labelled ones together on
                                        the left, delete alone on the right. `min-w-0`
                                        plus `shrink-0` on the trash is what stops the
                                        labelled buttons squeezing it off the edge when
                                        both are present. */}
                                    <div
                                        className="flex items-center gap-2 mt-3 min-w-0 md:mt-0 md:shrink-0"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <DownloadQuotePdfButton
                                            quote={q}
                                            lead={lead}
                                            property={property}
                                            size="sm"
                                            variant="outline"
                                            className="h-8 text-xs"
                                        />

                                        {isApproved && canEdit && (
                                            contract ? (
                                                contract.quoteId === q._id ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className={cn(
                                                            "h-8 text-xs font-medium",
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
                                                    <Badge variant="outline" className="text-muted-foreground">
                                                        Contract on v{contract.quoteVersion}
                                                    </Badge>
                                                )
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    className="h-8 text-xs"
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
                                                className="size-8 ml-auto shrink-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                title="Delete quote"
                                                onClick={() => setQuoteToDelete(q._id)}
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
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
