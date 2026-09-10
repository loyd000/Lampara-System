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
import type { Id } from "../types.ts";

export type PipelineSummary = {
    stageCounts: Record<string, number>;
    totalLeads: number;
    converted: number;
    activeCustomers: number;
    conversionRate: number;
    staleLeads: { _id: string; name: string; stage: LeadStage; daysStale: number }[];
};

export type RevenueSummary = {
    pipelineValue: number;
    closedValue: number;
    avgDealSize: number;
    totalQuotes: number;
    acceptedQuotes: number;
    financingMix: Record<string, number>;
};

export type InstallationsSummary = {
    total: number;
    byStatus: Record<string, number>;
    openServiceTickets: number;
};

/**
 * The RPCs return `jsonb`, which supabase-js cannot narrow on its own, so the
 * shape is asserted here. It is defined by the `jsonb_build_object` calls in
 * 0007 — change one and change the other.
 */
async function callReport<T>(
    fn:
        | "report_pipeline_summary"
        | "report_revenue_summary"
        | "report_installations_summary",
    failureMessage: string,
): Promise<T> {
    const { data, error } = await supabase.rpc(fn);
    if (error) throw toAppError(error, failureMessage);
    return data as T;
}

export function pipelineSummary(): Promise<PipelineSummary> {
    return callReport<PipelineSummary>(
        "report_pipeline_summary",
        "Failed to load pipeline report",
    );
}

export function quotesRevenueSummary(): Promise<RevenueSummary> {
    return callReport<RevenueSummary>(
        "report_revenue_summary",
        "Failed to load revenue report",
    );
}

export function installationsSummary(): Promise<InstallationsSummary> {
    return callReport<InstallationsSummary>(
        "report_installations_summary",
        "Failed to load installations report",
    );
}
