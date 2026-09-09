/** Replaces convex/installation.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type {
    ChecklistItem,
    InstallationRow,
    InstallationStatus,
    LeadRow,
    PropertyRow,
    UserRow,
} from "../database.types.ts";
import { removeFiles, signedUrls, uploadFiles } from "../storage.ts";
import {
    displayName,
    toInstallation,
    type Id,
    type InstallationDetail,
    type InstallationForInstaller,
} from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";

export async function getInstallationForLead(
    leadId: Id<"leads">,
): Promise<InstallationDetail | null> {
    const { data, error } = await supabase
        .from("installations")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle<InstallationRow>();

    if (error) throw toAppError(error, "Failed to load installation");
    if (!data) return null;

    // assigned_crew_ids is a uuid[] rather than a join table, so the crew names
    // come from one follow-up `in` query instead of an embedded resource.
    const crewIds = data.assigned_crew_ids ?? [];
    let crewNames: { id: string; name: string }[] = [];

    if (crewIds.length) {
        const { data: crew } = await supabase
            .from("users")
            .select("id, name, email")
            .in("id", crewIds);

        const byId = new Map((crew ?? []).map((u) => [u.id, u as Pick<UserRow, "id" | "name" | "email">]));
        crewNames = crewIds.map((id) => ({ id, name: displayName(byId.get(id)) }));
    }

    return {
        ...toInstallation(data),
        crewNames,
        photoUrls: await signedUrls("photos", data.completion_photo_paths),
    };
}

/** The jobs the signed-in technician is on the crew for. */
export async function listMyInstallations(): Promise<InstallationForInstaller[]> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];

    type Row = InstallationRow & {
        leads:
            | (Pick<LeadRow, "first_name" | "last_name"> & {
                  properties: Pick<PropertyRow, "address" | "city">[] | null;
              })
            | null;
    };

    const rows = unwrap(
        await supabase
            .from("installations")
            .select("*, leads(first_name, last_name, properties(address, city))")
            .contains("assigned_crew_ids", [auth.user.id])
            .order("scheduled_date", { ascending: true })
            .returns<Row[]>(),
        "Failed to load installations",
    );

    return rows.map((row) => {
        const property = row.leads?.properties?.[0] ?? null;
        return {
            ...toInstallation(row),
            customerName: row.leads
                ? `${row.leads.first_name} ${row.leads.last_name}`
                : "Unknown",
            address: property ? `${property.address}, ${property.city}` : null,
        };
    });
}

export async function createInstallation(args: {
    leadId: Id<"leads">;
    scheduledDate: string;
    assignedCrewIds: Id<"users">[];
    leadInstallerNote?: string;
    notes?: string;
}): Promise<Id<"installations">> {
    const { data: existing } = await supabase
        .from("installations")
        .select("id")
        .eq("lead_id", args.leadId)
        .maybeSingle();
    if (existing) throw new Error("Installation already exists for this lead");

    const installation = unwrap(
        await supabase
            .from("installations")
            .insert({
                lead_id: args.leadId,
                status: "scheduled",
                scheduled_date: args.scheduledDate,
                assigned_crew_ids: args.assignedCrewIds,
                lead_installer_note: args.leadInstallerNote || null,
                notes: args.notes || null,
                materials_checklist: [],
            })
            .select("id")
            .single(),
        "Failed to schedule installation",
    ) as { id: string };

    await advanceLeadStage(args.leadId, "installation_scheduled", [
        "permitting",
        "contract_signed",
    ]);

    await logActivity({
        leadId: args.leadId,
        action: "Installation scheduled",
        details: `Date: ${new Date(args.scheduledDate).toLocaleDateString()}`,
        entityType: "installation",
        entityId: installation.id,
    });

    return installation.id;
}

export async function updateInstallationStatus(args: {
    installationId: Id<"installations">;
    status: InstallationStatus;
}): Promise<void> {
    const installation = unwrap(
        await supabase
            .from("installations")
            .select("lead_id")
            .eq("id", args.installationId)
            .single(),
        "Installation not found",
    ) as { lead_id: string };

    const { error } = await supabase
        .from("installations")
        .update({
            status: args.status,
            ...(args.status === "completed"
                ? { completed_at: new Date().toISOString() }
                : {}),
        })
        .eq("id", args.installationId);

    if (error) throw toAppError(error, "Failed to update installation");

    if (args.status === "completed") {
        await advanceLeadStage(installation.lead_id, "installation_complete");
    }

    await logActivity({
        leadId: installation.lead_id,
        action: `Installation marked ${args.status.replace(/_/g, " ")}`,
        entityType: "installation",
        entityId: args.installationId,
    });
}

/**
 * Flips one checklist entry.
 *
 * Two crew members ticking items at the same time is the normal case, so this
 * goes through an RPC that mutates the single entry in place. Sending the whole
 * array back (as this used to) meant the second write silently discarded the
 * first one's tick.
 */
export async function toggleChecklistItem(args: {
    installationId: Id<"installations">;
    index: number;
}): Promise<ChecklistItem[]> {
    const { data, error } = await supabase.rpc("toggle_checklist_item", {
        p_installation_id: args.installationId,
        p_index: args.index,
    });
    if (error) throw toAppError(error, "Failed to update checklist");
    return data ?? [];
}

export async function addChecklistItem(args: {
    installationId: Id<"installations">;
    item: string;
}): Promise<ChecklistItem[]> {
    const { data, error } = await supabase.rpc("add_checklist_item", {
        p_installation_id: args.installationId,
        p_item: args.item,
    });
    if (error) throw toAppError(error, "Failed to add item");
    return data ?? [];
}

export async function addCompletionPhotos(args: {
    installationId: Id<"installations">;
    files: File[];
}): Promise<number> {
    if (!args.files.length) return 0;

    const installation = unwrap(
        await supabase
            .from("installations")
            .select("lead_id")
            .eq("id", args.installationId)
            .single(),
        "Installation not found",
    ) as { lead_id: string };

    const uploaded = await uploadFiles(
        "photos",
        "installations",
        args.installationId,
        args.files,
    );

    // Appends server-side, so a second uploader cannot clobber the first batch.
    const { error } = await supabase.rpc("append_completion_photos", {
        p_installation_id: args.installationId,
        p_paths: uploaded,
    });
    if (error) {
        await removeFiles("photos", uploaded);
        throw toAppError(error, "Failed to save photos");
    }

    await logActivity({
        leadId: installation.lead_id,
        action: `${uploaded.length} completion photo(s) uploaded`,
        entityType: "installation",
        entityId: args.installationId,
    });

    return uploaded.length;
}

export async function activateCustomer(args: { leadId: Id<"leads"> }): Promise<void> {
    await advanceLeadStage(args.leadId, "active_customer");

    await logActivity({
        leadId: args.leadId,
        action: "Lead activated as customer",
        entityType: "installation",
    });
}
