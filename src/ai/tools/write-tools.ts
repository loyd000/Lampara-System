/**
 * Phase 2 write tools. Same rule as read-tools.ts: call the same Supabase
 * query functions the rest of the app uses, no new backend, no new RLS —
 * these run under the signed-in admin/superadmin's own session, so a write
 * here is indistinguishable from that person clicking the equivalent button
 * in the UI.
 *
 * None of these tools ask for confirmation themselves — that's a system
 * prompt rule (see prompts.ts), not a code path. The model is instructed to
 * describe what it's about to do and wait for the user's next message
 * before calling a write tool at all. Nothing here pauses mid-call for a
 * click; the confirmation *is* the model choosing not to call the tool yet.
 */
import { z } from "zod";
import { getLeadById, getProperties, updateStage } from "@/lib/supabase/queries/leads.ts";
import { createQuote, saveQuote, type QuoteItemInput } from "@/lib/supabase/queries/quotes.ts";
import { listActivePackages } from "@/lib/supabase/queries/packages.ts";
import { scheduleSurvey } from "@/lib/supabase/queries/surveys.ts";
import { createInstallation } from "@/lib/supabase/queries/installations.ts";
import { addLeadNote, NOTE_MAX_LENGTH } from "@/lib/supabase/queries/lead-notes.ts";
import { STAGES, STAGE_LABELS, canScheduleInstallation, type Stage } from "@/lib/constants.ts";
import type { Id, PackageWithItems } from "@/lib/supabase/types.ts";
import type { AgentTool } from "../types.ts";

function formatError(message: string): { error: string } {
    return { error: message };
}

/**
 * Mirrors `ItemPickerModal.tsx`'s `handleAddPackage` exactly — a package's
 * price can live in three different places, and getting this wrong either
 * drops the package's price entirely or bills it twice:
 *  - no items at all → one line item priced at the package's basePricePhp
 *  - items with real per-item prices → expand each as its own priced line
 *    (basePricePhp is not added again — it's just the sum of these, kept as
 *    a display headline on the package, not a separate charge)
 *  - items that are all $0 placeholders → one "package price" header line
 *    at basePricePhp, plus the components listed underneath at $0 each
 */
function quoteItemsForPackage(pkg: PackageWithItems): QuoteItemInput[] {
    if (pkg.items.length === 0) {
        return [
            {
                description: pkg.name + (pkg.systemSizeKw ? ` (${pkg.systemSizeKw} kW)` : ""),
                qty: 1,
                unit: "set",
                unitPricePhp: pkg.basePricePhp,
                sourcePackageId: pkg._id,
            },
        ];
    }

    const describeItem = (item: PackageWithItems["items"][number]) =>
        item.name ? `${item.name}${item.description ? ` · ${item.description}` : ""}` : item.description;

    const hasRealPrices = pkg.items.some((item) => item.unitPricePhp > 0);
    if (hasRealPrices) {
        return pkg.items.map((item) => ({
            description: describeItem(item),
            qty: item.qty,
            unit: item.unit,
            unitPricePhp: item.unitPricePhp,
            sourcePackageId: pkg._id,
        }));
    }

    return [
        {
            description: `${pkg.name} — package price`,
            qty: 1,
            unit: "Set",
            unitPricePhp: pkg.basePricePhp,
            sourcePackageId: pkg._id,
        },
        ...pkg.items.map((item) => ({
            description: describeItem(item),
            qty: item.qty,
            unit: item.unit,
            unitPricePhp: 0,
            sourcePackageId: pkg._id,
        })),
    ];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ─── create_quote ───────────────────────────────────────────────────────────

const customItemSchema = z.object({
    description: z.string().trim().min(1),
    qty: z.number().positive(),
    unitPricePhp: z.number().nonnegative(),
    unit: z.string().trim().min(1).optional(),
});

const createQuoteArgs = z.object({
    projectId: z.string().min(1),
    packageIds: z.array(z.string().min(1)).optional(),
    customItems: z.array(customItemSchema).optional(),
});

export const createQuoteTool: AgentTool = {
    declaration: {
        name: "create_quote",
        description:
            "Creates a new draft quote for a project from one or more packages " +
            "and/or custom line items. Call list_packages first to find package " +
            "ids and see what each includes and costs. At least one package id " +
            "or custom item is required. Does not approve the quote — approval " +
            "stays a deliberate step in the app, not something this tool does.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
                packageIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Package ids from list_packages — each package's items become quote line items.",
                },
                customItems: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            description: { type: "string" },
                            qty: { type: "number" },
                            unitPricePhp: { type: "number" },
                            unit: { type: "string", description: 'Defaults to "pc".' },
                        },
                        required: ["description", "qty", "unitPricePhp"],
                    },
                    description: "Extra line items not tied to a package.",
                },
            },
            required: ["projectId"],
        },
    },
    async run(rawArgs) {
        const parsed = createQuoteArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, packageIds = [], customItems = [] } = parsed.data;
        if (packageIds.length === 0 && customItems.length === 0) {
            return formatError("Provide at least one package id or custom item to build the quote from.");
        }
        const leadId = projectId as Id<"leads">;

        const lead = await getLeadById(leadId);
        if (!lead) return formatError("No project found with that id.");

        const items: QuoteItemInput[] = [];
        if (packageIds.length) {
            const packages = await listActivePackages();
            const byId = new Map(packages.map((p) => [p._id, p]));
            for (const id of packageIds) {
                const pkg = byId.get(id);
                if (!pkg) return formatError(`No active package found with id "${id}".`);
                items.push(...quoteItemsForPackage(pkg));
            }
        }
        for (const item of customItems) {
            items.push({
                description: item.description,
                qty: item.qty,
                unit: item.unit ?? "pc",
                unitPricePhp: item.unitPricePhp,
            });
        }

        try {
            const quoteId = await createQuote({ leadId });
            await saveQuote({ quoteId, items });
            const totalPhp = items.reduce((sum, item) => sum + item.qty * item.unitPricePhp, 0);
            return {
                quoteId,
                itemCount: items.length,
                totalPhp,
                navigateTo: `/projects/${leadId}?tab=quotes`,
            };
        } catch (err) {
            return formatError(err instanceof Error ? err.message : "Failed to create quote.");
        }
    },
};

// ─── schedule_inspection ────────────────────────────────────────────────────

const scheduleInspectionArgs = z.object({
    projectId: z.string().min(1),
    date: z.string().regex(DATE_RE, "Expected yyyy-mm-dd"),
    time: z.string().regex(TIME_RE, 'Expected 24-hour "HH:mm"'),
    assignedUserId: z.string().min(1),
});

export const scheduleInspectionTool: AgentTool = {
    declaration: {
        name: "schedule_inspection",
        description:
            "Books a site ocular inspection for a project, at a specific date " +
            "and time, with one assigned technician. Call get_team (role: " +
            '"field") first if you do not already have the technician\'s id. ' +
            "Moves the project to the Inspection Scheduled stage.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
                date: { type: "string", description: "yyyy-mm-dd" },
                time: { type: "string", description: '24-hour "HH:mm", e.g. "14:30".' },
                assignedUserId: { type: "string", description: "The technician's id, from get_team." },
            },
            required: ["projectId", "date", "time", "assignedUserId"],
        },
    },
    async run(rawArgs) {
        const parsed = scheduleInspectionArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, date, time, assignedUserId } = parsed.data;
        const leadId = projectId as Id<"leads">;

        const properties = await getProperties(leadId);
        const property = properties[0];
        if (!property) {
            return formatError("This project has no property on file — add one in the app before scheduling an inspection.");
        }

        // Interpreted in the caller's own local time, same as every date
        // picker elsewhere in the app — this only ever runs in the browser.
        const scheduledAt = new Date(`${date}T${time}:00`);
        if (Number.isNaN(scheduledAt.getTime())) return formatError("That date/time didn't parse — check the values.");

        try {
            const surveyId = await scheduleSurvey({
                leadId,
                propertyId: property._id as Id<"properties">,
                assignedSurveyorId: assignedUserId as Id<"users">,
                scheduledAt: scheduledAt.toISOString(),
            });
            return {
                surveyId,
                scheduledAt: scheduledAt.toISOString(),
                navigateTo: `/projects/${leadId}?tab=ocular`,
            };
        } catch (err) {
            return formatError(err instanceof Error ? err.message : "Failed to schedule the inspection.");
        }
    },
};

// ─── schedule_installation ──────────────────────────────────────────────────

const scheduleInstallationArgs = z.object({
    projectId: z.string().min(1),
    startDate: z.string().regex(DATE_RE, "Expected yyyy-mm-dd"),
    endDate: z.string().regex(DATE_RE, "Expected yyyy-mm-dd").optional(),
    crewIds: z.array(z.string().min(1)).min(1, "At least one crew member is required"),
});

export const scheduleInstallationTool: AgentTool = {
    declaration: {
        name: "schedule_installation",
        description:
            "Schedules an installation job for a project, with a date range and " +
            "assigned crew. Only works once the project's contract is signed " +
            "(or later) — check with get_project first. Call get_team (role: " +
            '"field") to find crew ids. Moves the project to the Install ' +
            "Scheduled stage. Fails if this project already has an " +
            "installation — rescheduling one is not something this tool does.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
                startDate: { type: "string", description: "yyyy-mm-dd, inclusive start date." },
                endDate: {
                    type: "string",
                    description: "yyyy-mm-dd, inclusive end date. Defaults to a one-day job on startDate.",
                },
                crewIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Technician ids from get_team, at least one.",
                },
            },
            required: ["projectId", "startDate", "crewIds"],
        },
    },
    async run(rawArgs) {
        const parsed = scheduleInstallationArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, startDate, endDate, crewIds } = parsed.data;
        const leadId = projectId as Id<"leads">;

        const lead = await getLeadById(leadId);
        if (!lead) return formatError("No project found with that id.");
        if (!canScheduleInstallation(lead.stage)) {
            return formatError(
                `This project is at "${STAGE_LABELS[lead.stage]}" — installation can only be scheduled once the contract is signed.`,
            );
        }

        try {
            const installationId = await createInstallation({
                leadId,
                scheduledDate: startDate,
                scheduledEndDate: endDate,
                assignedCrewIds: crewIds as Id<"users">[],
            });
            return { installationId, navigateTo: `/projects/${leadId}?tab=installation` };
        } catch (err) {
            return formatError(err instanceof Error ? err.message : "Failed to schedule the installation.");
        }
    },
};

// ─── add_lead_note ──────────────────────────────────────────────────────────

const addLeadNoteArgs = z.object({
    projectId: z.string().min(1),
    body: z.string().trim().min(1).max(NOTE_MAX_LENGTH),
});

export const addLeadNoteTool: AgentTool = {
    declaration: {
        name: "add_lead_note",
        description:
            `Adds a note to a project's timeline (up to ${NOTE_MAX_LENGTH} ` +
            "characters). Notes are additive — this never edits or removes " +
            "anything — but still confirm the exact wording with the user " +
            "before adding one.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
                body: { type: "string", description: "The note's text." },
            },
            required: ["projectId", "body"],
        },
    },
    async run(rawArgs) {
        const parsed = addLeadNoteArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, body } = parsed.data;

        try {
            const noteId = await addLeadNote({ leadId: projectId as Id<"leads">, body });
            return { noteId, navigateTo: `/projects/${projectId}` };
        } catch (err) {
            return formatError(err instanceof Error ? err.message : "Failed to add the note.");
        }
    },
};

// ─── update_project_stage ───────────────────────────────────────────────────

const updateProjectStageArgs = z.object({
    projectId: z.string().min(1),
    stage: z.enum(STAGES as [Stage, ...Stage[]]),
    reason: z.string().trim().min(1).optional(),
});

export const updateProjectStageTool: AgentTool = {
    declaration: {
        name: "update_project_stage",
        description:
            "Moves a project to a specific pipeline stage directly, including " +
            "backwards or to cancelled. This is a manual override: most stages " +
            "already advance on their own when the matching work happens " +
            "(scheduling an inspection, approving a quote, signing a " +
            "contract...), so only use this to correct a mistake or cancel a " +
            'project. `reason` is required when stage is "cancelled".',
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
                stage: { type: "string", enum: STAGES },
                reason: {
                    type: "string",
                    description: 'Required when stage is "cancelled"; explains the change for the activity log.',
                },
            },
            required: ["projectId", "stage"],
        },
    },
    async run(rawArgs) {
        const parsed = updateProjectStageArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, stage, reason } = parsed.data;
        if (stage === "cancelled" && !reason) {
            return formatError("A reason is required to cancel a project — ask the user for one.");
        }

        try {
            await updateStage({ id: projectId as Id<"leads">, stage, cancelledReason: reason });
            return {
                projectId,
                stage,
                stageLabel: STAGE_LABELS[stage],
                navigateTo: `/projects/${projectId}`,
            };
        } catch (err) {
            return formatError(err instanceof Error ? err.message : "Failed to update the stage.");
        }
    },
};

// ─── navigate ────────────────────────────────────────────────────────────────

const navigateArgs = z.object({
    path: z.string().min(1),
});

export const navigateTool: AgentTool = {
    declaration: {
        name: "navigate",
        description:
            "Navigates the app to an in-app page for the user to see — call " +
            "this right after a successful write action, using the " +
            "navigateTo path it returned.",
        input_schema: {
            type: "object",
            properties: {
                path: { type: "string", description: 'An in-app path, e.g. "/projects/abc123?tab=quotes".' },
            },
            required: ["path"],
        },
    },
    async run(rawArgs, ctx) {
        const parsed = navigateArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        // Only ever a relative in-app path — never let the model send the
        // browser to an absolute URL or another origin.
        if (!parsed.data.path.startsWith("/") || parsed.data.path.startsWith("//")) {
            return formatError('path must be a relative in-app path starting with a single "/".');
        }
        ctx.navigate(parsed.data.path);
        return { navigated: true, path: parsed.data.path };
    },
};
