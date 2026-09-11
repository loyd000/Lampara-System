/**
 * Phase 1 read tools. Each one calls the same Supabase query functions the
 * rest of the app uses (see `src/lib/supabase/queries/`) — no new backend,
 * no new RLS. The agent panel is only mounted for superadmin/admin (see
 * `AgentFab.tsx`), so these always run under a role that already sees the
 * whole business, same as the dashboard.
 *
 * Every `run` validates its raw args with zod before touching a query
 * function: a tool call's args arrive as an untyped JSON object the model
 * produced, and a malformed or hallucinated arg should come back as a
 * `{ error }` the model can react to, not a runtime crash of the whole
 * conversation.
 */
import { z } from "zod";
import { getLeadById, getProperties, listEnrichedLeads, searchLeads } from "@/lib/supabase/queries/leads.ts";
import { listQuotesForLead } from "@/lib/supabase/queries/quotes.ts";
import { getInstallationForLead } from "@/lib/supabase/queries/installations.ts";
import { getContractForLead } from "@/lib/supabase/queries/contracts.ts";
import { listCalendarEvents } from "@/lib/supabase/queries/calendar.ts";
import { listActivePackages } from "@/lib/supabase/queries/packages.ts";
import { listUsers } from "@/lib/supabase/queries/users.ts";
import { listSurveysForLead } from "@/lib/supabase/queries/surveys.ts";
import { listAllTickets, listTicketsForLead, searchTickets } from "@/lib/supabase/queries/service-tickets.ts";
import { pipelineSummary } from "@/lib/supabase/queries/reports.ts";
import {
    STAGES,
    STAGE_LABELS,
    ROOF_TYPE_LABELS,
    ORIENTATION_LABELS,
    MOUNTING_LABELS,
    USAGE_HABIT_LABELS,
    SYSTEM_CAPACITY_LABELS,
    PACKAGE_TYPE_LABELS,
    BATTERY_OPTION_LABELS,
    PANEL_OPTION_LABELS,
    TICKET_STATUS_LABELS,
    TICKET_PRIORITY_LABELS,
    type Stage,
} from "@/lib/constants.ts";
import type { TicketStatus, UserRole } from "@/lib/supabase/database.types.ts";
import type { Id } from "@/lib/supabase/types.ts";
import type { AgentTool } from "../types.ts";

const ROLES: UserRole[] = ["superadmin", "admin", "field"];

/** How many rows a list-style tool hands back to the model — a chat answer,
 * not a page dump. */
const LIST_LIMIT = 20;

function formatError(message: string): ToolErrorResult {
    return { error: message };
}
type ToolErrorResult = { error: string };

// ─── list_projects ─────────────────────────────────────────────────────────

const listProjectsArgs = z.object({
    stage: z.enum(STAGES as [Stage, ...Stage[]]).optional(),
    search: z.string().trim().min(1).optional(),
});

export const listProjectsTool: AgentTool = {
    declaration: {
        name: "list_projects",
        description:
            "Lists projects (leads/customers) in the CRM. Filter by pipeline " +
            `stage, or by a free-text search across name/phone/email/address. ` +
            `Returns at most ${LIST_LIMIT} matches, newest activity first. ` +
            "Use this before get_project when you only have a name to go on.",
        input_schema: {
            type: "object",
            properties: {
                stage: {
                    type: "string",
                    enum: STAGES,
                    description: "Restrict to one pipeline stage (exact value, e.g. \"contract_signed\").",
                },
                search: {
                    type: "string",
                    description: "Free-text search: a name, phone number, email, or address fragment.",
                },
            },
        },
    },
    async run(rawArgs) {
        const parsed = listProjectsArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { stage, search } = parsed.data;

        const leads = search
            ? await searchLeads(search)
            : (await listEnrichedLeads({ stage, limit: LIST_LIMIT })).leads;

        return {
            count: leads.length,
            projects: leads.slice(0, LIST_LIMIT).map((lead) => ({
                id: lead._id,
                name: `${lead.firstName} ${lead.lastName}`,
                stage: lead.stage,
                stageLabel: STAGE_LABELS[lead.stage],
                phone: lead.phone,
                address: lead.property ? `${lead.property.address}, ${lead.property.city}` : null,
                assignedRep: lead.assignedRepName ?? "Unassigned",
                lastActivityAt: lead.lastActivityAt,
            })),
        };
    },
};

// ─── get_project ────────────────────────────────────────────────────────────

const getProjectArgs = z.object({
    projectId: z.string().min(1),
});

export const getProjectTool: AgentTool = {
    declaration: {
        name: "get_project",
        description:
            "Full detail for one project: contact info, stage, address, latest " +
            "quote, and installation schedule if one exists. Requires the " +
            "project's id — call list_projects first if you only have a name.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
            },
            required: ["projectId"],
        },
    },
    async run(rawArgs) {
        const parsed = getProjectArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const leadId = parsed.data.projectId as Id<"leads">;

        const lead = await getLeadById(leadId);
        if (!lead) return formatError("No project found with that id.");

        const [properties, quotes, installation] = await Promise.all([
            getProperties(leadId),
            listQuotesForLead(leadId),
            getInstallationForLead(leadId),
        ]);
        const property = properties[0] ?? null;
        // listQuotesForLead sorts by version descending, so the first row is
        // the latest regardless of status.
        const latestQuote = quotes[0] ?? null;

        return {
            id: lead._id,
            name: `${lead.firstName} ${lead.lastName}`,
            phone: lead.phone,
            email: lead.email ?? null,
            stage: lead.stage,
            stageLabel: STAGE_LABELS[lead.stage],
            assignedRep: lead.assignedRepName ?? "Unassigned",
            lastActivityAt: lead.lastActivityAt,
            notes: lead.notes ?? null,
            address: property ? `${property.address}, ${property.city}, ${property.state} ${property.zip}` : null,
            latestQuote: latestQuote
                ? {
                      status: latestQuote.status,
                      totalPhp: latestQuote.totalPhp,
                      systemSizeKw: latestQuote.systemSizeKw ?? null,
                      version: latestQuote.version,
                  }
                : null,
            installation: installation
                ? {
                      status: installation.status,
                      scheduledDate: installation.scheduledDate,
                      scheduledEndDate: installation.scheduledEndDate,
                      crew: installation.crewNames.map((c) => c.name),
                  }
                : null,
        };
    },
};

// ─── get_schedule ───────────────────────────────────────────────────────────

const getScheduleArgs = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd"),
});

export const getScheduleTool: AgentTool = {
    declaration: {
        name: "get_schedule",
        description:
            "Inspections and installations scheduled between two dates (inclusive), " +
            "company-wide. Resolve relative dates like \"this week\" against " +
            "today's date, given in the system prompt, before calling this.",
        input_schema: {
            type: "object",
            properties: {
                from: { type: "string", description: "Start date, yyyy-mm-dd, inclusive." },
                to: { type: "string", description: "End date, yyyy-mm-dd, inclusive." },
            },
            required: ["from", "to"],
        },
    },
    async run(rawArgs) {
        const parsed = getScheduleArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);

        const events = await listCalendarEvents(parsed.data);
        return {
            count: events.length,
            events: events.map((e) => ({
                kind: e.kind,
                projectId: e.leadId,
                projectName: e.leadName,
                address: e.address,
                assignees: e.assigneeNames,
                startDate: e.startDate,
                endDate: e.endDate,
                time: e.kind === "inspection" ? e.at : null,
            })),
        };
    },
};

// ─── list_packages ──────────────────────────────────────────────────────────

export const listPackagesTool: AgentTool = {
    declaration: {
        name: "list_packages",
        description:
            "Lists active solar system packages available to quote, with " +
            "pricing and the line items each one adds. Call this before " +
            "create_quote to find package ids and see what they cost.",
        input_schema: { type: "object", properties: {} },
    },
    async run() {
        const packages = await listActivePackages();
        return {
            count: packages.length,
            packages: packages.map((pkg) => ({
                id: pkg._id,
                name: pkg.name,
                designType: pkg.designType,
                systemSizeKw: pkg.systemSizeKw ?? null,
                basePricePhp: pkg.basePricePhp,
                items: pkg.items.map((item) => ({
                    description: item.name ? `${item.name} — ${item.description}` : item.description,
                    qty: item.qty,
                    unit: item.unit,
                    unitPricePhp: item.unitPricePhp,
                })),
            })),
        };
    },
};

// ─── get_team ───────────────────────────────────────────────────────────────

const getTeamArgs = z.object({
    role: z.enum(ROLES as [UserRole, ...UserRole[]]).optional(),
});

export const getTeamTool: AgentTool = {
    declaration: {
        name: "get_team",
        description:
            'Lists active team members, optionally filtered by role ("field" ' +
            "for technicians). Use this to find a technician's id before " +
            "schedule_inspection or schedule_installation.",
        input_schema: {
            type: "object",
            properties: {
                role: { type: "string", enum: ROLES, description: "Restrict to one role." },
            },
        },
    },
    async run(rawArgs) {
        const parsed = getTeamArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);

        const users = await listUsers();
        const filtered = users.filter((u) => u.isActive && (!parsed.data.role || u.role === parsed.data.role));

        return {
            count: filtered.length,
            team: filtered.map((u) => ({
                id: u._id,
                name: u.name ?? u.email ?? "Unnamed",
                role: u.role,
            })),
        };
    },
};

// ─── get_contract ───────────────────────────────────────────────────────────

const getContractArgs = z.object({
    projectId: z.string().min(1),
});

export const getContractTool: AgentTool = {
    declaration: {
        name: "get_contract",
        description:
            "A project's contract status — pending signature, signed (with " +
            "date), or cancelled — and which quote it's based on. Useful for " +
            "explaining why schedule_installation is or isn't available yet.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
            },
            required: ["projectId"],
        },
    },
    async run(rawArgs) {
        const parsed = getContractArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);

        const contract = await getContractForLead(parsed.data.projectId as Id<"leads">);
        if (!contract) return { exists: false };

        return {
            exists: true,
            status: contract.status,
            signedAt: contract.signedAt ?? null,
            quoteVersion: contract.quoteVersion,
            systemSizeKw: contract.systemSizeKw ?? null,
        };
    },
};

// ─── get_ocular_report ──────────────────────────────────────────────────────

const getOcularReportArgs = z.object({
    projectId: z.string().min(1),
});

export const getOcularReportTool: AgentTool = {
    declaration: {
        name: "get_ocular_report",
        description:
            "The most recent site ocular inspection's findings for a project: " +
            "roof type/area/orientation, current electricity usage and bill, " +
            "and the recommended system capacity/battery/panel option. Use " +
            "this — together with list_packages — before suggesting a " +
            "package. `completed` tells you whether the report is actually " +
            "finished or still being filled in.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "The project's id, from list_projects." },
            },
            required: ["projectId"],
        },
    },
    async run(rawArgs) {
        const parsed = getOcularReportArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);

        const surveys = await listSurveysForLead(parsed.data.projectId as Id<"leads">);
        // Sorted newest-first, so the first row is the most recent visit.
        const survey = surveys[0];
        if (!survey) return { exists: false };

        return {
            exists: true,
            completed: Boolean(survey.completedAt),
            status: survey.status,
            inspectionDate: survey.inspectionDate ?? null,
            surveyor: survey.surveyorName,
            roof: {
                type: survey.roofType ? ROOF_TYPE_LABELS[survey.roofType] : null,
                areaSqm: survey.roofAreaSqm ?? null,
                orientation: survey.roofOrientation.map((o) => ORIENTATION_LABELS[o]),
                mounting: survey.mounting.map((m) => MOUNTING_LABELS[m]),
                ageYears: survey.roofAgeYears ?? null,
                shadingNotes: survey.shadingNotes ?? null,
            },
            usage: {
                habit: survey.usageHabit ? USAGE_HABIT_LABELS[survey.usageHabit] : null,
                monthlyConsumptionKwh: survey.monthlyConsumptionKwh ?? null,
                monthlyBillPhp: survey.monthlyBillPhp ?? null,
            },
            recommendedSystem: {
                capacity: survey.systemCapacity ? SYSTEM_CAPACITY_LABELS[survey.systemCapacity] : null,
                packageType: survey.packageType ? PACKAGE_TYPE_LABELS[survey.packageType] : null,
                batteryOption: survey.batteryOption ? BATTERY_OPTION_LABELS[survey.batteryOption] : null,
                panelOption: survey.panelOption ? PANEL_OPTION_LABELS[survey.panelOption] : null,
                estimatedSystemSizeKw: survey.estimatedSystemSizeKw ?? null,
            },
            notes: survey.additionalNotes ?? survey.reportNotes ?? null,
            photoCount: survey.photos.length,
        };
    },
};

// ─── list_tickets ───────────────────────────────────────────────────────────

const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "resolved", "closed"];

const listTicketsArgs = z.object({
    projectId: z.string().min(1).optional(),
    status: z.enum(TICKET_STATUSES as [TicketStatus, ...TicketStatus[]]).optional(),
    search: z.string().trim().min(1).optional(),
});

type NormalizedTicket = {
    id: string;
    projectId: string;
    customerName: string | null;
    title: string;
    status: TicketStatus;
    priority: string;
    assignedTo: string | null;
    warrantyRelated: boolean;
};

export const listTicketsTool: AgentTool = {
    declaration: {
        name: "list_tickets",
        description:
            "Lists service/maintenance tickets — company-wide by default, or " +
            "narrowed to one project, a status, or a free-text search across " +
            "title/description.",
        input_schema: {
            type: "object",
            properties: {
                projectId: { type: "string", description: "Restrict to one project's tickets." },
                status: { type: "string", enum: TICKET_STATUSES },
                search: { type: "string", description: "Free-text search across ticket title/description." },
            },
        },
    },
    async run(rawArgs) {
        const parsed = listTicketsArgs.safeParse(rawArgs);
        if (!parsed.success) return formatError(parsed.error.message);
        const { projectId, status, search } = parsed.data;

        let tickets: NormalizedTicket[];
        if (search) {
            const rows = await searchTickets(search);
            tickets = rows
                .filter((t) => !projectId || t.leadId === projectId)
                .map((t) => ({
                    id: t._id,
                    projectId: t.leadId,
                    customerName: t.customerName,
                    title: t.title,
                    status: t.status,
                    priority: t.priority,
                    assignedTo: null,
                    warrantyRelated: t.warrantyRelated,
                }));
        } else if (projectId) {
            const rows = await listTicketsForLead(projectId as Id<"leads">);
            tickets = rows.map((t) => ({
                id: t._id,
                projectId: t.leadId,
                customerName: null,
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignedTo: t.assignedToName,
                warrantyRelated: t.warrantyRelated,
            }));
        } else {
            const rows = await listAllTickets();
            tickets = rows.map((t) => ({
                id: t._id,
                projectId: t.leadId,
                customerName: t.customerName,
                title: t.title,
                status: t.status,
                priority: t.priority,
                assignedTo: null,
                warrantyRelated: t.warrantyRelated,
            }));
        }
        if (status) tickets = tickets.filter((t) => t.status === status);

        return {
            count: tickets.length,
            tickets: tickets.slice(0, LIST_LIMIT).map((t) => ({
                ...t,
                statusLabel: TICKET_STATUS_LABELS[t.status],
                priorityLabel: TICKET_PRIORITY_LABELS[t.priority],
            })),
        };
    },
};

// ─── get_pipeline_summary ───────────────────────────────────────────────────

export const getPipelineSummaryTool: AgentTool = {
    declaration: {
        name: "get_pipeline_summary",
        description:
            "Aggregate pipeline numbers: how many projects are in each stage, " +
            "total projects, how many converted to a signed contract, active " +
            "customers, conversion rate, and which leads have gone stale. " +
            "Good for \"how's the pipeline looking\" questions — use " +
            "list_projects instead when you need actual project names.",
        input_schema: { type: "object", properties: {} },
    },
    async run() {
        const summary = await pipelineSummary();
        return {
            totalProjects: summary.totalLeads,
            converted: summary.converted,
            activeCustomers: summary.activeCustomers,
            conversionRate: summary.conversionRate,
            stageCounts: Object.fromEntries(
                STAGES.map((stage) => [STAGE_LABELS[stage], summary.stageCounts[stage] ?? 0]),
            ),
            staleLeads: summary.staleLeads.map((lead) => ({
                id: lead._id,
                name: lead.name,
                stage: lead.stage,
                stageLabel: STAGE_LABELS[lead.stage],
                daysStale: lead.daysStale,
            })),
        };
    },
};
