import { useState } from "react";
import { Package as PackageIcon, Plus, Wrench } from "lucide-react";

import { useActivePackages } from "@/lib/supabase/hooks.ts";
import type { QuoteItemInput } from "@/lib/supabase/queries/quotes.ts";
import type { PackageWithItems } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

function formatPhp(amount: number): string {
    return (
        "₱" +
        amount.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}

const COMMON_UNITS = ["pc", "set", "lot", "m", "roll", "pair", "box"];

export default function ItemPickerModal({
    open,
    onClose,
    onAddItems,
}: {
    open: boolean;
    onClose: () => void;
    onAddItems: (items: QuoteItemInput[]) => void;
}) {
    const { data: packages, isLoading } = useActivePackages();
    const [tab, setTab] = useState<"packages" | "custom">("packages");

    // Custom item form state
    const [desc, setDesc] = useState("");
    const [qty, setQty] = useState("1");
    const [unit, setUnit] = useState("pc");
    const [unitPrice, setUnitPrice] = useState("");

    const numQty = Math.max(0.01, parseFloat(qty) || 0);
    const numPrice = Math.max(0, parseFloat(unitPrice) || 0);
    const previewTotal = Math.round(numQty * numPrice * 100) / 100;

    function handleAddPackage(pkg: PackageWithItems) {
        if (!pkg.items || pkg.items.length === 0) {
            // If package has no items, add single line item from package header
            onAddItems([
                {
                    description: pkg.name + (pkg.systemSizeKw ? ` (${pkg.systemSizeKw} kW)` : ""),
                    qty: 1,
                    unit: "set",
                    unitPricePhp: pkg.basePricePhp,
                    sourcePackageId: pkg._id,
                },
            ]);
        } else {
            // Expand all package items.
            // When items don't carry individual prices, the first item carries
            // the package base price so the quote total immediately matches —
            // labelled explicitly, so deleting that line later is a deliberate
            // choice rather than an accidental way to make the whole package's
            // price silently vanish from the quote.
            const hasExistingPrices = pkg.items.some((it) => it.unitPricePhp > 0);
            const newItems: QuoteItemInput[] = pkg.items.map((it, idx) => {
                const baseDescription = it.name
                    ? `${it.name}${it.description ? ` · ${it.description}` : ""}`
                    : it.description;
                const carriesPackagePrice = !hasExistingPrices && idx === 0;
                return {
                    description: carriesPackagePrice
                        ? `${baseDescription} (${pkg.name} package price)`
                        : baseDescription,
                    qty: it.qty,
                    unit: it.unit,
                    unitPricePhp: carriesPackagePrice ? pkg.basePricePhp : hasExistingPrices ? it.unitPricePhp : 0,
                    sourcePackageId: pkg._id,
                };
            });
            onAddItems(newItems);
        }
        onClose();
    }

    function handleAddCustom(e: React.FormEvent) {
        e.preventDefault();
        const trimmed = desc.trim();
        if (!trimmed) return;

        onAddItems([
            {
                description: trimmed,
                qty: numQty,
                unit: unit.trim() || "pc",
                unitPricePhp: numPrice,
            },
        ]);

        // Reset
        setDesc("");
        setQty("1");
        setUnit("pc");
        setUnitPrice("");
        onClose();
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-[620px] max-h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-5 pb-3 border-b">
                    <DialogTitle className="text-base font-semibold">
                        Add Items to Quote
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Select a pre-configured solar package or define custom equipment and materials.
                    </DialogDescription>
                </DialogHeader>

                <Tabs
                    value={tab}
                    onValueChange={(v) => setTab(v as "packages" | "custom")}
                    className="flex-1 flex flex-col overflow-hidden"
                >
                    <div className="px-5 pt-3 bg-muted/20 border-b">
                        <TabsList className="grid grid-cols-2 w-full">
                            <TabsTrigger value="packages" className="text-xs">
                                <PackageIcon className="w-3.5 h-3.5 mr-1.5" />
                                Solar Packages
                            </TabsTrigger>
                            <TabsTrigger value="custom" className="text-xs">
                                <Wrench className="w-3.5 h-3.5 mr-1.5" />
                                Custom Item
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    {/* ── Tab 1: Packages ─────────────────────────── */}
                    <TabsContent
                        value="packages"
                        className="flex-1 overflow-y-auto p-5 m-0 space-y-3"
                    >
                        {isLoading ? (
                            <div className="space-y-2.5">
                                {[...Array(3)].map((_, i) => (
                                    <Skeleton key={i} className="h-24 w-full rounded-lg" />
                                ))}
                            </div>
                        ) : !packages || packages.length === 0 ? (
                            <div className="text-center py-10 text-muted-foreground text-xs">
                                <PackageIcon className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                <p className="font-medium">No active packages found</p>
                                <p className="mt-1">
                                    Configure packages in the Packages menu or add a custom item.
                                </p>
                            </div>
                        ) : (
                            packages.map((pkg) => (
                                <div
                                    key={pkg._id}
                                    className="p-4 rounded-lg border bg-card hover:border-primary/50 transition-colors shadow-sm"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-sm text-foreground">
                                                    {pkg.name}
                                                </h4>
                                                {pkg.systemSizeKw && (
                                                    <span className="rounded bg-primary/10 text-primary text-[10px] font-semibold px-1.5 py-0.5">
                                                        {pkg.systemSizeKw} kW
                                                    </span>
                                                )}
                                            </div>

                                            {pkg.description && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                                    {pkg.description}
                                                </p>
                                            )}

                                            <div className="mt-2.5 flex items-center gap-4 text-xs text-muted-foreground">
                                                <span>
                                                    {pkg.items?.length ?? 0}{" "}
                                                    {(pkg.items?.length ?? 0) === 1 ? "item" : "items"}
                                                </span>
                                                <span className="font-semibold text-foreground">
                                                    {formatPhp(pkg.basePricePhp)}
                                                </span>
                                            </div>

                                            {pkg.items && pkg.items.length > 0 && (
                                                <div className="mt-2 pt-2 border-t text-[11px] text-muted-foreground/80 space-y-0.5">
                                                    {pkg.items.slice(0, 3).map((it) => (
                                                        <div key={it._id} className="truncate">
                                                            • {it.qty} {it.unit} · {it.name ? `${it.name}${it.description ? ` · ${it.description}` : ""}` : it.description}
                                                        </div>
                                                    ))}
                                                    {pkg.items.length > 3 && (
                                                        <div className="text-[10px] text-muted-foreground/60 italic">
                                                            +{pkg.items.length - 3} more items
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <Button
                                            size="sm"
                                            onClick={() => handleAddPackage(pkg)}
                                            className="shrink-0 h-8 text-xs font-medium"
                                        >
                                            <Plus className="w-3.5 h-3.5 mr-1" />
                                            Add Package
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </TabsContent>

                    {/* ── Tab 2: Custom Item ──────────────────────── */}
                    <TabsContent value="custom" className="flex-1 overflow-y-auto p-5 m-0">
                        <form onSubmit={handleAddCustom} className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="custom-desc" className="text-xs font-medium">
                                    Description <span className="text-destructive">*</span>
                                </Label>
                                <Textarea
                                    id="custom-desc"
                                    placeholder="e.g. 10kW On-Grid Inverter, Cable Tray (100x50mm), AC Breaker 63A"
                                    value={desc}
                                    onChange={(e) => setDesc(e.target.value)}
                                    rows={3}
                                    className="text-xs resize-none"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="custom-qty" className="text-xs font-medium">
                                        Quantity
                                    </Label>
                                    <Input
                                        id="custom-qty"
                                        type="number"
                                        inputMode="decimal"
                                        step="any"
                                        min="0.01"
                                        value={qty}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) => setQty(e.target.value)}
                                        className="h-10 text-xs"
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="custom-unit" className="text-xs font-medium">
                                        Unit
                                    </Label>
                                    <Input
                                        id="custom-unit"
                                        value={unit}
                                        onChange={(e) => setUnit(e.target.value)}
                                        placeholder="pc"
                                        className="h-8 text-xs"
                                        required
                                    />
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {COMMON_UNITS.slice(0, 4).map((u) => (
                                            <button
                                                type="button"
                                                key={u}
                                                onClick={() => setUnit(u)}
                                                className="text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                                            >
                                                {u}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="custom-price" className="text-xs font-medium">
                                        Unit Price (PHP)
                                    </Label>
                                    <Input
                                        id="custom-price"
                                        type="number"
                                        inputMode="decimal"
                                        step="any"
                                        min="0"
                                        placeholder="0.00"
                                        value={unitPrice}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) => setUnitPrice(e.target.value)}
                                        className="h-10 text-xs"
                                        required
                                    />
                                </div>
                            </div>

                            {/* Line total summary */}
                            <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Computed Line Total:</span>
                                <span className="text-sm font-bold text-foreground">
                                    {formatPhp(previewTotal)}
                                </span>
                            </div>

                            <div className="pt-2 flex justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={onClose}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={!desc.trim()}
                                    className="h-8 text-xs font-medium"
                                >
                                    <Plus className="w-3.5 h-3.5 mr-1" />
                                    Add to Quote
                                </Button>
                            </div>
                        </form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
