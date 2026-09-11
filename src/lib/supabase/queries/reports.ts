/**
 * Replaces convex/reports.ts.
 *
 * Each report is a single aggregate query in Postgres (see
 * `supabase/migrations/0007_report_functions.sql`) returning one jsonb object.
 * The previous version fetched every lead, quote and installation and
 * counted them in the browser, which did not scale and would have gone quietly
 * wrong if PostgREST's max-rows were ever configured.
 *
 * The functions are SECURITY INVOKER, so RLS still scopes a sales rep's numbers
 * to their own leads while admin and office see the whole business — the same
 * behaviour as before, now enforced in one place.
 */

import { supabase, toAppError } from "../client.ts";
import type { LeadStage } from "../database.types.ts";

export type PipelineSummary = {
    stageCounts: Record<string, number>;
    totalLeads: number;
    converted: number;
    activeCustomers: number;
    conversionRate: number;
    staleLeads: { _id: string; name: string; stage: LeadStage; daysStale: number }[];
};

/**
 * The Reports page (revenue, installations, stale-leads breakdown) is gone for
 * now — `quotesRevenueSummary`/`installationsSummary` and the
 * `report_revenue_summary`/`report_installations_summary` RPCs they called
 * are unused but deliberately left in the database (see 0007) rather than
 * dropped, so bringing the page back later doesn't need a migration.
 * `pipelineSummary` stays: the dashboard's own stat strip still reads it.
 *
 * The RPC returns `jsonb`, which supabase-js cannot narrow on its own, so the
 * shape is asserted here. It is defined by the `jsonb_build_object` call in
 * 0007 — change one and change the other.
 */
export function pipelineSummary(): Promise<PipelineSummary> {
    return callReport<PipelineSummary>(
        "report_pipeline_summary",
        "Failed to load pipeline report",
    );
}

async function callReport<T>(
    fn: "report_pipeline_summary",
    failureMessage: string,
): Promise<T> {
    const { data, error } = await supabase.rpc(fn);
    if (error) throw toAppError(error, failureMessage);
    return data as T;
}
