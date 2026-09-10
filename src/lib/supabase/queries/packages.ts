/**
 * Packages — saved solar system bundles for the quote builder.
 *
 * A package has a header (name, system size, headline price) and a list of
 * line items (description, qty, unit, unit price). Editing replaces the full
 * item list rather than diffing — the list is short, and partial updates
 * would need the client to track which rows are new, changed or deleted, all
 * of which is more error surface than the data justifies.
 *
 * Superadmin only for writes. All active members can read (the quote builder
 * in Phase 6 needs to list active packages for any admin).
 */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { PackageDesignType, PackageItemRow, PackageRow } from "../database.types.ts";
import {
    displayName,
    toPackage,
    toPackageItem,
    type PackageWithItems,
} from "../types.ts";

type NameOnly = { name: string | null; email: string | null } | null;

// ─── Queries ──────────────────────────────────────────────────────────────

export async function listPackages(): Promise<PackageWithItems[]> {
    const rows = unwrap(
        await supabase
            .from("packages")
            .select("*, creator:users!packages_created_by_fkey(name, email)")
            .order("sort_order")
            .order("name")
            .returns<(PackageRow & { creator: NameOnly })[]>(),
        "Failed to load packages",
    );

    // Fetch all items in one query, then distribute by package_id.
    const packageIds = rows.map((r) => r.id);
    const itemRows =
        packageIds.length > 0
            ? unwrap(
                  await supabase
                      .from("package_items")
                      .select("*")
                      .in("package_id", packageIds)
                      .order("sort_order")
                      .returns<PackageItemRow[]>(),
                  "Failed to load package items",
              )
            : [];

    const itemsByPackage = new Map<string, PackageItemRow[]>();
    for (const item of itemRows) {
        const list = itemsByPackage.get(item.package_id) ?? [];
        list.push(item);
        itemsByPackage.set(item.package_id, list);
    }

    return rows.map((row) => ({
        ...toPackage(row),
        items: (itemsByPackage.get(row.id) ?? []).map(toPackageItem),
        createdByName: displayName(row.creator, null as unknown as string) || null,
    }));
}

export async function listActivePackages(): Promise<PackageWithItems[]> {
    const all = await listPackages();
    return all.filter((p) => p.isActive);
}

// ─── Mutations ────────────────────────────────────────────────────────────

export type PackageItemInput = {
    name?: string;
    description: string;
    qty: number;
    unit?: string;
    unitPricePhp?: number;
};

export async function createPackage(args: {
    name: string;
    description?: string;
    systemSizeKw?: number;
    basePricePhp: number;
    designType: PackageDesignType;
    items: PackageItemInput[];
}): Promise<string> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const pkg = unwrap(
        await supabase
            .from("packages")
            .insert({
                name: args.name.trim(),
                description: args.description?.trim() || null,
                system_size_kw: args.systemSizeKw ?? null,
                base_price_php: args.basePricePhp,
                design_type: args.designType,
                created_by: auth.user.id,
            })
            .select("id")
            .single(),
        "Failed to create package",
    ) as { id: string };

    if (args.items.length > 0) {
        const { error } = await supabase.from("package_items").insert(
            args.items.map((item, i) => ({
                package_id: pkg.id,
                name: item.name?.trim() || null,
                description: item.description?.trim() || item.name?.trim() || "Item",
                qty: item.qty,
                unit: (item.unit || "pc").trim(),
                unit_price_php: item.unitPricePhp ?? 0,
                sort_order: i,
            })),
        );
        if (error) throw toAppError(error, "Failed to save package items");
    }

    return pkg.id;
}

export async function updatePackage(args: {
    packageId: string;
    name: string;
    description?: string;
    systemSizeKw?: number;
    basePricePhp: number;
    designType: PackageDesignType;
    items: PackageItemInput[];
}): Promise<void> {
    const { error: headerError } = await supabase
        .from("packages")
        .update({
            name: args.name.trim(),
            description: args.description?.trim() || null,
            system_size_kw: args.systemSizeKw ?? null,
            base_price_php: args.basePricePhp,
            design_type: args.designType,
        })
        .eq("id", args.packageId);
    if (headerError) throw toAppError(headerError, "Failed to update package");

    // Replace the full item list: delete existing, then bulk-insert the new set.
    // This is simpler and safer than a three-way diff for a list that rarely
    // exceeds a dozen rows.
    const { error: deleteError } = await supabase
        .from("package_items")
        .delete()
        .eq("package_id", args.packageId);
    if (deleteError) throw toAppError(deleteError, "Failed to update package items");

    if (args.items.length > 0) {
        const { error: insertError } = await supabase.from("package_items").insert(
            args.items.map((item, i) => ({
                package_id: args.packageId,
                name: item.name?.trim() || null,
                description: item.description?.trim() || item.name?.trim() || "Item",
                qty: item.qty,
                unit: (item.unit || "pc").trim(),
                unit_price_php: item.unitPricePhp ?? 0,
                sort_order: i,
            })),
        );
        if (insertError) throw toAppError(insertError, "Failed to save package items");
    }
}

export async function togglePackageActive(args: {
    packageId: string;
    isActive: boolean;
}): Promise<void> {
    const { error } = await supabase
        .from("packages")
        .update({ is_active: args.isActive })
        .eq("id", args.packageId);
    if (error) throw toAppError(error, "Failed to update package status");
}

export async function reorderPackages(args: {
    orderedIds: string[];
}): Promise<void> {
    // Batch-update sort_order. PostgREST doesn't support batch updates in one
    // call, so this loops — but the list is short (< 50 packages max) and the
    // superadmin does this rarely enough that N round-trips are acceptable.
    const updates = args.orderedIds.map((id, i) =>
        supabase.from("packages").update({ sort_order: i }).eq("id", id),
    );
    const results = await Promise.all(updates);
    const firstError = results.find((r) => r.error);
    if (firstError?.error) throw toAppError(firstError.error, "Failed to reorder packages");
}
