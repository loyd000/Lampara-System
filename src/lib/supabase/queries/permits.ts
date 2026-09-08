/** Replaces convex/permits.ts. */

import { PERMIT_TYPE_LABELS } from "@/lib/constants.ts";
import { supabase, toAppError, unwrap } from "../client.ts";
import type { PermitRow, PermitStatus, PermitType } from "../database.types.ts";
import { buildPath, removeFiles, signedUrlMap, uploadFile } from "../storage.ts";
import { toPermit, type Id, type PermitDetail } from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

function typeLabel(type: PermitType): string {
    return PERMIT_TYPE_LABELS[type] ?? "Permit";
}

export async function listPermitsForLead(
    leadId: Id<"leads">,
): Promise<PermitDetail[]> {
    const rows = unwrap(
        await supabase
            .from("permits")
            .select("*, assignee:users!permits_assigned_to_id_fkey(name, email)")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<(PermitRow & { assignee: NameOnly })[]>(),
        "Failed to load permits",
    );

    // One signing request for the whole list rather than one per permit.
    const urls = await signedUrlMap(
        "documents",
        rows.map((row) => row.document_path),
    );

    return rows.map((row) => ({
        ...toPermit(row),
        documentUrl: row.document_path ? (urls.get(row.document_path) ?? null) : null,
        assignedToName: row.assignee
            ? (row.assignee.name ?? row.assignee.email ?? null)
            : null,
    }));
}

export async function createPermit(args: {
    leadId: Id<"leads">;
    type: PermitType;
    dueDate?: string;
    assignedToId?: Id<"users">;
    notes?: string;
}): Promise<Id<"permits">> {
    const permit = unwrap(
        await supabase
            .from("permits")
            .insert({
                lead_id: args.leadId,
                type: args.type,
                status: "not_submitted",
                due_date: args.dueDate || null,
                assigned_to_id: args.assignedToId || null,
                notes: args.notes || null,
            })
            .select("id")
            .single(),
        "Failed to add permit",
    ) as { id: string };

    await logActivity({
        leadId: args.leadId,
        action: `Permit added: ${typeLabel(args.type)}`,
        entityType: "permit",
        entityId: permit.id,
    });

    // Move the lead into permitting, but only from contract_signed.
    await advanceLeadStage(args.leadId, "permitting", ["contract_signed"]);

    return permit.id;
}

export async function updatePermitStatus(args: {
    permitId: Id<"permits">;
    status: PermitStatus;
    notes?: string;
}): Promise<void> {
    const permit = unwrap(
        await supabase
            .from("permits")
            .select("lead_id, type, submitted_at, approved_at, rejected_at")
            .eq("id", args.permitId)
            .single(),
        "Permit not found",
    ) as {
        lead_id: string;
        type: PermitType;
        submitted_at: string | null;
        approved_at: string | null;
        rejected_at: string | null;
    };

    const now = new Date().toISOString();

    const { error } = await supabase
        .from("permits")
        .update({
            status: args.status,
            // Each milestone timestamp is stamped once, on first transition.
            ...(args.status === "submitted" && !permit.submitted_at
                ? { submitted_at: now }
                : {}),
            ...(args.status === "approved" && !permit.approved_at
                ? { approved_at: now }
                : {}),
            ...(args.status === "rejected" && !permit.rejected_at
                ? { rejected_at: now }
                : {}),
            ...(args.notes !== undefined ? { notes: args.notes || null } : {}),
        })
        .eq("id", args.permitId);

    if (error) throw toAppError(error, "Failed to update permit");

    await logActivity({
        leadId: permit.lead_id,
        action: `${typeLabel(permit.type)} marked ${args.status.replace(/_/g, " ")}`,
        entityType: "permit",
        entityId: args.permitId,
    });
}

export async function attachPermitDocument(args: {
    permitId: Id<"permits">;
    file: File;
}): Promise<void> {
    const permit = unwrap(
        await supabase
            .from("permits")
            .select("lead_id, type, document_path")
            .eq("id", args.permitId)
            .single(),
        "Permit not found",
    ) as { lead_id: string; type: PermitType; document_path: string | null };

    const path = await uploadFile(
        "documents",
        buildPath("permits", args.permitId, args.file),
        args.file,
    );

    const { error } = await supabase
        .from("permits")
        .update({ document_path: path })
        .eq("id", args.permitId);
    if (error) {
        await removeFiles("documents", [path]);
        throw toAppError(error, "Failed to attach document");
    }

    // Replacing an attachment leaves the old object behind otherwise.
    if (permit.document_path) await removeFiles("documents", [permit.document_path]);

    await logActivity({
        leadId: permit.lead_id,
        action: `${typeLabel(permit.type)} document uploaded`,
        entityType: "permit",
        entityId: args.permitId,
    });
}

export async function deletePermit(args: { permitId: Id<"permits"> }): Promise<void> {
    const permit = unwrap(
        await supabase
            .from("permits")
            .select("lead_id, type, document_path")
            .eq("id", args.permitId)
            .single(),
        "Permit not found",
    ) as { lead_id: string; type: PermitType; document_path: string | null };

    const { error } = await supabase.from("permits").delete().eq("id", args.permitId);
    if (error) throw toAppError(error, "Failed to remove permit");

    // Storage does not cascade — drop the attachment with the row.
    if (permit.document_path) await removeFiles("documents", [permit.document_path]);

    await logActivity({
        leadId: permit.lead_id,
        action: `Permit removed: ${typeLabel(permit.type)}`,
        entityType: "permit",
    });
}
