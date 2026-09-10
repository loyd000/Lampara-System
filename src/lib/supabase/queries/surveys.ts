/** Replaces convex/surveys.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type {
    LeadRow,
    PropertyRow,
    SurveyPhotoCategory,
    SurveyPhotoRow,
    SurveyRow,
    SurveyStatus,
} from "../database.types.ts";
import {
    buildPath,
    prepareUpload,
    removeFiles,
    signedUrlMap,
    uploadFile,
} from "../storage.ts";
import {
    displayName,
    toSurvey,
    toSurveyPhoto,
    type Id,
    type Survey,
    type SurveyForLead,
    type SurveyForSurveyor,
} from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";
import { notifyEvent } from "./notifications.ts";

type NameOnly = { name: string | null; email: string | null } | null;

export async function listSurveysForLead(
    leadId: Id<"leads">,
): Promise<SurveyForLead[]> {
    const rows = unwrap(
        await supabase
            .from("surveys")
            .select(
                "*, surveyor:users!surveys_assigned_surveyor_id_fkey(name, email), " +
                    "preparer:users!surveys_prepared_by_id_fkey(name, email), " +
                    "approver:users!surveys_approved_by_id_fkey(name, email), " +
                    "survey_photos(*)",
            )
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<
                (SurveyRow & {
                    surveyor: NameOnly;
                    preparer: NameOnly;
                    approver: NameOnly;
                    survey_photos: SurveyPhotoRow[] | null;
                })[]
            >(),
        "Failed to load inspections",
    );

    // One signing request for every photo across every inspection, rather than
    // one per inspection. Legacy `photo_paths` entries are signed in the same
    // batch so old and new photos cost the same single round trip.
    const urls = await signedUrlMap("photos", [
        ...rows.flatMap((row) => (row.survey_photos ?? []).map((p) => p.path)),
        ...rows.flatMap((row) => row.photo_paths ?? []),
    ]);

    return rows.map((row) => {
        const photos = (row.survey_photos ?? [])
            .slice()
            .sort((a, b) =>
                a.category === b.category
                    ? a.sort_order - b.sort_order
                    : a.category.localeCompare(b.category),
            )
            .map((p) => toSurveyPhoto(p, urls.get(p.path) ?? null));

        // Anything backfilled into `other` is already in `photos`; the flat
        // gallery only needs to cover rows the backfill has not reached.
        const slotted = new Set(photos.map((p) => p.path));

        return {
            ...toSurvey(row),
            surveyorName: displayName(row.surveyor),
            preparedByName: row.preparer ? displayName(row.preparer) : null,
            approvedByName: row.approver ? displayName(row.approver) : null,
            photos,
            photoUrls: (row.photo_paths ?? []).flatMap((path) => {
                if (slotted.has(path)) return [];
                const url = urls.get(path);
                return url ? [url] : [];
            }),
        };
    });
}

/**
 * Field technicians see only their own inspections; everyone else sees the
 * whole board. (RLS lets every member read surveys, so the narrowing stays an
 * explicit filter rather than a policy.)
 */
export async function listMyInspections(args: {
    status?: SurveyStatus;
} = {}): Promise<SurveyForSurveyor[]> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];

    const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle<{ role: string }>();

    let query = supabase
        .from("surveys")
        .select(
            "*, surveyor:users!surveys_assigned_surveyor_id_fkey(name, email), " +
                "leads(first_name, last_name, properties(address, city))",
        );

    if (profile?.role === "field") {
        query = query.eq("assigned_surveyor_id", auth.user.id);
    }
    if (args.status) query = query.eq("status", args.status);

    type Row = SurveyRow & {
        surveyor: NameOnly;
        leads:
            | (Pick<LeadRow, "first_name" | "last_name"> & {
                  properties: Pick<PropertyRow, "address" | "city">[] | null;
              })
            | null;
    };

    const rows = unwrap(
        await query.order("scheduled_at", { ascending: true }).returns<Row[]>(),
        "Failed to load surveys",
    );

    return rows.map((row) => {
        const property = row.leads?.properties?.[0] ?? null;
        return {
            ...toSurvey(row),
            leadName: row.leads ? `${row.leads.first_name} ${row.leads.last_name}` : "Unknown",
            address: property ? `${property.address}, ${property.city}` : null,
            surveyorName: displayName(row.surveyor),
        };
    });
}

export async function scheduleSurvey(args: {
    leadId: Id<"leads">;
    propertyId: Id<"properties">;
    assignedSurveyorId: Id<"users">;
    scheduledAt: string;
}): Promise<Id<"surveys">> {
    const survey = unwrap(
        await supabase
            .from("surveys")
            .insert({
                lead_id: args.leadId,
                property_id: args.propertyId,
                assigned_surveyor_id: args.assignedSurveyorId,
                scheduled_at: args.scheduledAt,
                status: "scheduled",
            })
            .select("id")
            .single(),
        "Failed to schedule survey",
    ) as { id: string };

    await advanceLeadStage(args.leadId, "survey_scheduled");

    await logActivity({
        leadId: args.leadId,
        action: "Site ocular inspection scheduled",
        details: `Scheduled for ${new Date(args.scheduledAt).toLocaleString()}`,
        entityType: "survey",
        entityId: survey.id,
        touchLead: false,
    });

    await notifyEvent({
        event: "inspection_scheduled",
        leadId: args.leadId,
        recipientUserIds: [args.assignedSurveyorId],
        meta: { scheduledAt: new Date(args.scheduledAt).toLocaleString() },
    });

    return survey.id;
}

/**
 * Saves a partial Site Ocular Report.
 *
 * The form is long and filled over a whole visit, often on a phone with poor
 * signal, so every section saves on its own and nothing is required. The patch
 * is camelCase in and snake_case out, and only keys actually present are
 * written — so two people editing different sections cannot overwrite each
 * other's work.
 */
export type SurveyReportPatch = Partial<
    Pick<
        Survey,
        | "inspectionDate"
        | "latitude"
        | "longitude"
        | "usageHabit"
        | "monthlyConsumptionKwh"
        | "monthlyBillPhp"
        | "applianceAircon"
        | "applianceAirconNote"
        | "applianceTv"
        | "applianceTvNote"
        | "applianceRef"
        | "applianceRefNote"
        | "applianceWasher"
        | "applianceWasherNote"
        | "applianceOthers"
        | "recommendedVehicle"
        | "roofType"
        | "roofTypeNote"
        | "supportPurlins"
        | "roofAreaSqm"
        | "roofWidthM"
        | "roofLengthM"
        | "roofAccess"
        | "mounting"
        | "roofOrientation"
        | "estDcRunM"
        | "estAcRunM"
        | "meterPhase"
        | "transformerCount"
        | "meterKind"
        | "meterForm"
        | "serviceDisconnect"
        | "serviceDisconnectRating"
        | "grounding"
        | "mainDistributionPanel"
        | "cbSizeRating"
        | "wireSize"
        | "connectionType"
        | "floorCount"
        | "systemCapacity"
        | "packageType"
        | "batteryOption"
        | "panelOption"
        | "reportNotes"
        | "estimatedSystemSizeKw"
        | "shadingNotes"
        | "roofAgeYears"
        | "additionalNotes"
    >
>;

const REPORT_COLUMNS: Record<keyof SurveyReportPatch, string> = {
    inspectionDate: "inspection_date",
    latitude: "latitude",
    longitude: "longitude",
    usageHabit: "usage_habit",
    monthlyConsumptionKwh: "monthly_consumption_kwh",
    monthlyBillPhp: "monthly_bill_php",
    applianceAircon: "appliance_aircon",
    applianceAirconNote: "appliance_aircon_note",
    applianceTv: "appliance_tv",
    applianceTvNote: "appliance_tv_note",
    applianceRef: "appliance_ref",
    applianceRefNote: "appliance_ref_note",
    applianceWasher: "appliance_washer",
    applianceWasherNote: "appliance_washer_note",
    applianceOthers: "appliance_others",
    recommendedVehicle: "recommended_vehicle",
    roofType: "roof_type",
    roofTypeNote: "roof_type_note",
    supportPurlins: "support_purlins",
    roofAreaSqm: "roof_area_sqm",
    roofWidthM: "roof_width_m",
    roofLengthM: "roof_length_m",
    roofAccess: "roof_access",
    mounting: "mounting",
    roofOrientation: "roof_orientation",
    estDcRunM: "est_dc_run_m",
    estAcRunM: "est_ac_run_m",
    meterPhase: "meter_phase",
    transformerCount: "transformer_count",
    meterKind: "meter_kind",
    meterForm: "meter_form",
    serviceDisconnect: "service_disconnect",
    serviceDisconnectRating: "service_disconnect_rating",
    grounding: "grounding",
    mainDistributionPanel: "main_distribution_panel",
    cbSizeRating: "cb_size_rating",
    wireSize: "wire_size",
    connectionType: "connection_type",
    floorCount: "floor_count",
    systemCapacity: "system_capacity",
    packageType: "package_type",
    batteryOption: "battery_option",
    panelOption: "panel_option",
    reportNotes: "report_notes",
    estimatedSystemSizeKw: "estimated_system_size_kw",
    shadingNotes: "shading_notes",
    roofAgeYears: "roof_age_years",
    additionalNotes: "additional_notes",
};

export async function saveSurveyReport(args: {
    surveyId: Id<"surveys">;
    patch: SurveyReportPatch;
}): Promise<void> {
    const update: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(REPORT_COLUMNS)) {
        if (!(key in args.patch)) continue;
        const value = args.patch[key as keyof SurveyReportPatch];
        // A blank field on the form means "not recorded", not an empty string —
        // every enumerated column has a CHECK that rejects ''.
        update[column] = value === undefined || value === "" ? null : value;
    }
    if (!Object.keys(update).length) return;

    const { error } = await supabase
        .from("surveys")
        // Keys come from REPORT_COLUMNS, so every one is a real column; the
        // cast is only to satisfy the generated Update shape.
        .update(update as Partial<SurveyRow>)
        .eq("id", args.surveyId);
    if (error) throw toAppError(error, "Failed to save the report");
}

// ─── Report photos ────────────────────────────────────────────────────────

/**
 * Uploads photos into one slot of the report.
 *
 * Each file is uploaded and recorded one at a time: a partial failure leaves
 * the successful ones both stored and visible, rather than rolling a whole
 * batch back on someone standing on a roof with one bar of signal.
 */
export async function addSurveyPhotos(args: {
    surveyId: Id<"surveys">;
    category: SurveyPhotoCategory;
    files: File[];
}): Promise<number> {
    if (!args.files.length) return 0;

    const { data: auth } = await supabase.auth.getUser();

    const existing = unwrap(
        await supabase
            .from("survey_photos")
            .select("sort_order")
            .eq("survey_id", args.surveyId)
            .eq("category", args.category)
            .order("sort_order", { ascending: false })
            .limit(1),
        "Failed to read existing photos",
    ) as { sort_order: number }[];

    let next = (existing[0]?.sort_order ?? -1) + 1;
    let saved = 0;

    for (const original of args.files) {
        // Shrunk to a 1600px WebP before it is named or uploaded — a report can
        // carry thirty photos, and a technician uploads them from the site.
        const file = await prepareUpload(original);
        const path = buildPath("surveys", args.surveyId, file);
        await uploadFile("photos", path, file);

        const { error } = await supabase.from("survey_photos").insert({
            survey_id: args.surveyId,
            category: args.category,
            path,
            sort_order: next,
            created_by: auth.user?.id ?? null,
        });
        if (error) {
            // The object is in the bucket but nothing references it.
            await removeFiles("photos", [path]);
            if (saved === 0) throw toAppError(error, "Failed to save photo");
            break;
        }
        next += 1;
        saved += 1;
    }

    return saved;
}

export async function deleteSurveyPhoto(args: {
    photoId: string;
    path: string;
}): Promise<void> {
    const { error } = await supabase.from("survey_photos").delete().eq("id", args.photoId);
    if (error) throw toAppError(error, "Failed to remove photo");
    // Best effort; an orphaned object is harmless next to a broken thumbnail.
    await removeFiles("photos", [args.path]);
}

export async function updateSurveyPhotoCaption(args: {
    photoId: string;
    caption: string;
}): Promise<void> {
    const { error } = await supabase
        .from("survey_photos")
        .update({ caption: args.caption.trim() || null })
        .eq("id", args.photoId);
    if (error) throw toAppError(error, "Failed to save caption");
}

/**
 * Marks the visit done, or undoes that.
 *
 * Completion is `completed_at`, not a status — 0012 removed the approve
 * handoff and left inspections with no terminal state, which is why the field
 * dashboard could never move one out of its open list. The RPCs (0028) gate on
 * `can_edit_survey`, so the assigned technician can record their own visit.
 */
export async function setSurveyCompleted(args: {
    surveyId: Id<"surveys">;
    completed: boolean;
}): Promise<void> {
    const survey = unwrap(
        await supabase.from("surveys").select("lead_id").eq("id", args.surveyId).single(),
        "Survey not found",
    ) as { lead_id: string };

    const { error } = await supabase.rpc(
        args.completed ? "complete_survey_report" : "reopen_survey_report",
        { p_survey_id: args.surveyId },
    );
    if (error) {
        throw toAppError(
            error,
            args.completed ? "Failed to complete inspection" : "Failed to reopen inspection",
        );
    }

    await logActivity({
        leadId: survey.lead_id,
        action: args.completed
            ? "Ocular inspection completed"
            : "Ocular inspection reopened",
        entityType: "survey",
        entityId: args.surveyId,
    });
}

export async function cancelSurvey(args: {
    surveyId: Id<"surveys">;
    reason?: string;
}): Promise<void> {
    const survey = unwrap(
        await supabase.from("surveys").select("lead_id").eq("id", args.surveyId).single(),
        "Survey not found",
    ) as { lead_id: string };

    const { error } = await supabase
        .from("surveys")
        .update({ status: "cancelled" })
        .eq("id", args.surveyId);
    if (error) throw toAppError(error, "Failed to cancel survey");

    await logActivity({
        leadId: survey.lead_id,
        action: "Ocular inspection cancelled",
        details: args.reason,
        entityType: "survey",
        entityId: args.surveyId,
    });
}

/**
 * Hard-deletes a report — a mistaken or duplicate entry, not a called-off
 * visit (that's `cancelSurvey`). Restricted to superadmin/admin by
 * `surveys_delete`; `survey_photos` cascades at the DB level, but the
 * storage objects those rows pointed at need explicit best-effort cleanup.
 */
export async function deleteSurvey(args: { surveyId: Id<"surveys"> }): Promise<void> {
    const survey = unwrap(
        await supabase
            .from("surveys")
            .select("lead_id, photo_paths")
            .eq("id", args.surveyId)
            .single(),
        "Survey not found",
    ) as { lead_id: string; photo_paths: string[] | null };

    const { data: photoRows } = await supabase
        .from("survey_photos")
        .select("path")
        .eq("survey_id", args.surveyId);

    const paths = [
        ...(survey.photo_paths ?? []),
        ...((photoRows ?? []) as { path: string }[]).map((p) => p.path),
    ];

    const { error } = await supabase.from("surveys").delete().eq("id", args.surveyId);
    if (error) throw toAppError(error, "Failed to delete inspection report");

    // Best-effort: the row is already gone, so a storage hiccup here should
    // not surface as a failed delete.
    await removeFiles("photos", paths);

    await logActivity({
        leadId: survey.lead_id,
        action: "Ocular inspection report deleted",
        entityType: "survey",
        entityId: args.surveyId,
    });
}
