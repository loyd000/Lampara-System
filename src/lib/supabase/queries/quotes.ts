/** Replaces convex/quotes.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { FinancingOption, QuoteRow, QuoteStatus } from "../database.types.ts";
import { displayName, toQuote, type Id, type QuoteWithCreator } from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

export async function listQuotesForLead(
    leadId: Id<"leads">,
): Promise<QuoteWithCreator[]> {
    const rows = unwrap(
        await supabase
            .from("quotes")
            .select("*, creator:users!quotes_created_by_fkey(name, email)")
            .eq("lead_id", leadId)
            .order("version", { ascending: false })
            .returns<(QuoteRow & { creator: NameOnly })[]>(),
        "Failed to load quotes",
    );

    return rows.map((row) => ({
        ...toQuote(row),
        createdByName: displayName(row.creator),
    }));
}

export type CreateQuoteArgs = {
    leadId: Id<"leads">;
    panelCount: number;
    panelModel: string;
    inverterType: string;
    systemSizeKw: number;
    totalPriceUsd: number;
    financingOption: FinancingOption;
    validUntil?: string;
    notes?: string;
};

/**
 * Version allocation, the insert and the audit entry happen in one transaction,
 * serialised per lead by an advisory lock — so two reps quoting the same lead at
 * the same time get v1 and v2 rather than one of them hitting the
 * `unique (lead_id, version)` constraint.
 */
export async function createQuote(args: CreateQuoteArgs): Promise<Id<"quotes">> {
    const { data, error } = await supabase.rpc("create_quote", {
        p_lead_id: args.leadId,
        p_panel_count: args.panelCount,
        p_panel_model: args.panelModel,
        p_inverter_type: args.inverterType,
        p_system_size_kw: args.systemSizeKw,
        p_total_price_usd: args.totalPriceUsd,
        p_financing_option: args.financingOption,
        p_valid_until: args.validUntil || null,
        p_notes: args.notes || null,
    });

    if (error) throw toAppError(error, "Failed to create quote");
    return data as string;
}

export async function updateQuoteStatus(args: {
    quoteId: Id<"quotes">;
    status: QuoteStatus;
}): Promise<void> {
    const quote = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, version, sent_at")
            .eq("id", args.quoteId)
            .single(),
        "Quote not found",
    ) as { lead_id: string; version: number; sent_at: string | null };

    const { error } = await supabase
        .from("quotes")
        .update({
            status: args.status,
            ...(args.status === "sent" && !quote.sent_at
                ? { sent_at: new Date().toISOString() }
                : {}),
        })
        .eq("id", args.quoteId);

    if (error) throw toAppError(error, "Failed to update quote");

    // Sending a proposal advances the lead, but only from survey_completed —
    // re-sending a quote later must not drag a further-along lead backwards.
    if (args.status === "sent") {
        await advanceLeadStage(quote.lead_id, "proposal_sent", ["survey_completed"]);
    }

    await logActivity({
        leadId: quote.lead_id,
        action: `Quote v${quote.version} marked ${args.status}`,
        entityType: "quote",
        entityId: args.quoteId,
    });
}

/**
 * Supersedes the current quote and clones it as the next draft version.
 *
 * Both halves are in one transaction: the previous version marked the old quote
 * superseded first, so a failed clone left the lead with no live quote at all.
 */
export async function reviseQuote(args: {
    quoteId: Id<"quotes">;
}): Promise<Id<"quotes">> {
    const { data, error } = await supabase.rpc("revise_quote", {
        p_quote_id: args.quoteId,
    });

    if (error) throw toAppError(error, "Failed to revise quote");
    return data as string;
}

/** Drafts only — enforced by the `quotes_delete` policy, checked here for a clearer message. */
export async function deleteQuote(args: { quoteId: Id<"quotes"> }): Promise<void> {
    const quote = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, version, status")
            .eq("id", args.quoteId)
            .single(),
        "Quote not found",
    ) as { lead_id: string; version: number; status: QuoteStatus };

    if (quote.status !== "draft") {
        throw new Error("Only draft quotes can be deleted");
    }

    const { error } = await supabase.from("quotes").delete().eq("id", args.quoteId);
    if (error) throw toAppError(error, "Failed to delete quote");

    await logActivity({
        leadId: quote.lead_id,
        action: `Quote v${quote.version} deleted`,
        entityType: "quote",
    });
}
