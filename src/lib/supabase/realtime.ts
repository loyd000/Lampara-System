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
    "surveys",
    "survey_photos",
    "quotes",
    "contracts",
    "permits",
    "installations",
    "service_tickets",
    "users",
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

/** Which caches a change to `table` should refresh. */
function keysFor(
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
            ];
        }
        case "properties":
            return [
                ["leads", "enriched"],
                ...(leadId ? [queryKeys.leadProperties(leadId)] : [queryKeys.leads]),
            ];
        case "activity_log":
            return leadId ? [queryKeys.leadActivity(leadId)] : [queryKeys.leads];
        case "surveys":
            return [
                ...(leadId ? [queryKeys.surveysForLead(leadId)] : [queryKeys.surveys]),
                ["surveys", "mine"],
            ];
        // survey_photos rows carry no lead_id, so there is nothing to narrow to;
        // one photo upload refreshes the inspection queries wholesale.
        case "survey_photos":
            return [queryKeys.surveys];
        case "quotes":
            return [
                ...(leadId ? [queryKeys.quotesForLead(leadId)] : [queryKeys.quotes]),
                queryKeys.reports,
            ];
        case "contracts":
            return leadId ? [queryKeys.contractForLead(leadId)] : [queryKeys.contracts];
        case "permits":
            return [
                ...(leadId ? [queryKeys.permitsForLead(leadId)] : [queryKeys.permits]),
                queryKeys.reports,
            ];
        case "installations":
            return [
                ...(leadId
                    ? [queryKeys.installationForLead(leadId)]
                    : [queryKeys.installations]),
                queryKeys.myInstallations,
                queryKeys.reports,
            ];
        case "service_tickets":
            return [
                ...(leadId ? [queryKeys.ticketsForLead(leadId)] : [queryKeys.serviceTickets]),
                queryKeys.allTickets,
                queryKeys.reports,
            ];
        case "users":
            return [queryKeys.users, queryKeys.currentUser];
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

        const flush = () => {
            flushTimer = undefined;
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

        let channel: RealtimeChannel = supabase.channel("lampara-crm");

        for (const table of WATCHED_TABLES) {
            channel = channel.on<Row>(
                "postgres_changes",
                { event: "*", schema: "public", table },
                (payload) => queue(keysFor(table, payload)),
            );
        }

        channel.subscribe();

        return () => {
            if (flushTimer !== undefined) window.clearTimeout(flushTimer);
            supabase.removeChannel(channel);
        };
    }, [enabled, client]);
}
