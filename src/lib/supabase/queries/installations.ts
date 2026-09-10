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
import { notifyEvent } from "./notifications.ts";

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
    /** Inclusive last day. Defaults to a one-day job on `scheduledDate`. */
    scheduledEndDate?: string;
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

    // A missing finish date means a one-day job, and the CHECK constraint
    // rejects a finish before the start rather than storing a backwards range.
    const endDate = args.scheduledEndDate || args.scheduledDate;
    if (endDate < args.scheduledDate) {
        throw new Error("The installation cannot finish before it starts");
    }

    const installation = unwrap(
        await supabase
            .from("installations")
            .insert({
                lead_id: args.leadId,
                status: "scheduled",
                scheduled_date: args.scheduledDate,
                scheduled_end_date: endDate,
                assigned_crew_ids: args.assignedCrewIds,
                lead_installer_note: args.leadInstallerNote || null,
                notes: args.notes || null,
                materials_checklist: [],
            })
            .select("id")
            .single(),
        "Failed to schedule installation",
    ) as { id: string };

    await advanceLeadStage(args.leadId, "installation_scheduled");

    await logActivity({
        leadId: args.leadId,
        action: "Installation scheduled",
        details:
            endDate === args.scheduledDate
                ? `Date: ${new Date(args.scheduledDate).toLocaleDateString()}`
                : `Dates: ${new Date(args.scheduledDate).toLocaleDateString()} – ${new Date(endDate).toLocaleDateString()}`,
        entityType: "installation",
        entityId: installation.id,
    });

    await notifyEvent({
        event: "installation_scheduled",
        leadId: args.leadId,
        recipientUserIds: args.assignedCrewIds,
        meta: { scheduledDate: new Date(args.scheduledDate).toLocaleDateString() },
    });

    return installation.id;
}

/**
 * Formats a schedule for the activity log: one date, or a range.
 *
 * Kept next to the two callers rather than shared with the UI's version — this
 * one is a permanent record, so it must not follow a later change of taste in
 * how the section displays dates.
 */
function describeSchedule(start: string, end: string): string {
    const at = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString();
    return start === end ? at(start) : `${at(start)} – ${at(end)}`;
}

/**
 * Moves an existing installation's dates and crew.
 *
 * Until this existed a mistyped date could not be corrected at all: one
 * installation per lead is enforced at creation, and the only other mutation is
 * the status buttons, so the row was effectively immutable.
 *
 * The lead's stage is deliberately untouched. It is already at or past
 * Install Scheduled, and an automatic advance never moves a lead backwards.
 */
export async function rescheduleInstallation(args: {
    installationId: Id<"installations">;
    scheduledDate: string;
    scheduledEndDate?: string;
    assignedCrewIds: Id<"users">[];
    leadInstallerNote?: string;
    notes?: string;
}): Promise<void> {
    const current = unwrap(
        await supabase
            .from("installations")
            .select("lead_id, scheduled_date, scheduled_end_date")
            .eq("id", args.installationId)
            .single(),
        "Installation not found",
    ) as { lead_id: string; scheduled_date: string; scheduled_end_date: string };

    const endDate = args.scheduledEndDate || args.scheduledDate;
    if (endDate < args.scheduledDate) {
        throw new Error("The installation cannot finish before it starts");
    }

    const { error } = await supabase
        .from("installations")
        .update({
            scheduled_date: args.scheduledDate,
            scheduled_end_date: endDate,
            assigned_crew_ids: args.assignedCrewIds,
            lead_installer_note: args.leadInstallerNote || null,
            notes: args.notes || null,
        })
        .eq("id", args.installationId);
    if (error) throw toAppError(error, "Failed to reschedule the installation");

    const before = describeSchedule(current.scheduled_date, current.scheduled_end_date);
    const after = describeSchedule(args.scheduledDate, endDate);

    await logActivity({
        leadId: current.lead_id,
        action: "Installation rescheduled",
        details: before === after ? `Crew updated · ${after}` : `${before} → ${after}`,
        entityType: "installation",
        entityId: args.installationId,
    });

    // The crew is told about the new dates the same way they were told about
    // the original ones — a silent move is how someone turns up on the wrong day.
    await notifyEvent({
        event: "installation_scheduled",
        leadId: current.lead_id,
        recipientUserIds: args.assignedCrewIds,
        meta: { scheduledDate: new Date(`${args.scheduledDate}T00:00:00`).toLocaleDateString() },
    });
}

/**
 * Deletes an installation, freeing the lead to have a new one scheduled.
 *
 * Two things go with it and both are handled here rather than left to chance:
 * `service_tickets.installation_id` cascades in the database, so any tickets
 * raised against this job are destroyed with it, and the completion photos in
 * the `photos` bucket are referenced by nothing else, so they would sit there
 * forever. The caller is expected to have shown the ticket count first —
 * `countTicketsForInstallation` exists for exactly that.
 *
 * The lead's stage is left where it is; moving it back is a judgement call that
 * belongs to whoever is looking at the lead, not to this function.
 */
export async function deleteInstallation(args: {
    installationId: Id<"installations">;
}): Promise<void> {
    const installation = unwrap(
        await supabase
            .from("installations")
            .select("lead_id, scheduled_date, scheduled_end_date, completion_photo_paths")
            .eq("id", args.installationId)
            .single(),
        "Installation not found",
    ) as {
        lead_id: string;
        scheduled_date: string;
        scheduled_end_date: string;
        completion_photo_paths: string[] | null;
    };

    const photos = installation.completion_photo_paths ?? [];

    const { error } = await supabase
        .from("installations")
        .delete()
        .eq("id", args.installationId);
    if (error) throw toAppError(error, "Failed to delete the installation");

    // Only once the row is gone — deleting the objects first would strand the
    // row pointing at files that no longer exist if the delete then failed.
    if (photos.length) await removeFiles("photos", photos);

    await logActivity({
        leadId: installation.lead_id,
        action: "Installation deleted",
        details: describeSchedule(
            installation.scheduled_date,
            installation.scheduled_end_date,
        ),
        entityType: "installation",
    });
}

/** How many service tickets would be destroyed along with this installation. */
export async function countTicketsForInstallation(
    installationId: Id<"installations">,
): Promise<number> {
    const { count, error } = await supabase
        .from("service_tickets")
        .select("id", { count: "exact", head: true })
        .eq("installation_id", installationId);
    if (error) throw toAppError(error, "Failed to check service tickets");
    return count ?? 0;
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
