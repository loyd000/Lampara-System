/** Replaces convex/quotes.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { QuoteItemRow, QuoteRow, QuoteStatus } from "../database.types.ts";
import {
    displayName,
    toQuote,
    toQuoteItem,
    type Id,
    type QuoteItem,
    type QuoteWithItems,
} from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";
import { notifyEvent } from "./notifications.ts";
import { lineTotalPhp } from "@/lib/money.ts";

type NameOnly = { name: string | null; email: string | null } | null;

type QuoteWithRelations = QuoteRow & {
    creator: NameOnly;
    preparer: NameOnly;
    quote_items: QuoteItemRow[] | null;
};

export async function listQuotesForLead(
    leadId: Id<"leads">,
): Promise<QuoteWithItems[]> {
    const rows = unwrap(
        await supabase
            .from("quotes")
            .select(
                "*, creator:users!quotes_created_by_fkey(name, email), " +
                    "preparer:users!quotes_prepared_by_id_fkey(name, email), " +
                    "quote_items(*)",
            )
            .eq("lead_id", leadId)
            .order("version", { ascending: false })
            .returns<QuoteWithRelations[]>(),
        "Failed to load quotes",
    );

    return rows.map((row) => {
        const items = (row.quote_items ?? [])
            .map(toQuoteItem)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        return {
            ...toQuote(row),
            items,
            preparerName: displayName(row.preparer),
            createdByName: displayName(row.creator),
        };
    });
}

export async function getQuoteWithItems(
    quoteId: Id<"quotes">,
): Promise<QuoteWithItems> {
    const row = unwrap(
        await supabase
            .from("quotes")
            .select(
                "*, creator:users!quotes_created_by_fkey(name, email), " +
                    "preparer:users!quotes_prepared_by_id_fkey(name, email), " +
                    "quote_items(*)",
            )
            .eq("id", quoteId)
            .single()
            .returns<QuoteWithRelations>(),
        "Quote not found",
    );

    const items = (row.quote_items ?? [])
        .map(toQuoteItem)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
        ...toQuote(row),
        items,
        preparerName: displayName(row.preparer),
        createdByName: displayName(row.creator),
    };
}

export type CreateQuoteArgs = {
    leadId: Id<"leads">;
    preparedById?: string;
    validUntil?: string;
    notes?: string;
};

/**
 * Creates an empty in_progress quote with allocated version and next quotation number.
 */
export async function createQuote(args: CreateQuoteArgs): Promise<Id<"quotes">> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required to create a quote");

    // Get the next version for this lead
    const { data: siblings, error: sibError } = await supabase
        .from("quotes")
        .select("version")
        .eq("lead_id", args.leadId)
        .order("version", { ascending: false })
        .limit(1);

    if (sibError) throw toAppError(sibError, "Failed to inspect quote versions");
    const nextVersion = (siblings?.[0]?.version ?? 0) + 1;

    const { data: newQuote, error } = await supabase
        .from("quotes")
        .insert({
            lead_id: args.leadId,
            version: nextVersion,
            status: "in_progress",
            total_php: 0,
            prepared_by_id: args.preparedById ?? user.id,
            created_by: user.id,
            valid_until: args.validUntil || null,
            notes: args.notes ? args.notes.trim() : null,
        })
        .select("id, quotation_no")
        .single();

    if (error) throw toAppError(error, "Failed to create quote");

    await logActivity({
        leadId: args.leadId,
        action: `Quote v${nextVersion} created`,
        details: newQuote.quotation_no ?? `Version ${nextVersion}`,
        entityType: "quote",
        entityId: newQuote.id,
    });

    return newQuote.id as string;
}

export type QuoteItemInput = {
    description: string;
    qty: number;
    unit: string;
    unitPricePhp: number;
    sourcePackageId?: string;
    sortOrder?: number;
};

export type SaveQuoteArgs = {
    quoteId: Id<"quotes">;
    notes?: string | null;
    validUntil?: string | null;
    preparedById?: string | null;
    items: QuoteItemInput[];
};

/**
 * Saves quote metadata and synchronises line items, recomputing total_php.
 *
 * The header update, item replacement and lead touch all happen inside one
 * `save_quote` transaction (see 0033_atomic_save_quote.sql) — previously
 * these were three separate calls, so a failure between the delete and the
 * insert could leave a quote saved with zero line items. This function still
 * owns the pricing math (clamping, rounding, defaults); the RPC only
 * guarantees the write lands as a unit.
 */
export async function saveQuote(args: SaveQuoteArgs): Promise<void> {
    const items = args.items.map((item, idx) => {
        const qty = Math.max(0.01, item.qty);
        const unitPrice = Math.max(0, item.unitPricePhp);
        const lineTotal = lineTotalPhp(qty, unitPrice);
        return {
            description: item.description.trim() || "Item",
            qty,
            unit: item.unit.trim() || "pc",
            unit_price_php: unitPrice,
            line_total_php: lineTotal,
            source_package_id: item.sourcePackageId || null,
            sort_order: item.sortOrder ?? idx,
        };
    });

    const grandTotal = items.reduce((acc, item) => acc + item.line_total_php, 0);

    const { error } = await supabase.rpc("save_quote", {
        p_quote_id: args.quoteId,
        p_notes: args.notes ?? null,
        p_valid_until: args.validUntil ?? null,
        p_prepared_by_id: args.preparedById ?? null,
        p_total_php: grandTotal,
        p_items: items,
    });

    if (error) throw toAppError(error, "Failed to save quote");
}

/**
 * Locks the quote to 'approved' and advances the lead stage to proposal_sent.
 */
export async function approveQuote(args: { quoteId: Id<"quotes"> }): Promise<void> {
    const quote = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, version, total_php, quotation_no, leads(assigned_sales_rep_id)")
            .eq("id", args.quoteId)
            .single(),
        "Quote not found",
    ) as {
        lead_id: string;
        version: number;
        total_php: number;
        quotation_no: string;
        leads: { assigned_sales_rep_id: string | null } | null;
    };

    const { error } = await supabase
        .from("quotes")
        .update({ status: "approved" })
        .eq("id", args.quoteId);

    if (error) throw toAppError(error, "Failed to approve quote");

    await advanceLeadStage(quote.lead_id, "proposal_sent");

    await logActivity({
        leadId: quote.lead_id,
        action: `Quote v${quote.version} approved`,
        details: `${quote.quotation_no} · ₱${Number(quote.total_php).toLocaleString()}`,
        entityType: "quote",
        entityId: args.quoteId,
    });

    const repId = quote.leads?.assigned_sales_rep_id;
    if (repId) {
        await notifyEvent({
            event: "quote_accepted",
            leadId: quote.lead_id,
            recipientUserIds: [repId],
            meta: { quotationNo: quote.quotation_no },
        });
    }
}

/**
 * Reopens an approved quote back to in_progress with an audit trail.
 */
export async function reopenQuote(args: {
    quoteId: Id<"quotes">;
    reason?: string;
}): Promise<void> {
    const quote = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, version, status, quotation_no")
            .eq("id", args.quoteId)
            .single(),
        "Quote not found",
    ) as {
        lead_id: string;
        version: number;
        status: QuoteStatus;
        quotation_no: string;
    };

    const { error } = await supabase
        .from("quotes")
        .update({ status: "in_progress" })
        .eq("id", args.quoteId);

    if (error) throw toAppError(error, "Failed to reopen quote");

    await logActivity({
        leadId: quote.lead_id,
        action: `Quote v${quote.version} unlocked for editing`,
        details: args.reason ? `Reason: ${args.reason}` : "Status returned to in_progress",
        entityType: "quote",
        entityId: args.quoteId,
    });
}

/**
 * Clones an existing quote and its line items into a new version.
 */
export async function reviseQuote(args: {
    quoteId: Id<"quotes">;
}): Promise<Id<"quotes">> {
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Authentication required to revise quote");

    const prev = await getQuoteWithItems(args.quoteId);

    const { data: siblings, error: sibErr } = await supabase
        .from("quotes")
        .select("version")
        .eq("lead_id", prev.leadId)
        .order("version", { ascending: false })
        .limit(1);

    if (sibErr) throw toAppError(sibErr, "Failed to inspect quote versions");
    const nextVersion = (siblings?.[0]?.version ?? prev.version) + 1;

    const { data: newQuote, error: insQuoteErr } = await supabase
        .from("quotes")
        .insert({
            lead_id: prev.leadId,
            version: nextVersion,
            status: "in_progress",
            total_php: prev.totalPhp,
            notes: prev.notes || null,
            valid_until: prev.validUntil || null,
            prepared_by_id: prev.preparedById || user.id,
            created_by: user.id,
        })
        .select("id, quotation_no")
        .single();

    if (insQuoteErr) throw toAppError(insQuoteErr, "Failed to clone quote");

    if (prev.items.length > 0) {
        const clonedItems = prev.items.map((item, idx) => ({
            quote_id: newQuote.id,
            description: item.description,
            qty: item.qty,
            unit: item.unit,
            unit_price_php: item.unitPricePhp,
            line_total_php: item.lineTotalPhp,
            source_package_id: item.sourcePackageId || null,
            sort_order: item.sortOrder ?? idx,
        }));

        const { error: insItemsErr } = await supabase
            .from("quote_items")
            .insert(clonedItems);

        if (insItemsErr) throw toAppError(insItemsErr, "Failed to copy quote items");
    }

    await logActivity({
        leadId: prev.leadId,
        action: `Quote revised to v${nextVersion}`,
        details: `Based on v${prev.version} · ${newQuote.quotation_no}`,
        entityType: "quote",
        entityId: newQuote.id,
    });

    return newQuote.id as string;
}

export async function deleteQuote(args: { quoteId: Id<"quotes"> }): Promise<void> {
    const quote = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, version, status, quotation_no")
            .eq("id", args.quoteId)
            .single(),
        "Quote not found",
    ) as {
        lead_id: string;
        version: number;
        status: QuoteStatus;
        quotation_no: string;
    };

    const { error } = await supabase.from("quotes").delete().eq("id", args.quoteId);
    if (error) throw toAppError(error, "Failed to delete quote");

    await logActivity({
        leadId: quote.lead_id,
        action: `Quote v${quote.version} deleted`,
        details: quote.quotation_no,
        entityType: "quote",
    });
}

