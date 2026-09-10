import { useEffect, useMemo, useState } from "react";
import {
    ArrowLeft,
    CheckCircle2,
    Copy,
    Lock,
    Plus,
    RotateCcw,
    Save,
    Trash2,
    Unlock,
} from "lucide-react";
import { toast } from "sonner";

import {
    useApproveQuote,
    useCurrentUser,
    useDeleteQuote,
    useReopenQuote,
    useReviseQuote,
    useSaveQuote,
    useUsers,
} from "@/lib/supabase/hooks.ts";
import type { QuoteItemInput } from "@/lib/supabase/queries/quotes.ts";
import type {
    Id,
    Lead,
    Property,
    QuoteWithItems,
} from "@/lib/supabase/types.ts";
import { cn } from "@/lib/utils.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select.tsx";
import ItemPickerModal from "./ItemPickerModal.tsx";
import { formatPhp, lineTotalPhp, sumLineTotalsPhp } from "@/lib/money.ts";
import UnsavedChangesBar from "@/components/unsaved-changes-bar.tsx";
import DownloadQuotePdfButton from "./DownloadQuotePdfButton.tsx";

/**
 * Line-item fields read as text and edit in place — no border, no fill, no
 * shadow. Seven bordered inputs across one table row is what made this
 * unusable on a phone; the focus ring is the only chrome, and only while
 * focused.
 */
const CELL_INPUT =
    "h-8 border-0 bg-transparent dark:bg-transparent shadow-none px-1 " +
    "focus-visible:ring-1 focus-visible:bg-muted/40";

type EditableItem = {
    id: string; // client temporary ID or existing DB id
    description: string;
    qty: number;
    unit: string;
    unitPricePhp: number;
    sourcePackageId?: string;
    sortOrder: number;
};

export default function QuoteBuilder({
    quote,
    lead,
    property,
    onClose,
    canEdit,
}: {
    quote: QuoteWithItems;
    lead: Lead;
    property?: Property;
    onClose: () => void;
    canEdit: boolean;
}) {
    const { data: currentUser } = useCurrentUser();
    const { data: users } = useUsers();

    const { mutateAsync: saveQuote, isPending: saving } = useSaveQuote();
    const { mutateAsync: approveQuote, isPending: approving } = useApproveQuote();
    const { mutateAsync: reopenQuote, isPending: reopening } = useReopenQuote();
    const { mutateAsync: reviseQuote, isPending: revising } = useReviseQuote();
    const { mutateAsync: deleteQuote, isPending: deleting } = useDeleteQuote();

    const isApproved = quote.status === "approved";
    const editable = !isApproved && canEdit;

    // ── Form State ────────────────────────────────────────────────────────
    const initialItems = useMemo<EditableItem[]>(() => {
        return (quote.items || []).map((it, idx) => ({
            id: it._id,
            description: it.description,
            qty: it.qty,
            unit: it.unit,
            unitPricePhp: it.unitPricePhp,
            sourcePackageId: it.sourcePackageId,
            sortOrder: it.sortOrder ?? idx,
        }));
    }, [quote.items]);

    const [items, setItems] = useState<EditableItem[]>(initialItems);
    const [notes, setNotes] = useState(quote.notes || "");
    const [validUntil, setValidUntil] = useState(quote.validUntil || "");
    const [preparedById, setPreparedById] = useState(
        quote.preparedById || quote.createdBy || "",
    );
    const [itemPickerOpen, setItemPickerOpen] = useState(false);
    const [reopenReason, setReopenReason] = useState("");



    // ── Dirty State Tracking ──────────────────────────────────────────────
    const isDirty = useMemo(() => {
        if (isApproved) return false;
        if ((quote.notes || "") !== notes) return true;
        if ((quote.validUntil || "") !== validUntil) return true;
        if ((quote.preparedById || quote.createdBy || "") !== preparedById) return true;
        if (items.length !== initialItems.length) return true;

        for (let i = 0; i < items.length; i++) {
            const cur = items[i];
            const orig = initialItems[i];
            if (!orig) return true;
            if (
                cur.description !== orig.description ||
                cur.qty !== orig.qty ||
                cur.unit !== orig.unit ||
                cur.unitPricePhp !== orig.unitPricePhp
            ) {
                return true;
            }
        }
        return false;
    }, [isApproved, quote, notes, validUntil, preparedById, items, initialItems]);

    // Keyboard shortcut: Cmd+S / Ctrl+S to save
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if ((e.metaKey || e.ctrlKey) && e.key === "s") {
                e.preventDefault();
                if (isDirty && editable) {
                    handleSave();
                }
            }
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    });

    // Live grand total, rounded per line exactly as the write path and the
    // database do — otherwise the figure on screen can disagree with the one
    // that gets stored, and the customer reads the screen.
    const grandTotal = useMemo(() => sumLineTotalsPhp(items), [items]);

    // ── Handlers ──────────────────────────────────────────────────────────
    function handleItemChange(
        id: string,
        field: keyof EditableItem,
        value: string | number,
    ) {
        setItems((prev) =>
            prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)),
        );
    }

    function handleDeleteItem(id: string) {
        setItems((prev) => prev.filter((it) => it.id !== id));
    }

    function handleAddPickedItems(newItems: QuoteItemInput[]) {
        const added: EditableItem[] = newItems.map((it, idx) => ({
            id: `temp-${Date.now()}-${idx}`,
            description: it.description,
            qty: it.qty,
            unit: it.unit,
            unitPricePhp: it.unitPricePhp,
            sourcePackageId: it.sourcePackageId,
            sortOrder: items.length + idx,
        }));
        setItems((prev) => [...prev, ...added]);
    }

    function handleDiscard() {
        setItems(initialItems);
        setNotes(quote.notes || "");
        setValidUntil(quote.validUntil || "");
        setPreparedById(quote.preparedById || quote.createdBy || "");
        toast.info("Changes discarded");
    }

    async function handleSave() {
        if (!editable) return;
        try {
            await saveQuote({
                quoteId: quote._id,
                notes: notes.trim() || null,
                validUntil: validUntil || null,
                preparedById: preparedById || null,
                items: items.map((it, idx) => ({
                    description: it.description,
                    qty: it.qty,
                    unit: it.unit,
                    unitPricePhp: it.unitPricePhp,
                    sourcePackageId: it.sourcePackageId,
                    sortOrder: idx,
                })),
            });
            toast.success("Quote saved");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save quote");
        }
    }

    async function handleApprove() {
        try {
            // If dirty, save first
            if (isDirty) {
                await saveQuote({
                    quoteId: quote._id,
                    notes: notes.trim() || null,
                    validUntil: validUntil || null,
                    preparedById: preparedById || null,
                    items: items.map((it, idx) => ({
                        description: it.description,
                        qty: it.qty,
                        unit: it.unit,
                        unitPricePhp: it.unitPricePhp,
                        sourcePackageId: it.sourcePackageId,
                        sortOrder: idx,
                    })),
                });
            }
            await approveQuote({ quoteId: quote._id });
            toast.success("Quote approved and locked");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to approve quote");
        }
    }

    async function handleReopen() {
        try {
            await reopenQuote({
                quoteId: quote._id,
                reason: reopenReason.trim() || undefined,
            });
            setReopenReason("");
            toast.success("Quote unlocked for editing");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to reopen quote");
        }
    }

    async function handleRevise() {
        try {
            await reviseQuote({ quoteId: quote._id });
            toast.success("Created new quote revision");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to revise quote");
        }
    }

    async function handleDelete() {
        try {
            await deleteQuote({ quoteId: quote._id });
            toast.success("Quote deleted");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete quote");
        }
    }

    const customerAddress = property
        ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`
        : null;

    // The bottom padding clears the fixed save bar, which would otherwise
    // cover the last rows of the table on a phone.
    return (
        <div className="space-y-6 pb-28 md:pb-20">
            {/* ── Top Bar ─────────────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
                {/* Back link takes its own line on a phone — inline, it left the
                    quotation number about 12 characters of width to wrap in. */}
                <div className="flex flex-col items-start gap-2 min-w-0 sm:flex-row sm:items-center sm:gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                        onClick={onClose}
                    >
                        <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                        All quotes
                    </Button>

                    <div className="hidden sm:block h-4 w-px bg-border" />

                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            {/* Version reads as part of the name rather than its
                                own pill — two badges beside a title that already
                                wraps was one too many. */}
                            <h2 className="text-base font-bold text-foreground">
                                {quote.quotationNo || "Quotation"}
                                <span className="ml-1.5 font-medium text-muted-foreground">
                                    v{quote.version}
                                </span>
                            </h2>
                            {isApproved ? (
                                <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                    <Lock className="w-2.5 h-2.5" />
                                    Approved
                                </Badge>
                            ) : (
                                <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 text-[10px] gap-1 font-semibold">
                                    In Progress
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                {/* Top Action Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                    <DownloadQuotePdfButton
                        quote={quote}
                        lead={lead}
                        property={property}
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                    />

                    {/* Approve Dialog */}
                    {editable && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    className="h-8 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white"
                                    disabled={approving || items.length === 0}
                                >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                    Approve Quote
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Approve & Lock Quote?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Approving locks this proposal&apos;s items and pricing
                                        against accidental changes. This marks the quote ready for
                                        customer delivery and contract generation.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleApprove}
                                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                        Confirm Approval
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {/* Reopen / Unlock Dialog */}
                    {isApproved && canEdit && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-8 text-xs font-medium text-amber-600 border-amber-300 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-950/20"
                                    disabled={reopening}
                                >
                                    <Unlock className="w-3.5 h-3.5 mr-1.5" />
                                    Unlock / Edit
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Unlock Approved Quote?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        Returning this quote to &ldquo;In Progress&rdquo; will allow
                                        line items and prices to be edited. An audit entry will be
                                        recorded in the activity log.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <div className="space-y-2 py-2">
                                    <Label htmlFor="reopen-reason" className="text-xs">
                                        Reason for unlocking (optional):
                                    </Label>
                                    <Input
                                        id="reopen-reason"
                                        placeholder="e.g. Customer requested upgrade to 10kW package"
                                        value={reopenReason}
                                        onChange={(e) => setReopenReason(e.target.value)}
                                        className="text-xs"
                                    />
                                </div>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleReopen}
                                        className="bg-amber-600 hover:bg-amber-700 text-white"
                                    >
                                        Unlock Quote
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}

                    {/* Revise Button */}
                    {isApproved && canEdit && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-medium"
                            onClick={handleRevise}
                            disabled={revising}
                        >
                            <Copy className="w-3.5 h-3.5 mr-1.5" />
                            Revise to v{quote.version + 1}
                        </Button>
                    )}

                    {/* Delete Dialog */}
                    {!isApproved && canEdit && (
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={deleting}
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1" />
                                    Delete
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Delete this quote draft?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This quote and all its line items
                                        will be permanently removed.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                        onClick={handleDelete}
                                        className="bg-destructive hover:bg-destructive/90 text-white"
                                    >
                                        Delete Draft
                                    </AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                </div>
            </div>

            {/* ── Customer Block (Read-only) ──────────────────────── */}
            {/* No Stage here: the lead header sits directly above this with the
                status controls in it, so repeating the stage said the same
                thing twice within one screen. */}
            <Card className="bg-muted/20 border-muted">
                <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="min-w-0">
                        <span className="text-muted-foreground block mb-0.5 font-medium">
                            Customer
                        </span>
                        <span className="font-semibold text-foreground text-sm">
                            {lead.firstName} {lead.lastName}
                        </span>
                        <div className="text-muted-foreground mt-0.5 break-words">
                            {lead.phone} {lead.email && `· ${lead.email}`}
                        </div>
                    </div>

                    <div className="min-w-0">
                        <span className="text-muted-foreground block mb-0.5 font-medium">
                            Installation Address
                        </span>
                        <span className="text-foreground">
                            {customerAddress || "No site address recorded"}
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* ── Quote Parameters ────────────────────────────────── */}
            {/* `min-w-0` on the cells is load-bearing: grid items default to
                `min-width: auto`, and a native date input's intrinsic width is
                wider than a phone's column — which is what pushed Valid Until
                past the edge of the page. */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="prepared-by" className="text-xs font-medium">
                        Prepared By
                    </Label>
                    {editable ? (
                        <Select
                            value={preparedById}
                            onValueChange={(val) => setPreparedById(val)}
                        >
                            <SelectTrigger id="prepared-by" className="h-8 text-xs">
                                <SelectValue placeholder="Select preparer" />
                            </SelectTrigger>
                            <SelectContent>
                                {(users || []).map((u) => (
                                    <SelectItem key={u._id} value={u._id} className="text-xs">
                                        {u.name || u.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : (
                        <Input
                            id="prepared-by"
                            value={quote.preparerName || "Lampara Sales"}
                            disabled
                            className="h-8 text-xs bg-muted/30"
                        />
                    )}
                </div>

                <div className="space-y-1.5 min-w-0">
                    <Label htmlFor="valid-until" className="text-xs font-medium">
                        Valid Until
                    </Label>
                    <Input
                        id="valid-until"
                        type="date"
                        value={validUntil}
                        onChange={(e) => setValidUntil(e.target.value)}
                        disabled={!editable}
                        className="h-8 w-full min-w-0 text-xs"
                    />
                </div>
            </div>

            {/* Scope remarks are prose — full width, and tall enough to read
                back what you wrote. It was a 32px box that clipped its own
                placeholder mid-sentence. */}
            <div className="space-y-1.5">
                <Label htmlFor="quote-notes" className="text-xs font-medium">
                    Notes / Scope Remarks
                </Label>
                <Textarea
                    id="quote-notes"
                    placeholder="e.g. Inclusive of Meralco Net-Metering application assistance"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!editable}
                    rows={3}
                    className="text-xs resize-y"
                />
            </div>

            {/* ── Itemised Table ──────────────────────────────────── */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        {/* The table below states the count — either as rows to
                            count or as "no line items added yet". */}
                        <h3 className="text-sm font-semibold text-foreground">Line Items</h3>
                    </div>

                    {editable && (
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setItemPickerOpen(true)}
                            className="h-8 text-xs font-medium"
                        >
                            <Plus className="w-3.5 h-3.5 mr-1" />
                            Add Item / Package
                        </Button>
                    )}
                </div>

                <div className="rounded-lg border overflow-hidden bg-card shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                                    <th className="py-2.5 px-3 min-w-[240px]">Description</th>
                                    <th className="py-2.5 px-3 w-24">Qty</th>
                                    <th className="py-2.5 px-3 w-24">Unit</th>
                                    <th className="py-2.5 px-3 w-36 text-right">Unit Price (PHP)</th>
                                    <th className="py-2.5 px-3 w-36 text-right">Total (PHP)</th>
                                    {editable && <th className="py-2.5 px-3 w-12 text-center" />}
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {items.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={editable ? 7 : 6}
                                            className="text-center py-8 text-muted-foreground"
                                        >
                                            No line items added yet.
                                            {editable && (
                                                <div className="mt-2">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-xs h-7"
                                                        onClick={() => setItemPickerOpen(true)}
                                                    >
                                                        <Plus className="w-3.5 h-3.5 mr-1" />
                                                        Add first item or package
                                                    </Button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item, idx) => {
                                        const lineTotal = lineTotalPhp(item.qty, item.unitPricePhp);
                                        return (
                                            <tr
                                                key={item.id}
                                                className={cn(
                                                    "hover:bg-muted/20 transition-colors",
                                                    idx % 2 === 1 && "bg-muted/5",
                                                )}
                                            >
                                                <td className="py-2.5 px-3 text-center text-muted-foreground font-mono text-[11px]">
                                                    {idx + 1}
                                                </td>
                                                <td className="py-2 px-3">
                                                    {editable ? (
                                                        <Textarea
                                                            value={item.description}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    item.id,
                                                                    "description",
                                                                    e.target.value,
                                                                )
                                                            }
                                                            rows={1}
                                                            className={cn(CELL_INPUT, "min-h-[32px] py-1.5 text-xs resize-none")}
                                                        />
                                                    ) : (
                                                        <span className="font-medium text-foreground whitespace-pre-wrap">
                                                            {item.description}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3">
                                                    {editable ? (
                                                        <Input
                                                            type="number"
                                                            inputMode="decimal"
                                                            step="any"
                                                            min="0.01"
                                                            value={item.qty}
                                                            onWheel={(e) => e.currentTarget.blur()}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    item.id,
                                                                    "qty",
                                                                    parseFloat(e.target.value) || 0,
                                                                )
                                                            }
                                                            className={cn(CELL_INPUT, "text-xs")}
                                                        />
                                                    ) : (
                                                        <span className="tabular-nums font-mono">
                                                            {item.qty}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3">
                                                    {editable ? (
                                                        <Input
                                                            value={item.unit}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    item.id,
                                                                    "unit",
                                                                    e.target.value,
                                                                )
                                                            }
                                                            className={cn(CELL_INPUT, "text-xs")}
                                                        />
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            {item.unit}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2 px-3 text-right">
                                                    {editable ? (
                                                        <Input
                                                            type="number"
                                                            inputMode="decimal"
                                                            step="any"
                                                            min="0"
                                                            value={item.unitPricePhp}
                                                            onWheel={(e) => e.currentTarget.blur()}
                                                            onChange={(e) =>
                                                                handleItemChange(
                                                                    item.id,
                                                                    "unitPricePhp",
                                                                    parseFloat(e.target.value) || 0,
                                                                )
                                                            }
                                                            className={cn(CELL_INPUT, "text-xs text-right font-mono tabular-nums")}
                                                        />
                                                    ) : (
                                                        <span className="tabular-nums font-mono">
                                                            {formatPhp(item.unitPricePhp)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="py-2.5 px-3 text-right font-semibold font-mono tabular-nums text-foreground">
                                                    {formatPhp(lineTotal)}
                                                </td>
                                                {editable && (
                                                    <td className="py-2 px-3 text-center">
                                                        <Button
                                                            size="icon"
                                                            variant="ghost"
                                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                                            onClick={() => handleDeleteItem(item.id)}
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Outside the scrolling table on purpose. As a `tfoot` row
                        the grand total scrolled with everything else, which put
                        the one number that matters most off the right edge of a
                        phone. */}
                    <div className="flex items-center justify-between gap-4 border-t-2 border-primary/40 bg-muted/30 px-4 py-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                            Grand Total
                        </span>
                        <span className="text-base font-bold text-foreground font-mono tabular-nums">
                            {formatPhp(grandTotal)}
                        </span>
                    </div>
                </div>
            </div>

            {/* ── Save Bar ────────────────────────────────────────── */}
            {isDirty && editable && (
                <UnsavedChangesBar>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={handleDiscard}
                        disabled={saving}
                    >
                        <RotateCcw className="w-3.5 h-3.5 mr-1" />
                        Discard
                    </Button>
                    <Button
                        size="sm"
                        className="h-8 text-xs font-medium"
                        onClick={handleSave}
                        disabled={saving}
                    >
                        <Save className="w-3.5 h-3.5 mr-1" />
                        {saving ? "Saving…" : "Save Quote"}
                    </Button>
                </UnsavedChangesBar>
            )}

            {/* Item Picker Modal */}
            <ItemPickerModal
                open={itemPickerOpen}
                onClose={() => setItemPickerOpen(false)}
                onAddItems={handleAddPickedItems}
            />
        </div>
    );
}
