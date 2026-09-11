/**
 * The AI panel's opening message — a snapshot of today's schedule and which
 * projects have gone quiet, shown the moment the panel opens with no chat
 * history yet.
 *
 * Deliberately NOT an LLM call: this is two of the same query functions the
 * dashboard and calendar already use, formatted into one message. No API
 * cost or latency for a message nobody asked a question to get, and — same
 * "never invent data" rule the rest of this assistant runs on — zero chance
 * of a model paraphrasing a number wrong on the one message nothing
 * prompted.
 */
import { format } from "date-fns";
import { listCalendarEvents } from "@/lib/supabase/queries/calendar.ts";
import { pipelineSummary } from "@/lib/supabase/queries/reports.ts";

/** Matches the `interval '7 days'` threshold in report_pipeline_summary —
 * see supabase/migrations/0027_report_guards_and_revenue_fix.sql. Kept as a
 * separate constant rather than reading it back from the RPC result so this
 * stays correct even if a future migration changes the wording without
 * changing the number. */
const STALE_THRESHOLD_DAYS = 7;

export async function buildDailyBriefing(): Promise<string> {
    const today = format(new Date(), "yyyy-MM-dd");
    const [events, summary] = await Promise.all([
        listCalendarEvents({ from: today, to: today }),
        pipelineSummary(),
    ]);

    const inspections = events.filter((e) => e.kind === "inspection").length;
    const installations = events.filter((e) => e.kind === "installation").length;

    const lines: string[] = [];

    if (inspections || installations) {
        const bits: string[] = [];
        if (inspections) bits.push(`${inspections} inspection${inspections === 1 ? "" : "s"}`);
        if (installations) bits.push(`${installations} installation${installations === 1 ? "" : "s"}`);
        lines.push(`**Today:** ${bits.join(" and ")}.`);
    } else {
        lines.push("**Today:** nothing on the schedule.");
    }

    const staleCount = summary.staleLeads.length;
    if (staleCount > 0) {
        lines.push(
            `**${staleCount} project${staleCount === 1 ? "" : "s"}** gone quiet for ` +
                `${STALE_THRESHOLD_DAYS}+ days — ask "which projects have gone stale" for the list.`,
        );
    }

    lines.push("Ask me anything about your projects, schedule, or pipeline.");

    return lines.join("\n\n");
}
