/** Replaces convex/leads.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import { removeFiles } from "../storage.ts";
import { notifyEvent } from "./notifications.ts";
import type {
    ActivityLogRow,
    LeadRow,
    LeadStage,
    PackageDesignType,
    PackageRow,
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

/** What one search returns — a picker's worth, not a page's worth. */
const LEAD_SEARCH_LIMIT = 20;

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
 * Finishing a piece of work calls this to move the lead to the stage that
 * work represents, and by default the move is forward-only: booking a repeat
 * inspection for a live customer, or re-approving an old quote, leaves the
 * stage where it is. A lead that has been cancelled is never moved
 * automatically either — reviving one is a decision, not a side effect.
 *
 * `allowBackwards` is for the explicit stage control in the UI, where the user
 * is choosing the stage outright and may well be correcting a mistake.
 *
 * Resolves to the previous stage, or null when nothing moved.
 */
export async function advanceLeadStage(
    leadId: Id<"leads">,
    stage: LeadStage,
    options: { allowBackwards?: boolean; cancelledReason?: string } = {},
): Promise<LeadStage | null> {
    const { data, error } = await supabase.rpc("advance_lead_stage", {
        p_lead_id: leadId,
        p_stage: stage,
        p_allow_backwards: options.allowBackwards ?? false,
        p_cancelled_reason: options.cancelledReason ?? null,
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
    properties: Pick<PropertyRow, "address" | "city" | "state" | "property_type">[] | null;
    assignedRep: NameOnly;
};

type ApprovedQuoteRow = {
    lead_id: string;
    quote_items: { packages: Pick<PackageRow, "design_type"> | null }[] | null;
};

/**
 * The property and rep embed shared by every list of leads that shows more
 * than a bare name.
 *
 * Note what is *not* embedded here: quotes. This used to carry
 * `quotes(status, quote_items(packages(design_type)))`, which fetched every
 * quote version of every lead, with every line item and each item's package,
 * to render one "Hybrid" label per row — and then discarded all but the
 * approved one client-side. A lead with 5 quote versions of 20 lines was 100
 * embedded rows, times up to 500 leads.
 */
const ENRICHED_LEAD_SELECT =
    "*, properties(address, city, state, property_type), " +
    "assignedRep:users!leads_assigned_sales_rep_id_fkey(name, email)";

/**
 * Design types per lead, from approved quotes only.
 *
 * A separate query rather than a filtered embed. Filtering an embedded
 * resource narrows the embedded rows, while `!inner` additionally restricts
 * which *parents* come back — and getting that distinction wrong here would
 * silently hide every lead without an approved quote from the main list. That
 * is not a behaviour worth taking on trust, so the leads query is left alone
 * and this runs alongside it: it cannot drop a lead, because it never touches
 * the lead query.
 *
 * Cheap despite being a second request: it runs in parallel, and approved
 * quotes are at most one per lead and only for leads that got that far.
 */
async function fetchApprovedDesignTypes(): Promise<Map<string, PackageDesignType[]>> {
    const rows = unwrap(
        await supabase
            .from("quotes")
            .select("lead_id, quote_items(packages(design_type))")
            .eq("status", "approved")
            .returns<ApprovedQuoteRow[]>(),
        "Failed to load quote design types",
    );

    const byLead = new Map<string, PackageDesignType[]>();
    for (const row of rows) {
        const designTypes = [
            ...new Set(
                (row.quote_items ?? [])
                    .map((item) => item.packages?.design_type)
                    .filter((dt): dt is PackageDesignType => Boolean(dt)),
            ),
        ];
        if (designTypes.length) byLead.set(row.lead_id, designTypes);
    }
    return byLead;
}

function toEnrichedLead(
    row: EnrichedRow,
    designTypesByLead: Map<string, PackageDesignType[]>,
): EnrichedLead {
    const property = row.properties?.[0] ?? null;
    return {
        ...toLead(row),
        assignedRepName: row.assignedRep ? displayName(row.assignedRep) : null,
        property: property
            ? {
                  address: property.address,
                  city: property.city,
                  state: property.state,
                  propertyType: property.property_type,
              }
            : null,
        designTypes: designTypesByLead.get(row.id) ?? [],
    };
}

/**
 * Leads with their first property, the assigned rep's name, and the design
 * type(s) of any approved quote.
 *
 * Two requests in parallel — the leads themselves, and the design types (see
 * `fetchApprovedDesignTypes`). Same round-trip latency as one, a fraction of
 * the rows.
 */
export async function listEnrichedLeads(
    filters: {
        stage?: LeadStage;
        assignedSalesRepId?: Id<"users">;
        limit?: number;
    } = {},
): Promise<PagedLeads<EnrichedLead>> {
    const limit = filters.limit ?? LEAD_LIST_LIMIT;

    let query = supabase
        .from("leads")
        .select(
            ENRICHED_LEAD_SELECT,
            // Exact count of the filtered set, so the caller can tell whether
            // the limit actually cut anything off.
            { count: "exact" },
        );

    if (filters.stage) query = query.eq("stage", filters.stage);
    if (filters.assignedSalesRepId) {
        query = query.eq("assigned_sales_rep_id", filters.assignedSalesRepId);
    }

    const [result, designTypesByLead] = await Promise.all([
        query
            .order("last_activity_at", { ascending: false })
            .limit(limit)
            .returns<EnrichedRow[]>(),
        fetchApprovedDesignTypes(),
    ]);

    const rows = unwrap(result, "Failed to load leads");
    const total = result.count ?? rows.length;

    return {
        leads: rows.map((row) => toEnrichedLead(row, designTypesByLead)),
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

/**
 * Case-insensitive match across name, email, phone — and location.
 *
 * Both sides search one `search_text` column (see 0026) rather than OR-ing
 * several columns together. That is what lets the trigram index actually get
 * used, and it means a term can span what used to be a column boundary:
 * "Juan Dela" matches `first_name = 'Juan'` + `last_name = 'Dela Cruz'`, and
 * "Agusan del Norte" matches across a property's city and province.
 *
 * Location can't be part of the leads predicate — it lives on `properties` —
 * so matching lead ids are resolved first and folded into the same `or()` as
 * the name match. Two round trips, both plain top-level filters: the previous
 * version used an embedded `referencedTable` filter for the location half,
 * which is a far less trodden path in PostgREST and appears never to have
 * matched anything.
 */
export async function searchLeads(q: string): Promise<EnrichedLead[]> {
    const term = q.trim();
    if (term.length < 2) return [];

    // `%` and `_` are LIKE wildcards and `,()` are `or()` filter syntax —
    // strip them so a stray character can neither widen the search nor break
    // the expression.
    const pattern = `%${term.replace(/[%_,()]/g, "")}%`;

    const propertyRows = unwrap(
        await supabase
            .from("properties")
            .select("lead_id")
            .ilike("search_text", pattern)
            .limit(LEAD_SEARCH_LIMIT)
            .returns<{ lead_id: string }[]>(),
        "Search failed",
    );

    const leadIds = [...new Set(propertyRows.map((row) => row.lead_id))];
    const filter = leadIds.length
        ? `search_text.ilike.${pattern},id.in.(${leadIds.join(",")})`
        : `search_text.ilike.${pattern}`;

    const [result, designTypesByLead] = await Promise.all([
        supabase
            .from("leads")
            .select(ENRICHED_LEAD_SELECT)
            .or(filter)
            .order("last_activity_at", { ascending: false })
            .limit(LEAD_SEARCH_LIMIT)
            .returns<EnrichedRow[]>(),
        fetchApprovedDesignTypes(),
    ]);

    const rows = unwrap(result, "Search failed");
    return rows.map((row) => toEnrichedLead(row, designTypesByLead));
}

// ─── Mutations ────────────────────────────────────────────────────────────

export type CreateLeadArgs = {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
    referredBy?: string;
    notes?: string;
    assignedSalesRepId?: Id<"users">;
    /** Composed from the granular fields below — see src/lib/ph-address.ts. */
    address: string;
    city: string;
    state: string;
    zip: string;
    propertyType: PropertyType;
    houseUnitBlockLot?: string;
    streetName?: string;
    subdivision?: string;
    barangay?: string;
    cityMunicipality?: string;
    province?: string;
    zipCode?: string;
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
        p_address: args.address,
        p_city: args.city,
        p_state: args.state,
        p_zip: args.zip,
        p_property_type: args.propertyType,
        p_email: args.email ?? null,
        p_referred_by: args.referredBy ?? null,
        p_notes: args.notes ?? null,
        p_assigned_sales_rep_id: args.assignedSalesRepId ?? null,
        p_house_unit_block_lot: args.houseUnitBlockLot ?? null,
        p_street_name: args.streetName ?? null,
        p_subdivision: args.subdivision ?? null,
        p_barangay: args.barangay ?? null,
        p_city_municipality: args.cityMunicipality ?? null,
        p_province: args.province ?? null,
        p_zip_code: args.zipCode ?? null,
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
    // The user picked this stage by hand, so it may legitimately go backwards.
    const previous = await advanceLeadStage(args.id, args.stage, {
        allowBackwards: true,
        cancelledReason: args.cancelledReason,
    });
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
    houseUnitBlockLot?: string;
    streetName?: string;
    subdivision?: string;
    barangay?: string;
    cityMunicipality?: string;
    province?: string;
    zipCode?: string;
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
            ...(fields.houseUnitBlockLot !== undefined && {
                house_unit_block_lot: fields.houseUnitBlockLot || null,
            }),
            ...(fields.streetName !== undefined && { street_name: fields.streetName || null }),
            ...(fields.subdivision !== undefined && { subdivision: fields.subdivision || null }),
            ...(fields.barangay !== undefined && { barangay: fields.barangay || null }),
            ...(fields.cityMunicipality !== undefined && {
                city_municipality: fields.cityMunicipality || null,
            }),
            ...(fields.province !== undefined && { province: fields.province || null }),
            ...(fields.zipCode !== undefined && { zip_code: fields.zipCode || null }),
        })
        .eq("id", propertyId);

    if (error) throw toAppError(error, "Failed to update property");
}

/**
 * Deletes a lead. Properties, surveys, quotes, contracts,
 * installations and log rows all cascade.
 *
 * Storage does not cascade, so the object paths are collected first — once the
 * rows are gone nothing points at the files any more and they would sit in the
 * buckets forever.
 */
export async function deleteLead(args: { id: Id<"leads"> }): Promise<void> {
    const [surveys, surveyPhotos, installations, contracts, leadFiles] =
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
        ...((contracts.data ?? []) as { document_path: string | null }[]).flatMap(
            (row) => (row.document_path ? [row.document_path] : []),
        ),
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
