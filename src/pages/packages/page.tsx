import { useState } from "react";
import { toast } from "sonner";
import {
    Archive,
    ChevronDown,
    ChevronRight,
    Package,
    Pencil,
    Plus,
    RotateCcw,
    Zap,
} from "lucide-react";

import {
    usePackages,
    useTogglePackageActive,
} from "@/lib/supabase/hooks.ts";
import type { PackageWithItems } from "@/lib/supabase/types.ts";
import { DESIGN_TYPE_LABELS } from "@/lib/constants.ts";

import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { cn } from "@/lib/utils.ts";
import { formatPhp } from "@/lib/money.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import {
    Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip.tsx";
import PackageDialog from "./_components/PackageDialog.tsx";

// Superadmin-only; the gate is on the route (see App.tsx) so this page's
// queries never fire for anyone else.
export default function PackagesPage() {
    const { data: packages, isError, refetch } = usePackages();
    const { mutateAsync: toggleActive } = useTogglePackageActive();

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editing, setEditing] = useState<PackageWithItems | undefined>();
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [busyId, setBusyId] = useState<string | null>(null);

    // ── Loading / error ───────────────────────────────────────────────
    if (isError) {
        return <QueryError title="Couldn't load packages" onRetry={() => void refetch()} />;
    }

    // ── Handlers ──────────────────────────────────────────────────────
    function openCreate() {
        setEditing(undefined);
        setDialogOpen(true);
    }

    function openEdit(pkg: PackageWithItems) {
        setEditing(pkg);
        setDialogOpen(true);
    }

    function toggleExpanded(id: string) {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }

    async function handleToggleActive(pkg: PackageWithItems) {
        setBusyId(pkg._id);
        try {
            await toggleActive({ packageId: pkg._id, isActive: !pkg.isActive });
            toast.success(pkg.isActive ? "Package archived" : "Package restored");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update package");
        } finally {
            setBusyId(null);
        }
    }

    // ── Partition ─────────────────────────────────────────────────────
    const activePackages = (packages ?? []).filter((p) => p.isActive);
    const archivedPackages = (packages ?? []).filter((p) => !p.isActive);

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            {/* ── Header ────────────────────────────────────────── */}
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">Packages</h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        Solar system bundles — the building blocks of quotes
                    </p>
                </div>
                <Button onClick={openCreate} className="shrink-0">
                    <Plus className="size-4 mr-1.5" />
                    New Package
                </Button>
            </div>

            {/* ── Content ───────────────────────────────────────── */}
            {packages === undefined ? (
                <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} className="h-24 w-full rounded-lg" />
                    ))}
                </div>
            ) : packages.length === 0 ? (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <Package className="size-6" />
                        </EmptyMedia>
                        <EmptyTitle>No packages yet</EmptyTitle>
                        <EmptyDescription>
                            Create your first solar system package to start building quotes.
                        </EmptyDescription>
                    </EmptyHeader>
                    <Button onClick={openCreate}>
                        <Plus className="size-4 mr-1.5" />
                        Create Package
                    </Button>
                </Empty>
            ) : (
                <>
                    {/* Active packages */}
                    {activePackages.length > 0 && (
                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Zap className="size-4 text-amber-500" />
                                <h2 className="text-sm font-semibold text-foreground">
                                    Active Packages
                                </h2>
                                <Badge variant="secondary" className="text-xs">
                                    {activePackages.length}
                                </Badge>
                            </div>
                            <Card className="py-0 gap-0 overflow-hidden">
                                {activePackages.map((pkg, i) => (
                                    <PackageCard
                                        key={pkg._id}
                                        pkg={pkg}
                                        expanded={expandedIds.has(pkg._id)}
                                        onToggleExpand={() => toggleExpanded(pkg._id)}
                                        onEdit={() => openEdit(pkg)}
                                        onToggleActive={() => void handleToggleActive(pkg)}
                                        busy={busyId === pkg._id}
                                        divider={i > 0}
                                    />
                                ))}
                            </Card>
                        </section>
                    )}

                    {/* Archived packages */}
                    {archivedPackages.length > 0 && (
                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Archive className="size-4 text-muted-foreground" />
                                <h2 className="text-sm font-semibold text-foreground">
                                    Archived
                                </h2>
                                <Badge variant="secondary" className="text-xs">
                                    {archivedPackages.length}
                                </Badge>
                            </div>
                            <Card className="py-0 gap-0 overflow-hidden">
                                {archivedPackages.map((pkg, i) => (
                                    <PackageCard
                                        key={pkg._id}
                                        pkg={pkg}
                                        expanded={expandedIds.has(pkg._id)}
                                        onToggleExpand={() => toggleExpanded(pkg._id)}
                                        onEdit={() => openEdit(pkg)}
                                        onToggleActive={() => void handleToggleActive(pkg)}
                                        busy={busyId === pkg._id}
                                        divider={i > 0}
                                    />
                                ))}
                            </Card>
                        </section>
                    )}
                </>
            )}

            {/* ── Dialog ────────────────────────────────────────── */}
            <PackageDialog
                open={dialogOpen}
                onClose={() => setDialogOpen(false)}
                existing={editing}
            />
        </div>
    );
}

// ─── Package Card ─────────────────────────────────────────────────────────

type CardProps = {
    pkg: PackageWithItems;
    expanded: boolean;
    onToggleExpand: () => void;
    onEdit: () => void;
    onToggleActive: () => void;
    busy: boolean;
    divider?: boolean;
};

function PackageCard({ pkg, expanded, onToggleExpand, onEdit, onToggleActive, busy, divider }: CardProps) {
    const itemCount = pkg.items.length;

    return (
        <div className={cn(divider && "border-t border-border", !pkg.isActive && "opacity-60")}>
            <div>
                {/* Header row */}
                <div className="flex items-center gap-3 px-4 py-3">
                    <button
                        type="button"
                        onClick={onToggleExpand}
                        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label={expanded ? "Collapse" : "Expand"}
                    >
                        {expanded ? (
                            <ChevronDown className="size-4" />
                        ) : (
                            <ChevronRight className="size-4" />
                        )}
                    </button>

                    <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={onToggleExpand}
                    >
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm truncate">{pkg.name}</span>
                            {pkg.systemSizeKw && (
                                <Badge
                                    variant="secondary"
                                    className="text-[11px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                                >
                                    {pkg.systemSizeKw} kWp
                                </Badge>
                            )}
                            <Badge
                                variant="secondary"
                                className="text-[11px] bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                            >
                                {DESIGN_TYPE_LABELS[pkg.designType]}
                            </Badge>
                            {!pkg.isActive && (
                                <Badge
                                    variant="secondary"
                                    className="text-[11px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                >
                                    Archived
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground/80">
                                {formatPhp(pkg.basePricePhp)}
                            </span>
                            <span>·</span>
                            <span>
                                {itemCount} {itemCount === 1 ? "item" : "items"}
                            </span>
                            {pkg.description && (
                                <>
                                    <span>·</span>
                                    <span className="truncate max-w-[200px]">{pkg.description}</span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                        <TooltipProvider delayDuration={300}>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        size="icon"
                                        variant="ghost"
                                        className="size-9"
                                        onClick={onEdit}
                                    >
                                        <Pencil className="size-3.5" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit package</TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {pkg.isActive ? (
                            <AlertDialog>
                                <TooltipProvider delayDuration={300}>
                                    <Tooltip>
                                        <AlertDialogTrigger asChild>
                                            <TooltipTrigger asChild>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    className="size-9 text-muted-foreground hover:text-destructive"
                                                    disabled={busy}
                                                >
                                                    <Archive className="size-3.5" />
                                                </Button>
                                            </TooltipTrigger>
                                        </AlertDialogTrigger>
                                        <TooltipContent>Archive</TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Archive "{pkg.name}"?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            It won't appear in the quote builder, but existing quotes
                                            that use it are unaffected. You can restore it later.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={onToggleActive}>
                                            Archive
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                        ) : (
                            <TooltipProvider delayDuration={300}>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-9 text-muted-foreground hover:text-emerald-600"
                                            disabled={busy}
                                            onClick={onToggleActive}
                                        >
                                            <RotateCcw className="size-3.5" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Restore</TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                </div>

                {/* Expanded: line items table */}
                {expanded && pkg.items.length > 0 && (
                    <div className="border-t border-border/50 bg-muted/20 px-4 py-3 overflow-x-auto">
                        <table className="w-full text-sm min-w-[420px]">
                            <thead>
                                <tr className="text-xs text-muted-foreground border-b border-border/40">
                                    <th className="text-left pb-2 font-medium w-8">#</th>
                                    <th className="text-left pb-2 font-medium w-1/3">Name</th>
                                    <th className="text-left pb-2 font-medium">Description</th>
                                    <th className="text-right pb-2 font-medium w-28">Quantity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pkg.items.map((item, i) => (
                                    <tr
                                        key={item._id}
                                        className="border-b border-border/20 last:border-0"
                                    >
                                        <td className="py-2 text-muted-foreground">{i + 1}</td>
                                        <td className="py-2 font-medium text-foreground">
                                            {item.name || item.description}
                                        </td>
                                        <td className="py-2 text-muted-foreground text-xs">
                                            {item.name ? item.description : "—"}
                                        </td>
                                        <td className="py-2 text-right tabular-nums font-medium">
                                            {item.qty} {item.unit}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Expanded: no items */}
                {expanded && pkg.items.length === 0 && (
                    <div className="border-t border-border/50 bg-muted/20 px-4 py-4 text-sm text-muted-foreground text-center">
                        No line items — this package is just a header.
                    </div>
                )}
            </div>
        </div>
    );
}
