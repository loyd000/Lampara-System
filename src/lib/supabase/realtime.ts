/**
 * Live updates.
 *
 * Convex pushed new query results to every subscriber automatically. React Query
 * has no equivalent, so this hook opens one Supabase Realtime channel for the
 * whole app and invalidates the matching query keys whenever a row changes.
 *
 * Realtime honours RLS, so a sales rep is only woken by changes to their own
 * leads — the same scoping the queries themselves get.
 *
 * Two things keep this from being noisy:
 *
 *   · **Coalescing.** One user action can touch several tables (a contract
 *     insert also writes the quote, the lead and an activity row), and each
 *     arrives as its own event. Keys are collected and flushed once.
 *   · **Targeting.** Events carry the changed row, so a change to one lead
 *     invalidates that lead's detail cache rather than every lead detail
 *     anyone has open.
 *
 * Mount it once, inside the authenticated tree (see AppLayout).
 */

import { useEffect } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

import { supabase } from "./client.ts";
import { queryKeys } from "./hooks.ts";

/** Long enough to absorb one transaction's worth of events, short enough to feel live. */
const COALESCE_MS = 250;

const WATCHED_TABLES = [
    "leads",
    "properties",
    "activity_log",
    "lead_notes",
    "lead_files",
    "surveys",
    "survey_photos",
    "quotes",
    "quote_items",
    "contracts",
    "installations",
    "service_tickets",
    "users",
    "packages",
    "package_items",
] as const;

type Row = Record<string, unknown>;

/**
 * The lead a changed row belongs to.
 *
 * On DELETE, `new` is empty and only `old` is populated — which is why the
 * tables carry REPLICA IDENTITY FULL (see 0004). Without it a delete would only
 * give back the primary key and this would return undefined, falling back to the
 * broader invalidation below.
 */
function leadIdOf(payload: RealtimePostgresChangesPayload<Row>): string | undefined {
    const row = (payload.new ?? {}) as Row;
    const previous = (payload.old ?? {}) as Row;
    const value = row.lead_id ?? previous.lead_id;
    return typeof value === "string" ? value : undefined;
}

function rowIdOf(payload: RealtimePostgresChangesPayload<Row>): string | undefined {
    const row = (payload.new ?? {}) as Row;
    const previous = (payload.old ?? {}) as Row;
    const value = row.id ?? previous.id;
    return typeof value === "string" ? value : undefined;
}

/** `quote_items` rows carry the parent quote's id under `quote_id`, not `id`. */
function quoteIdOf(payload: RealtimePostgresChangesPayload<Row>): string | undefined {
    const row = (payload.new ?? {}) as Row;
    const previous = (payload.old ?? {}) as Row;
    const value = row.quote_id ?? previous.quote_id;
    return typeof value === "string" ? value : undefined;
}

/** Which caches a change to `table` should refresh. */
export function keysFor(
    table: string,
    payload: RealtimePostgresChangesPayload<Row>,
): QueryKey[] {
    const leadId = leadIdOf(payload);

    switch (table) {
        case "leads": {
            const id = rowIdOf(payload);
            return [
                ["leads", "list"],
                ["leads", "enriched"],
                ["leads", "search"],
                ...(id ? [queryKeys.lead(id), queryKeys.leadProperties(id)] : [queryKeys.leads]),
                queryKeys.reports,
                ["surveys", "mine"],
                queryKeys.myInstallations,
            ];
        }
        case "properties":
            return [
                // Search results carry the property too (location is one of the
                // things searched), so an address edit has to reach them as well.
                ["leads", "enriched"],
                ["leads", "search"],
                ["surveys", "mine"],
                queryKeys.myInstallations,
                // The calendar prints each event's address straight off the
                // property row — a corrected address is invisible there
                // otherwise. Prefix-only key: the real one is parameterised
                // by the visible date range, which this handler never has.
                ["calendarEvents"],
                ...(leadId ? [queryKeys.leadProperties(leadId)] : [queryKeys.leads]),
            ];
        case "activity_log":
            return leadId ? [queryKeys.leadActivity(leadId)] : [queryKeys.leads];
        case "lead_notes":
            return leadId ? [queryKeys.leadNotesForLead(leadId)] : [queryKeys.leadNotes];
        case "lead_files":
            return leadId ? [queryKeys.leadFilesForLead(leadId)] : [queryKeys.leadFiles];
        case "surveys":
            return [
                ...(leadId ? [queryKeys.surveysForLead(leadId)] : [queryKeys.surveys]),
                ["surveys", "mine"],
                ["calendarEvents"],
            ];
        // survey_photos rows carry no lead_id, so there is nothing to narrow to;
        // one photo upload refreshes the inspection queries wholesale — and the
        // Overview file lists with them, since those read report photos too.
        case "survey_photos":
            return [queryKeys.surveys, queryKeys.leadFiles];
        // Both quote cases also refresh the lead lists: those derive a lead's
        // design type from whichever quote is approved, so approving one — or
        // changing which packages its line items came from — changes what the
        // Leads list and search results should be showing.
        case "quotes": {
            const id = rowIdOf(payload);
            return [
                ...(leadId ? [queryKeys.quotesForLead(leadId)] : [queryKeys.quotes]),
                ...(id ? [queryKeys.quoteWithItems(id)] : []),
                ["leads", "enriched"],
                ["leads", "search"],
                queryKeys.reports,
            ];
        }
        case "quote_items": {
            const quoteId = quoteIdOf(payload);
            return [
                ...(leadId ? [queryKeys.quotesForLead(leadId)] : [queryKeys.quotes]),
                ...(quoteId ? [queryKeys.quoteWithItems(quoteId)] : []),
                ["leads", "enriched"],
                ["leads", "search"],
                queryKeys.reports,
            ];
        }
        case "contracts":
            return leadId ? [queryKeys.contractForLead(leadId)] : [queryKeys.contracts];
        case "installations":
            return [
                ...(leadId
                    ? [queryKeys.installationForLead(leadId)]
                    : [queryKeys.installations]),
                queryKeys.myInstallations,
                queryKeys.reports,
                ["calendarEvents"],
            ];
        case "service_tickets":
            return [
                ...(leadId ? [queryKeys.ticketsForLead(leadId)] : [queryKeys.serviceTickets]),
                queryKeys.allTickets,
                queryKeys.reports,
            ];
        case "users":
            // A renamed crew member's name is baked into calendar installation
            // events (resolved once for all rows — see calendar.ts) as well.
            return [queryKeys.users, queryKeys.currentUser, ["calendarEvents"]];
        case "packages":
        case "package_items":
            return [queryKeys.packages];
        default:
            return [];
    }
}

export function useRealtimeSync(enabled: boolean) {
    const client = useQueryClient();

    useEffect(() => {
        if (!enabled) return;

        // Keyed by the serialised key so repeats within one window collapse.
        const pending = new Map<string, QueryKey>();
        let flushTimer: number | undefined;
        // Set instead of queuing individual keys when the signed-in user's
        // own row changed (see isSelfChange below) — a role or active-state
        // change alters what RLS lets nearly every query return, so anything
        // short of a full reset leaves already-open pages showing data
        // fetched under the old role until the user manually navigates.
        let pendingFullReset = false;

        const flush = () => {
            flushTimer = undefined;
            if (pendingFullReset) {
                pendingFullReset = false;
                pending.clear();
                void client.invalidateQueries();
                return;
            }
            const keys = [...pending.values()];
            pending.clear();
            for (const queryKey of keys) client.invalidateQueries({ queryKey });
        };

        const queue = (keys: QueryKey[]) => {
            for (const key of keys) pending.set(JSON.stringify(key), key);
            if (flushTimer === undefined) {
                flushTimer = window.setTimeout(flush, COALESCE_MS);
            }
        };

        const queueFullReset = () => {
            pendingFullReset = true;
            if (flushTimer === undefined) {
                flushTimer = window.setTimeout(flush, COALESCE_MS);
            }
        };

        /** True when a `users` row change is the signed-in user's own account. */
        function isSelfChange(payload: RealtimePostgresChangesPayload<Row>): boolean {
            const changedId = rowIdOf(payload);
            const myId = (client.getQueryData(queryKeys.currentUser) as { _id?: string } | undefined)?._id;
            return Boolean(changedId && myId && changedId === myId);
        }

        let channel: RealtimeChannel = supabase.channel("lampara-crm");

        for (const table of WATCHED_TABLES) {
            channel = channel.on<Row>(
                "postgres_changes",
                { event: "*", schema: "public", table },
                (payload) => {
                    if (table === "users" && isSelfChange(payload)) {
                        queueFullReset();
                        return;
                    }
                    queue(keysFor(table, payload));
                },
            );
        }

        channel.subscribe();

        return () => {
            if (flushTimer !== undefined) window.clearTimeout(flushTimer);
            supabase.removeChannel(channel);
        };
    }, [enabled, client]);
}
