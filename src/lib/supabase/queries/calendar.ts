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

/**
 * Fields every event carries, whatever kind it is.
 *
 * `startDate`/`endDate` are inclusive yyyy-mm-dd. They exist so the month grid
 * can lay an event out as one continuous bar across the days it covers — an
 * event is emitted once, not once per day, because a job split into seven
 * separate chips is exactly the thing the bar replaces.
 */
type EventBase = {
    leadId: Id<"leads">;
    leadName: string;
    address: string | null;
    assigneeNames: string[];
    startDate: string;
    endDate: string;
};

export type CalendarEvent =
    | (EventBase & {
          kind: "inspection";
          id: Id<"surveys">;
          status: SurveyStatus;
          /** Exact time slot. */
          at: string;
          allDay: false;
      })
    | (EventBase & {
          kind: "installation";
          id: Id<"installations">;
          status: InstallationStatus;
          /** Dates only — no time-of-day was ever scheduled. */
          allDay: true;
      });

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

/** The local calendar day an instant falls on, as yyyy-mm-dd. */
function localDayOf(instant: string): string {
    const d = new Date(instant);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Every yyyy-mm-dd from `start` to `end`, inclusive.
 *
 * Stepped in UTC on purpose. These are plain dates with no time-of-day, and
 * walking them through a local-time Date is how a job in a UTC+8 timezone
 * loses or repeats a day across a DST boundary.
 */
export function daysBetween(start: string, end: string): string[] {
    const days: string[] = [];
    const cursor = new Date(`${start}T00:00:00Z`);
    const last = new Date(`${end}T00:00:00Z`);
    // A backwards range is impossible (CHECK constraint), but a malformed date
    // would otherwise spin here forever.
    if (Number.isNaN(cursor.getTime()) || Number.isNaN(last.getTime())) return [start];
    while (cursor <= last) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

/**
 * Inspections and installs overlapping `[from, to]`, merged and sorted by time.
 *
 * A finished inspection leaves the calendar: the schedule answers "what still
 * has to happen", and a completed visit sitting on last Tuesday is history, not
 * a commitment. It stays on the lead's Ocular Inspection tab either way.
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
        .neq("status", "cancelled")
        .is("completed_at", null);
    if (isField) surveyQuery = surveyQuery.eq("assigned_surveyor_id", auth.user.id);

    let installationQuery = supabase
        .from("installations")
        .select("*, leads(first_name, last_name, properties(address, city))")
        // Overlap, not containment: a job that started before this view and
        // ends inside it still belongs on these days.
        .lte("scheduled_date", args.to)
        .gte("scheduled_end_date", args.from);
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

    const inspectionEvents: CalendarEvent[] = surveyRows.map((row) => {
        // `scheduled_at` is an instant; the day it falls on is the *local* day,
        // which is what the grid is drawn in.
        const day = localDayOf(row.scheduled_at);
        return {
            kind: "inspection",
            id: row.id,
            leadId: row.lead_id,
            leadName: leadNameOf(row.leads),
            address: addressOf(row.leads),
            status: row.status,
            assigneeNames: [row.surveyor?.name || row.surveyor?.email || "Unassigned"],
            at: row.scheduled_at,
            allDay: false,
            startDate: day,
            endDate: day,
        };
    });

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
        allDay: true,
        // The row may start before or end after the requested window; it is
        // returned whole and the grid clips it to the weeks on screen.
        startDate: row.scheduled_date,
        endDate: row.scheduled_end_date,
    }));

    // Longest-first within a day so a multi-day bar takes the top lane and
    // shorter jobs settle underneath it, rather than the bar zig-zagging down
    // the rows as it crosses each one.
    return [...inspectionEvents, ...installationEvents].sort(
        (a, b) =>
            a.startDate.localeCompare(b.startDate) ||
            b.endDate.localeCompare(a.endDate) ||
            a.leadName.localeCompare(b.leadName),
    );
}
