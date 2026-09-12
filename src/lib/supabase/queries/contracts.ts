/** Replaces convex/contracts.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { ContractRow } from "../database.types.ts";
import { buildPath, removeFiles, signedUrl, uploadFile } from "../storage.ts";
import { toContract, type ContractDetail, type Id } from "../types.ts";
import { logActivity } from "./leads.ts";
import { notifyEvent } from "./notifications.ts";

/**
 * Every contract ever generated for a lead — one per quote version it was
 * created from (see 0038_multiple_contracts_per_lead.sql), newest first.
 * Signing one has no effect on the others; each keeps its own status.
 */
export async function listContractsForLead(
    leadId: Id<"leads">,
): Promise<ContractDetail[]> {
    const { data, error } = await supabase
        .from("contracts")
        .select("*, quotes!contracts_quote_id_fkey(version)")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .returns<(ContractRow & { quotes: { version: number } | null })[]>();

    if (error) {
        // Fallback: if relationship embedding fails, query contracts plain and fetch quotes separately.
        const { data: fallbackRows, error: fallbackError } = await supabase
            .from("contracts")
            .select("*")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<ContractRow[]>();

        if (fallbackError) throw toAppError(fallbackError, "Failed to load contracts");
        const rows = fallbackRows ?? [];

        const quoteIds = [...new Set(rows.map((r) => r.quote_id))];
        const { data: quoteRows } = quoteIds.length
            ? await supabase.from("quotes").select("id, version").in("id", quoteIds)
            : { data: [] as { id: string; version: number }[] };
        const versionById = new Map((quoteRows ?? []).map((q) => [q.id, q.version]));

        return Promise.all(
            rows.map(async (row) => ({
                ...toContract(row),
                documentUrl: await signedUrl("documents", row.document_path),
                quoteVersion: versionById.get(row.quote_id) ?? null,
            })),
        );
    }

    return Promise.all(
        (data ?? []).map(async (row) => ({
            ...toContract(row),
            documentUrl: await signedUrl("documents", row.document_path),
            quoteVersion: row.quotes?.version ?? null,
        })),
    );
}

/**
 * Creates a contract for a lead's quote and accepts that quote.
 * The lead's stage does not move here — it moves when the contract is signed.
 *
 * All three in one transaction: previously the quote was flipped to `accepted`
 * before the contract insert, so a failed insert left a quote marked accepted
 * with no contract behind it. "One contract per quote version" is enforced by
 * the `quote_id` unique constraint, which the function translates into a
 * readable message.
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

/**
 * Signs the contract, advances the lead to Contract Signed, and logs the
 * activity entry — all inside `mark_contract_signed` (see
 * 0034_atomic_mark_contract_signed.sql). Previously these were separate
 * calls: a failure in the stage-advance step after the status update had
 * already committed left the contract signed with the lead's stage never
 * following it, with no compensating rollback.
 */
export async function markContractSigned(args: {
    contractId: Id<"contracts">;
}): Promise<void> {
    const contract = unwrap(
        await supabase
            .from("contracts")
            .select("lead_id, leads(assigned_sales_rep_id)")
            .eq("id", args.contractId)
            .single(),
        "Contract not found",
    ) as { lead_id: string; leads: { assigned_sales_rep_id: string | null } | null };

    const { error } = await supabase.rpc("mark_contract_signed", {
        p_contract_id: args.contractId,
    });
    if (error) throw toAppError(error, "Failed to sign contract");

    const repId = contract.leads?.assigned_sales_rep_id;
    if (repId) {
        await notifyEvent({
            event: "contract_signed",
            leadId: contract.lead_id as Id<"leads">,
            recipientUserIds: [repId],
        });
    }
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

/** Fields the generated contract PDF fills in. Edit before generating. */
export async function updateContractDetails(args: {
    contractId: Id<"contracts">;
    homeownerName: string;
    siteAddress: string;
    phoneNumber: string;
    systemSizeKw: number | null;
    panelLine: string;
    inverterLine: string;
    batteryLine: string;
    pricePhp: number | null;
    preparedByName: string;
    contractDate: string | null;
}): Promise<void> {
    const { error } = await supabase.rpc("update_contract_details", {
        p_contract_id: args.contractId,
        p_homeowner_name: args.homeownerName,
        p_site_address: args.siteAddress,
        p_phone_number: args.phoneNumber,
        p_system_size_kw: args.systemSizeKw,
        p_panel_line: args.panelLine,
        p_inverter_line: args.inverterLine,
        p_battery_line: args.batteryLine,
        p_price_php: args.pricePhp,
        p_prepared_by_name: args.preparedByName,
        p_contract_date: args.contractDate,
    });
    if (error) throw toAppError(error, "Failed to update contract details");
}

export async function deleteContract(args: {
    contractId: Id<"contracts">;
}): Promise<void> {
    const contract = unwrap(
        await supabase
            .from("contracts")
            .select("lead_id, document_path")
            .eq("id", args.contractId)
            .single(),
        "Contract not found",
    ) as { lead_id: string; document_path: string | null };

    const { error } = await supabase
        .from("contracts")
        .delete()
        .eq("id", args.contractId);
    if (error) throw toAppError(error, "Failed to delete contract");

    if (contract.document_path) {
        await removeFiles("documents", [contract.document_path]);
    }

    await logActivity({
        leadId: contract.lead_id,
        action: "Contract deleted",
        entityType: "contract",
        entityId: args.contractId,
    });
}

