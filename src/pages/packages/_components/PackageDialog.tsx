import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

import { useCreatePackage, useUpdatePackage } from "@/lib/supabase/hooks.ts";
import type { PackageWithItems } from "@/lib/supabase/types.ts";

import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";

type Props = {
    open: boolean;
    onClose: () => void;
    /** When set, the dialog is in "edit" mode. */
    existing?: PackageWithItems;
};

type ItemDraft = {
    key: string;
    name: string;
    description: string;
    qty: number;
    unit: string;
};

function blankItem(): ItemDraft {
    return {
        key: crypto.randomUUID(),
        name: "",
        description: "",
        qty: 1,
        unit: "pc",
    };
}

export default function PackageDialog({ open, onClose, existing }: Props) {
    const { mutateAsync: create, isPending: isCreating } = useCreatePackage();
    const { mutateAsync: update, isPending: isUpdating } = useUpdatePackage();
    const isBusy = isCreating || isUpdating;

    // ── Form state ─────────────────────────────────────────────────────
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [systemSizeKw, setSystemSizeKw] = useState("");
    const [basePricePhp, setBasePricePhp] = useState("");
    const [items, setItems] = useState<ItemDraft[]>([blankItem()]);

    // Reset when dialog opens or when switching between create/edit.
    const [prevDialogState, setPrevDialogState] = useState<{ open: boolean; id?: string }>({
        open,
        id: existing?._id,
    });

    if (prevDialogState.open !== open || prevDialogState.id !== existing?._id) {
        setPrevDialogState({ open, id: existing?._id });
        if (open && existing) {
            setName(existing.name);
            setDescription(existing.description ?? "");
            setSystemSizeKw(existing.systemSizeKw?.toString() ?? "");
            setBasePricePhp(existing.basePricePhp.toString());
            setItems(
                existing.items.length > 0
                    ? existing.items.map((it) => ({
                          key: it._id,
                          name: it.name || "",
                          description: it.description || "",
                          qty: it.qty,
                          unit: it.unit || "pc",
                      }))
                    : [blankItem()],
            );
        } else if (open) {
            setName("");
            setDescription("");
            setSystemSizeKw("");
            setBasePricePhp("");
            setItems([blankItem()]);
        }
    }

    // ── Item helpers ───────────────────────────────────────────────────
    function updateItem(key: string, patch: Partial<ItemDraft>) {
        setItems((prev) => prev.map((it) => (it.key === key ? { ...it, ...patch } : it)));
    }

    function removeItem(key: string) {
        setItems((prev) => {
            const next = prev.filter((it) => it.key !== key);
            return next.length > 0 ? next : [blankItem()];
        });
    }

    function addItem() {
        setItems((prev) => [...prev, blankItem()]);
    }

    // ── Submit ─────────────────────────────────────────────────────────
    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        const trimmedName = name.trim();
        if (!trimmedName) {
            toast.error("Package name is required");
            return;
        }
        const price = Number(basePricePhp);
        if (!Number.isFinite(price) || price < 0) {
            toast.error("Enter a valid base price");
            return;
        }

        // Filter out blank rows the user never filled in.
        const validItems = items.filter((it) => it.name.trim() || it.description.trim());
        for (const it of validItems) {
            const label = it.name.trim() || it.description.trim();
            if (it.qty <= 0) {
                toast.error(`Quantity must be greater than 0 for "${label}"`);
                return;
            }
        }

        const sizeKw = systemSizeKw ? Number(systemSizeKw) : undefined;
        if (systemSizeKw && (!Number.isFinite(sizeKw!) || sizeKw! <= 0)) {
            toast.error("Enter a valid system size or leave it blank");
            return;
        }

        try {
            const payloadItems = validItems.map((it) => ({
                name: it.name.trim() || undefined,
                description: it.description.trim() || it.name.trim(),
                qty: it.qty,
                unit: it.unit.trim() || "pc",
                unitPricePhp: 0,
            }));

            if (existing) {
                await update({
                    packageId: existing._id,
                    name: trimmedName,
                    description: description.trim() || undefined,
                    systemSizeKw: sizeKw,
                    basePricePhp: price,
                    items: payloadItems,
                });
                toast.success("Package updated");
            } else {
                await create({
                    name: trimmedName,
                    description: description.trim() || undefined,
                    systemSizeKw: sizeKw,
                    basePricePhp: price,
                    items: payloadItems,
                });
                toast.success("Package created");
            }
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Something went wrong");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-4xl lg:max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{existing ? "Edit Package" : "New Package"}</DialogTitle>
                    <DialogDescription>
                        {existing
                            ? "Update the package details, turnkey pricing, and included components."
                            : "Define a solar system bundle with its turnkey pricing and component line items."}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* ── Header fields ───────────────────────────────── */}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="pkg-name">
                                Package Name <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="pkg-name"
                                placeholder="e.g. 6kWp Hybrid PV System"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="pkg-size">System Size (kWp)</Label>
                            <Input
                                id="pkg-size"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="e.g. 6"
                                value={systemSizeKw}
                                onChange={(e) => setSystemSizeKw(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="pkg-price">
                                Base Price (₱) <span className="text-destructive">*</span>
                            </Label>
                            <Input
                                id="pkg-price"
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="e.g. 366500"
                                value={basePricePhp}
                                onChange={(e) => setBasePricePhp(e.target.value)}
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="pkg-desc">Description</Label>
                            <Textarea
                                id="pkg-desc"
                                placeholder="Brief description of what this package includes…"
                                className="resize-none min-h-[60px]"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    <Separator />

                    {/* ── Line items ──────────────────────────────────── */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-semibold">Included Items</Label>
                                <p className="text-xs text-muted-foreground">
                                    Components, hardware, and equipment bundled into this package.
                                </p>
                            </div>
                            <span className="text-xs font-medium text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                                {items.filter((it) => it.name.trim() || it.description.trim()).length}{" "}
                                {items.filter((it) => it.name.trim() || it.description.trim()).length === 1
                                    ? "item"
                                    : "items"}
                            </span>
                        </div>

                        {/* Column headers — hidden on mobile */}
                        <div className="hidden sm:grid sm:grid-cols-[1.3fr_2fr_150px_36px] gap-2.5 text-xs font-medium text-muted-foreground px-1">
                            <span>
                                Name <span className="text-destructive">*</span>
                            </span>
                            <span>Description / Specification</span>
                            <span>Quantity</span>
                            <span />
                        </div>

                        <div className="space-y-2">
                            {items.map((item, idx) => (
                                <div
                                    key={item.key}
                                    className="grid grid-cols-1 sm:grid-cols-[1.3fr_2fr_150px_36px] gap-2.5 items-start rounded-lg border border-border/50 p-2.5 bg-muted/20 hover:bg-muted/35 transition-colors"
                                >
                                    <div className="space-y-1 sm:space-y-0">
                                        <span className="text-[11px] font-medium text-muted-foreground sm:hidden">
                                            Name
                                        </span>
                                        <Input
                                            placeholder={`e.g. ${
                                                idx === 0
                                                    ? "Solar Panel"
                                                    : idx === 1
                                                      ? "Inverter"
                                                      : idx === 2
                                                        ? "Battery"
                                                        : "Item Name"
                                            }`}
                                            value={item.name}
                                            onChange={(e) =>
                                                updateItem(item.key, { name: e.target.value })
                                            }
                                            className="text-sm"
                                        />
                                    </div>

                                    <div className="space-y-1 sm:space-y-0">
                                        <span className="text-[11px] font-medium text-muted-foreground sm:hidden">
                                            Description
                                        </span>
                                        <Input
                                            placeholder="e.g. 550W Tier-1 Monocrystalline TOPCon"
                                            value={item.description}
                                            onChange={(e) =>
                                                updateItem(item.key, {
                                                    description: e.target.value,
                                                })
                                            }
                                            className="text-sm"
                                        />
                                    </div>

                                    <div className="space-y-1 sm:space-y-0">
                                        <span className="text-[11px] font-medium text-muted-foreground sm:hidden">
                                            Quantity
                                        </span>
                                        <div className="flex items-center gap-1.5">
                                            <Input
                                                type="number"
                                                step="any"
                                                min="0.01"
                                                placeholder="1"
                                                value={item.qty || ""}
                                                onChange={(e) =>
                                                    updateItem(item.key, {
                                                        qty: Number(e.target.value) || 0,
                                                    })
                                                }
                                                className="text-sm w-20 text-center"
                                            />
                                            <Input
                                                placeholder="pc"
                                                value={item.unit}
                                                onChange={(e) =>
                                                    updateItem(item.key, { unit: e.target.value })
                                                }
                                                className="text-sm w-16 text-center"
                                                list="package-common-units"
                                            />
                                        </div>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="size-9 text-muted-foreground hover:text-destructive shrink-0 mt-0.5"
                                        onClick={() => removeItem(item.key)}
                                        title="Remove item"
                                    >
                                        <Trash2 className="size-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>

                        <datalist id="package-common-units">
                            <option value="pc" />
                            <option value="pcs" />
                            <option value="set" />
                            <option value="lot" />
                            <option value="unit" />
                            <option value="m" />
                            <option value="roll" />
                            <option value="box" />
                        </datalist>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full h-9 border-dashed"
                            onClick={addItem}
                        >
                            <Plus className="size-4 mr-1.5" />
                            Add Line Item
                        </Button>
                    </div>

                    {/* ── Footer ──────────────────────────────────────── */}
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose} disabled={isBusy}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isBusy}>
                            {isBusy
                                ? existing
                                    ? "Saving…"
                                    : "Creating…"
                                : existing
                                  ? "Save Changes"
                                  : "Create Package"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
