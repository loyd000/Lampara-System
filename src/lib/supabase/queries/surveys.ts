/** Replaces convex/surveys.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { LeadRow, PropertyRow, RoofType, SurveyRow, SurveyStatus } from "../database.types.ts";
import { removeFiles, signedUrlMap, uploadFiles } from "../storage.ts";
import {
    displayName,
    toSurvey,
    type Id,
    type SurveyForLead,
    type SurveyForSurveyor,
} from "../types.ts";
import { advanceLeadStage, logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

export async function listSurveysForLead(
    leadId: Id<"leads">,
): Promise<SurveyForLead[]> {
    const rows = unwrap(
        await supabase
            .from("surveys")
            .select("*, surveyor:users!surveys_assigned_surveyor_id_fkey(name, email)")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<(SurveyRow & { surveyor: NameOnly })[]>(),
        "Failed to load surveys",
    );

    // One signing request for every photo across every survey, rather than one
    // per survey.
    const urls = await signedUrlMap(
        "photos",
        rows.flatMap((row) => row.photo_paths ?? []),
    );

    return rows.map((row) => ({
        ...toSurvey(row),
        surveyorName: displayName(row.surveyor),
        photoUrls: (row.photo_paths ?? []).flatMap((path) => {
            const url = urls.get(path);
            return url ? [url] : [];
        }),
    }));
}

/**
 * Surveyors see only their own jobs; everyone else sees the whole board.
 * (The Convex handler branched on role here — RLS lets every member read
 * surveys, so the surveyor narrowing stays an explicit filter.)
 */
export async function listSurveysForSurveyor(args: {
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

    if (profile?.role === "surveyor") {
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
        action: "Site survey scheduled",
        details: `Scheduled for ${new Date(args.scheduledAt).toLocaleString()}`,
        entityType: "survey",
        entityId: survey.id,
        touchLead: false,
    });

    return survey.id;
}

export async function completeSurvey(args: {
    surveyId: Id<"surveys">;
    roofType: RoofType;
    estimatedSystemSizeKw: number;
    roofAgeYears?: number;
    shadingNotes?: string;
    additionalNotes?: string;
    /** Raw files; uploaded to the private `photos` bucket before the row update. */
    photos?: File[];
}): Promise<void> {
    const survey = unwrap(
        await supabase
            .from("surveys")
            .select("lead_id, photo_paths")
            .eq("id", args.surveyId)
            .single(),
        "Survey not found",
    ) as { lead_id: string; photo_paths: string[] };

    const uploaded = args.photos?.length
        ? await uploadFiles("photos", "surveys", args.surveyId, args.photos)
        : [];

    const { error } = await supabase
        .from("surveys")
        .update({
            status: "completed",
            completed_at: new Date().toISOString(),
            roof_type: args.roofType,
            shading_notes: args.shadingNotes || null,
            estimated_system_size_kw: args.estimatedSystemSizeKw,
            roof_age_years: args.roofAgeYears ?? null,
            additional_notes: args.additionalNotes || null,
            photo_paths: [...(survey.photo_paths ?? []), ...uploaded],
        })
        .eq("id", args.surveyId);

    if (error) {
        // The photos are already in the bucket; drop them rather than leave
        // objects nothing references.
        await removeFiles("photos", uploaded);
        throw toAppError(error, "Failed to complete survey");
    }

    await advanceLeadStage(survey.lead_id, "survey_completed");

    await logActivity({
        leadId: survey.lead_id,
        action: "Site survey completed",
        details:
            `System size: ${args.estimatedSystemSizeKw} kW · ` +
            `Roof: ${args.roofType.replace(/_/g, " ")}`,
        entityType: "survey",
        entityId: args.surveyId,
        touchLead: false,
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
        action: "Survey cancelled",
        details: args.reason,
        entityType: "survey",
        entityId: args.surveyId,
    });
}
