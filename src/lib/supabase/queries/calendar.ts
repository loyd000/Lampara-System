/**
 * The calendar's data layer — a client-side merge of two tables, not a table
 * of its own. `surveys.scheduled_at` is a timestamptz (a real time slot);
 * `installations.scheduled_date` is a plain date (all-day, no time-of-day) —
 * the two shapes stay distinct in `CalendarEvent` rather than being forced
 * into one "at" instant that would fabricate a time no installer scheduled.
 */

import { supabase, unwrap } from "../client.ts";
import type {
    InstallationRow,
    InstallationStatus,
    LeadRow,
    PropertyRow,
    SurveyRow,
    SurveyStatus,
} from "../database.types.ts";
import type { Id } from "../types.ts";

export type CalendarEvent =
    | {
          kind: "inspection";
          id: Id<"surveys">;
          leadId: Id<"leads">;
          leadName: string;
          address: string | null;
          status: SurveyStatus;
          assigneeNames: string[];
          /** Exact time slot. */
          at: string;
          allDay: false;
      }
    | {
          kind: "installation";
          id: Id<"installations">;
          leadId: Id<"leads">;
          leadName: string;
          address: string | null;
          status: InstallationStatus;
          assigneeNames: string[];
          /** Date only — no time-of-day was ever scheduled. */
          at: string;
          allDay: true;
      };

type LeadWithProperty = Pick<LeadRow, "first_name" | "last_name"> & {
    properties: Pick<PropertyRow, "address" | "city">[] | null;
};

function addressOf(lead: LeadWithProperty | null): string | null {
    const property = lead?.properties?.[0] ?? null;
    return property ? `${property.address}, ${property.city}` : null;
}

function leadNameOf(lead: LeadWithProperty | null): string {
    return lead ? `${lead.first_name} ${lead.last_name}` : "Unknown";
}

/**
 * Inspections and installs in `[from, to]`, merged and sorted by time.
 *
 * Field technicians see only jobs they are assigned to; every other role sees
 * the whole board — the same "mine vs. everyone" split `listMyInspections` /
 * `listMyInstallations` already use, applied here as one combined feed. RLS
 * lets every member read both tables, so this narrowing is a client-side
 * filter, not a security boundary.
 */
export async function listCalendarEvents(args: {
    from: string; // ISO date, inclusive
    to: string; // ISO date, inclusive
}): Promise<CalendarEvent[]> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];

    const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", auth.user.id)
        .maybeSingle<{ role: string }>();
    const isField = profile?.role === "field";

    type SurveyRowJoined = SurveyRow & {
        surveyor: { name: string | null; email: string | null } | null;
        leads: LeadWithProperty | null;
    };
    type InstallationRowJoined = InstallationRow & {
        leads: LeadWithProperty | null;
    };

    let surveyQuery = supabase
        .from("surveys")
        .select(
            "*, surveyor:users!surveys_assigned_surveyor_id_fkey(name, email), " +
                "leads(first_name, last_name, properties(address, city))",
        )
        .gte("scheduled_at", `${args.from}T00:00:00Z`)
        .lte("scheduled_at", `${args.to}T23:59:59Z`)
        .neq("status", "cancelled");
    if (isField) surveyQuery = surveyQuery.eq("assigned_surveyor_id", auth.user.id);

    let installationQuery = supabase
        .from("installations")
        .select("*, leads(first_name, last_name, properties(address, city))")
        .gte("scheduled_date", args.from)
        .lte("scheduled_date", args.to);
    if (isField) installationQuery = installationQuery.contains("assigned_crew_ids", [auth.user.id]);

    const [surveys, installations, crew] = await Promise.all([
        surveyQuery.returns<SurveyRowJoined[]>(),
        installationQuery.returns<InstallationRowJoined[]>(),
        // Installs carry an array of crew ids, not names — resolve once for all
        // of them rather than one round trip per row.
        supabase.from("users").select("id, name, email"),
    ]);

    const surveyRows = unwrap(surveys, "Failed to load inspection schedule");
    const installationRows = unwrap(installations, "Failed to load installation schedule");
    const crewById = new Map(
        (crew.data ?? []).map((u) => [u.id, u.name || u.email || "Unknown"]),
    );

    const inspectionEvents: CalendarEvent[] = surveyRows.map((row) => ({
        kind: "inspection",
        id: row.id,
        leadId: row.lead_id,
        leadName: leadNameOf(row.leads),
        address: addressOf(row.leads),
        status: row.status,
        assigneeNames: [row.surveyor?.name || row.surveyor?.email || "Unassigned"],
        at: row.scheduled_at,
        allDay: false,
    }));

    const installationEvents: CalendarEvent[] = installationRows.map((row) => ({
        kind: "installation",
        id: row.id,
        leadId: row.lead_id,
        leadName: leadNameOf(row.leads),
        address: addressOf(row.leads),
        status: row.status,
        assigneeNames: row.assigned_crew_ids.length
            ? row.assigned_crew_ids.map((id) => crewById.get(id) ?? "Unknown")
            : ["Unassigned"],
        at: row.scheduled_date,
        allDay: true,
    }));

    return [...inspectionEvents, ...installationEvents].sort((a, b) =>
        a.at.localeCompare(b.at),
    );
}
