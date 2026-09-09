/** Replaces convex/leads.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import { removeFiles } from "../storage.ts";
import { notifyEvent } from "./notifications.ts";
import type {
    ActivityLogRow,
    LeadRow,
    LeadSource,
    LeadStage,
    PropertyRow,
    PropertyType,
} from "../database.types.ts";
import {
    displayName,
    toActivityLogEntry,
    toLead,
    toProperty,
    type ActivityEntry,
    type EnrichedLead,
    type Id,
    type Lead,
    type LeadDetail,
    type Property,
} from "../types.ts";

const LEAD_COLUMNS = "*";

/**
 * How many leads a list view will fetch.
 *
 * Every list query is explicitly bounded. An unbounded `select` is not just a
 * scaling problem — if PostgREST's `max-rows` is ever configured, it truncates
 * without erroring, and a table that quietly stops at row N looks identical to
 * one that has N rows. Asking for a bounded page plus an exact count makes the
 * truncation visible instead, so the UI can say so.
 */
export const LEAD_LIST_LIMIT = 500;

export type PagedLeads<T> = {
    leads: T[];
    /** Total matching rows, ignoring the limit. */
    total: number;
    /** True when `total` exceeds what was fetched. */
    truncated: boolean;
};

type NameOnly = { name: string | null; email: string | null } | null;

/**
 * Appends to the audit trail and bumps the lead's `last_activity_at`.
 *
 * Convex did both inside one transactional mutation; the SQL function
 * `log_lead_activity` keeps that atomicity now that the writes come from the
 * browser. A failure here is logged but never surfaced — losing an audit line
 * should not make the user think their actual edit failed.
 */
export async function logActivity(args: {
    leadId: Id<"leads">;
    action: string;
    details?: string;
    entityType?: string;
    entityId?: string;
    touchLead?: boolean;
}): Promise<void> {
    const { error } = await supabase.rpc("log_lead_activity", {
        p_lead_id: args.leadId,
        p_action: args.action,
        p_details: args.details ?? null,
        p_entity_type: args.entityType ?? null,
        p_entity_id: args.entityId ?? null,
        p_touch_lead: args.touchLead ?? true,
    });
    if (error) console.warn("Failed to write activity log entry:", error.message);
}

/**
 * Moves a lead to a new stage.
 *
 * Every stage change in the app goes through this. The `advance_lead_stage`
 * function writes only `stage`, `last_activity_at` and `converted_at`, and
 * re-checks the caller's role server-side — which is what stops a field
 * technician from editing the rest of the lead as a side effect of finishing
 * their own work.
 *
 * `onlyFrom` makes the move conditional on the lead's current stage, so a
 * re-sent quote or a late permit cannot drag a further-along lead backwards.
 *
 * Resolves to the previous stage, or null when nothing moved.
 */
export async function advanceLeadStage(
    leadId: Id<"leads">,
    stage: LeadStage,
    onlyFrom?: LeadStage[],
    cancelledReason?: string,
): Promise<LeadStage | null> {
    const { data, error } = await supabase.rpc("advance_lead_stage", {
        p_lead_id: leadId,
        p_stage: stage,
        p_only_from: onlyFrom ?? null,
        p_cancelled_reason: cancelledReason ?? null,
    });
    if (error) throw toAppError(error, "Failed to update stage");
    return data ?? null;
}

// ─── Queries ──────────────────────────────────────────────────────────────

/**
 * Sales reps see only their own leads. That used to be a post-filter in the
 * Convex handler; it is now the `leads_select` RLS policy, so this function just
 * applies the caller's explicit filters.
 */
export async function listLeads(
    filters: {
        stage?: LeadStage;
        assignedSalesRepId?: Id<"users">;
        /** Defaults to LEAD_LIST_LIMIT; dashboards pass something much smaller. */
        limit?: number;
    } = {},
): Promise<Lead[]> {
    let query = supabase.from("leads").select(LEAD_COLUMNS);

    if (filters.stage) query = query.eq("stage", filters.stage);
    if (filters.assignedSalesRepId) {
        query = query.eq("assigned_sales_rep_id", filters.assignedSalesRepId);
    }

    const rows = unwrap(
        await query
            .order("last_activity_at", { ascending: false })
            .limit(filters.limit ?? LEAD_LIST_LIMIT),
        "Failed to load leads",
    );
    return (rows as LeadRow[]).map(toLead);
}

type EnrichedRow = LeadRow & {
    properties: Pick<PropertyRow, "address" | "city" | "state">[] | null;
    assignedRep: NameOnly;
};

/**
 * Leads with their first property and the assigned rep's name.
 *
 * The Convex version issued one query per lead for each; PostgREST resolves both
 * as embedded resources in a single request.
 */
export async function listEnrichedLeads(
    filters: {
        stage?: LeadStage;
        assignedSalesRepId?: Id<"users">;
        source?: LeadSource;
        limit?: number;
    } = {},
): Promise<PagedLeads<EnrichedLead>> {
    const limit = filters.limit ?? LEAD_LIST_LIMIT;

    let query = supabase
        .from("leads")
        .select(
            "*, properties(address, city, state), " +
                "assignedRep:users!leads_assigned_sales_rep_id_fkey(name, email)",
            // Exact count of the filtered set, so the caller can tell whether
            // the limit actually cut anything off.
            { count: "exact" },
        );

    if (filters.stage) query = query.eq("stage", filters.stage);
    if (filters.source) query = query.eq("source", filters.source);
    if (filters.assignedSalesRepId) {
        query = query.eq("assigned_sales_rep_id", filters.assignedSalesRepId);
    }

    const result = await query
        .order("last_activity_at", { ascending: false })
        .limit(limit)
        .returns<EnrichedRow[]>();

    const rows = unwrap(result, "Failed to load leads");
    const total = result.count ?? rows.length;

    return {
        leads: rows.map((row) => ({
            ...toLead(row),
            assignedRepName: row.assignedRep ? displayName(row.assignedRep) : null,
            property: row.properties?.[0] ?? null,
        })),
        total,
        truncated: total > rows.length,
    };
}

export async function getLeadById(id: Id<"leads">): Promise<LeadDetail | null> {
    const { data, error } = await supabase
        .from("leads")
        .select("*, assignedRep:users!leads_assigned_sales_rep_id_fkey(name, email)")
        .eq("id", id)
        .maybeSingle<LeadRow & { assignedRep: NameOnly }>();

    if (error) throw toAppError(error, "Failed to load lead");
    if (!data) return null;

    return {
        ...toLead(data),
        assignedRepName: data.assignedRep
            ? (data.assignedRep.name ?? data.assignedRep.email ?? null)
            : null,
    };
}

export async function getProperties(leadId: Id<"leads">): Promise<Property[]> {
    const rows = unwrap(
        await supabase
            .from("properties")
            .select("*")
            .eq("lead_id", leadId)
            .order("created_at"),
        "Failed to load property",
    );
    return (rows as PropertyRow[]).map(toProperty);
}

export async function getActivity(leadId: Id<"leads">): Promise<ActivityEntry[]> {
    const rows = unwrap(
        await supabase
            .from("activity_log")
            .select("*, users(name, email)")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<(ActivityLogRow & { users: NameOnly })[]>(),
        "Failed to load activity",
    );

    return rows.map((row) => ({
        ...toActivityLogEntry(row),
        userName: displayName(row.users),
    }));
}

/** Case-insensitive match across name, email and phone. Capped like Convex's. */
export async function searchLeads(q: string): Promise<Lead[]> {
    const term = q.trim();
    if (term.length < 2) return [];

    const pattern = `%${term.replace(/[%_,()]/g, "")}%`;
    const rows = unwrap(
        await supabase
            .from("leads")
            .select(LEAD_COLUMNS)
            .or(
                `first_name.ilike.${pattern},last_name.ilike.${pattern},` +
                    `email.ilike.${pattern},phone.ilike.${pattern}`,
            )
            .order("last_activity_at", { ascending: false })
            .limit(20),
        "Search failed",
    );
    return (rows as LeadRow[]).map(toLead);
}

// ─── Mutations ────────────────────────────────────────────────────────────

export type CreateLeadArgs = {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    source: LeadSource;
    referredBy?: string;
    notes?: string;
    assignedSalesRepId?: Id<"users">;
    address: string;
    city: string;
    state: string;
    zip: string;
    propertyType: PropertyType;
};

/**
 * Creates the lead, its first property and the opening audit entry.
 *
 * One RPC, so all three land or none do. The previous version issued three
 * separate requests and undid the lead by hand if the property insert failed —
 * which could not work for an `office` user, since `leads_delete` does not
 * grant them that.
 *
 * The function also decides the assignment: a sales rep always owns what they
 * create, which the insert policy requires anyway.
 */
export async function createLead(args: CreateLeadArgs): Promise<Id<"leads">> {
    const { data, error } = await supabase.rpc("create_lead_with_property", {
        p_first_name: args.firstName,
        p_last_name: args.lastName,
        p_phone: args.phone,
        p_source: args.source,
        p_address: args.address,
        p_city: args.city,
        p_state: args.state,
        p_zip: args.zip,
        p_property_type: args.propertyType,
        p_email: args.email ?? null,
        p_referred_by: args.referredBy ?? null,
        p_notes: args.notes ?? null,
        p_assigned_sales_rep_id: args.assignedSalesRepId ?? null,
    });

    if (error) throw toAppError(error, "Failed to create lead");
    const leadId = data as string;

    if (args.assignedSalesRepId) {
        await notifyEvent({
            event: "lead_assigned",
            leadId,
            recipientUserIds: [args.assignedSalesRepId],
        });
    }

    return leadId;
}

/** Omitted fields stay unchanged; null explicitly clears a nullable field. */
export async function updateLead(args: {
    id: Id<"leads">;
    firstName?: string;
    lastName?: string;
    phone?: string;
    email?: string | null;
    source?: LeadSource;
    referredBy?: string | null;
    notes?: string | null;
    assignedSalesRepId?: Id<"users"> | null;
}): Promise<void> {
    const { id, ...fields } = args;

    // Fetch the current assignee before overwriting it — the only way to know
    // whether this update is actually a reassignment worth notifying about.
    let previousRepId: string | null = null;
    if (fields.assignedSalesRepId !== undefined) {
        const { data: current } = await supabase
            .from("leads")
            .select("assigned_sales_rep_id")
            .eq("id", id)
            .maybeSingle<{ assigned_sales_rep_id: string | null }>();
        previousRepId = current?.assigned_sales_rep_id ?? null;
    }

    const { error } = await supabase
        .from("leads")
        .update({
            ...(fields.firstName !== undefined && { first_name: fields.firstName }),
            ...(fields.lastName !== undefined && { last_name: fields.lastName }),
            ...(fields.phone !== undefined && { phone: fields.phone }),
            ...(fields.email !== undefined && { email: fields.email || null }),
            ...(fields.source !== undefined && { source: fields.source }),
            ...(fields.referredBy !== undefined && { referred_by: fields.referredBy || null }),
            ...(fields.notes !== undefined && { notes: fields.notes || null }),
            ...(fields.assignedSalesRepId !== undefined && {
                assigned_sales_rep_id: fields.assignedSalesRepId || null,
            }),
            last_activity_at: new Date().toISOString(),
        })
        .eq("id", id);

    if (error) throw toAppError(error, "Failed to update lead");

    await logActivity({
        leadId: id,
        action: "Lead details updated",
        entityType: "lead",
        entityId: id,
        touchLead: false,
    });

    if (
        fields.assignedSalesRepId !== undefined &&
        fields.assignedSalesRepId &&
        fields.assignedSalesRepId !== previousRepId
    ) {
        await notifyEvent({
            event: "lead_assigned",
            leadId: id,
            recipientUserIds: [fields.assignedSalesRepId],
        });
    }
}

export async function updateStage(args: {
    id: Id<"leads">;
    stage: LeadStage;
    /** Required in practice when `stage` is "cancelled"; the UI prompts for it. */
    cancelledReason?: string;
}): Promise<void> {
    const previous = await advanceLeadStage(args.id, args.stage, undefined, args.cancelledReason);
    if (!previous) throw new Error("Lead not found");
    if (previous === args.stage) return;

    await logActivity({
        leadId: args.id,
        action:
            args.stage === "cancelled" && args.cancelledReason
                ? `Stage changed: ${previous} → cancelled — ${args.cancelledReason}`
                : `Stage changed: ${previous} → ${args.stage}`,
        entityType: "lead",
        entityId: args.id,
        touchLead: false,
    });
}

/** Omitted fields stay unchanged; null explicitly clears the optional notes. */
export async function updateProperty(args: {
    propertyId: Id<"properties">;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    propertyType?: PropertyType;
    notes?: string | null;
}): Promise<void> {
    const { propertyId, ...fields } = args;

    const { error } = await supabase
        .from("properties")
        .update({
            ...(fields.address !== undefined && { address: fields.address }),
            ...(fields.city !== undefined && { city: fields.city }),
            ...(fields.state !== undefined && { state: fields.state }),
            ...(fields.zip !== undefined && { zip: fields.zip }),
            ...(fields.propertyType !== undefined && { property_type: fields.propertyType }),
            ...(fields.notes !== undefined && { notes: fields.notes || null }),
        })
        .eq("id", propertyId);

    if (error) throw toAppError(error, "Failed to update property");
}

/**
 * Deletes a lead. Properties, surveys, quotes, contracts, permits,
 * installations and log rows all cascade.
 *
 * Storage does not cascade, so the object paths are collected first — once the
 * rows are gone nothing points at the files any more and they would sit in the
 * buckets forever.
 */
export async function deleteLead(args: { id: Id<"leads"> }): Promise<void> {
    const [surveys, surveyPhotos, installations, contracts, permits, leadFiles] =
        await Promise.all([
            supabase.from("surveys").select("photo_paths").eq("lead_id", args.id),
            // Slotted report photos, which is where every inspection photo has
            // lived since 0009 — `photo_paths` above only still holds pre-0009
            // rows.
            supabase
                .from("survey_photos")
                .select("path, surveys!inner(lead_id)")
                .eq("surveys.lead_id", args.id),
            supabase
                .from("installations")
                .select("completion_photo_paths")
                .eq("lead_id", args.id),
            supabase.from("contracts").select("document_path").eq("lead_id", args.id),
            supabase.from("permits").select("document_path").eq("lead_id", args.id),
            supabase.from("lead_files").select("path, kind").eq("lead_id", args.id),
        ]);

    const attachments = (leadFiles.data ?? []) as { path: string; kind: string }[];

    const photoPaths = [
        ...((surveys.data ?? []) as { photo_paths: string[] | null }[]).flatMap(
            (s) => s.photo_paths ?? [],
        ),
        ...((surveyPhotos.data ?? []) as { path: string }[]).map((p) => p.path),
        ...(
            (installations.data ?? []) as { completion_photo_paths: string[] | null }[]
        ).flatMap((i) => i.completion_photo_paths ?? []),
        ...attachments.filter((f) => f.kind === "photo").map((f) => f.path),
    ];

    const documentPaths = [
        ...[
            ...((contracts.data ?? []) as { document_path: string | null }[]),
            ...((permits.data ?? []) as { document_path: string | null }[]),
        ].flatMap((row) => (row.document_path ? [row.document_path] : [])),
        ...attachments.filter((f) => f.kind === "document").map((f) => f.path),
    ];

    const { error } = await supabase.from("leads").delete().eq("id", args.id);
    if (error) throw toAppError(error, "Failed to delete lead");

    // Best-effort: the lead is already gone, so a storage hiccup here should
    // not surface as a failed delete.
    await Promise.all([
        removeFiles("photos", photoPaths),
        removeFiles("documents", documentPaths),
    ]);
}
