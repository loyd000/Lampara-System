/** Replaces convex/contracts.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { ContractRow } from "../database.types.ts";
import { buildPath, removeFiles, signedUrl, uploadFile } from "../storage.ts";
import { toContract, type ContractDetail, type Id } from "../types.ts";
// The stage advance for a new contract happens inside create_contract itself,
// so it stays in the same transaction as the insert.
import { logActivity } from "./leads.ts";

export async function getContractForLead(
    leadId: Id<"leads">,
): Promise<ContractDetail | null> {
    const { data, error } = await supabase
        .from("contracts")
        .select("*, quotes(version)")
        .eq("lead_id", leadId)
        .maybeSingle<ContractRow & { quotes: { version: number } | null }>();

    if (error) throw toAppError(error, "Failed to load contract");
    if (!data) return null;

    return {
        ...toContract(data),
        documentUrl: await signedUrl("documents", data.document_path),
        quoteVersion: data.quotes?.version ?? null,
    };
}

/**
 * Creates the single contract for a lead, accepts the quote it is based on, and
 * advances the lead to contract_signed.
 *
 * All three in one transaction: previously the quote was flipped to `accepted`
 * before the contract insert, so a failed insert left a quote marked accepted
 * with no contract behind it. "One contract per lead" is enforced by the
 * `lead_id` unique constraint, which the function translates into a readable
 * message.
 */
export async function createContract(args: {
    leadId: Id<"leads">;
    quoteId: Id<"quotes">;
    notes?: string;
}): Promise<Id<"contracts">> {
    const { data, error } = await supabase.rpc("create_contract", {
        p_lead_id: args.leadId,
        p_quote_id: args.quoteId,
        p_notes: args.notes || null,
    });

    if (error) throw toAppError(error, "Failed to create contract");
    return data as string;
}

export async function markContractSigned(args: {
    contractId: Id<"contracts">;
}): Promise<void> {
    const contract = unwrap(
        await supabase.from("contracts").select("lead_id").eq("id", args.contractId).single(),
        "Contract not found",
    ) as { lead_id: string };

    const { error } = await supabase
        .from("contracts")
        .update({ status: "signed", signed_at: new Date().toISOString() })
        .eq("id", args.contractId);
    if (error) throw toAppError(error, "Failed to update contract");

    await logActivity({
        leadId: contract.lead_id,
        action: "Contract signed",
        entityType: "contract",
        entityId: args.contractId,
    });
}

export async function markContractCancelled(args: {
    contractId: Id<"contracts">;
}): Promise<void> {
    const contract = unwrap(
        await supabase.from("contracts").select("lead_id").eq("id", args.contractId).single(),
        "Contract not found",
    ) as { lead_id: string };

    const { error } = await supabase
        .from("contracts")
        .update({ status: "cancelled" })
        .eq("id", args.contractId);
    if (error) throw toAppError(error, "Failed to cancel contract");

    await logActivity({
        leadId: contract.lead_id,
        action: "Contract cancelled",
        entityType: "contract",
        entityId: args.contractId,
    });
}

/** Uploads to the private `documents` bucket and records the path on the row. */
export async function attachContractDocument(args: {
    contractId: Id<"contracts">;
    file: File;
}): Promise<void> {
    const contract = unwrap(
        await supabase
            .from("contracts")
            .select("lead_id, document_path")
            .eq("id", args.contractId)
            .single(),
        "Contract not found",
    ) as { lead_id: string; document_path: string | null };

    const path = await uploadFile(
        "documents",
        buildPath("contracts", args.contractId, args.file),
        args.file,
    );

    const { error } = await supabase
        .from("contracts")
        .update({ document_path: path })
        .eq("id", args.contractId);
    if (error) {
        await removeFiles("documents", [path]);
        throw toAppError(error, "Failed to attach document");
    }

    // Replacing an attachment leaves the old object behind otherwise.
    if (contract.document_path) await removeFiles("documents", [contract.document_path]);

    await logActivity({
        leadId: contract.lead_id,
        action: "Contract document uploaded",
        entityType: "contract",
        entityId: args.contractId,
    });
}

export async function updateContractNotes(args: {
    contractId: Id<"contracts">;
    notes: string;
}): Promise<void> {
    const { error } = await supabase
        .from("contracts")
        .update({ notes: args.notes })
        .eq("id", args.contractId);
    if (error) throw toAppError(error, "Failed to update notes");
}
