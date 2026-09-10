/**
 * React Query bindings for the Supabase data layer — the replacement for
 * Convex's `useQuery(api.x.y)` / `useMutation(api.x.y)`.
 *
 * Two properties of the Convex hooks are preserved deliberately, because the
 * components rely on them:
 *   · `data` is `undefined` while loading (the `x === undefined` skeleton checks)
 *   · mutations are called as `await mutateAsync(args)` with one args object
 *
 * Live updates are not automatic the way Convex's were; `useRealtimeSync()` in
 * ./realtime.ts invalidates these keys from Postgres change events.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type {
    ChecklistItem,
    FinancingOption,
    InstallationStatus,
    LeadFileKind,
    LeadStage,
    PermitStatus,
    PermitType,
    PropertyType,
    QuoteStatus,
    RoofType,
    SurveyStatus,
    TicketPriority,
    TicketStatus,
    UserRole,
} from "./database.types.ts";
import type { Id } from "./types.ts";

import * as calendarApi from "./queries/calendar.ts";
import * as contractsApi from "./queries/contracts.ts";
import * as installationsApi from "./queries/installations.ts";
import * as leadFilesApi from "./queries/lead-files.ts";
import * as leadNotesApi from "./queries/lead-notes.ts";
import * as leadsApi from "./queries/leads.ts";
import * as notificationsApi from "./queries/notifications.ts";
import * as packagesApi from "./queries/packages.ts";
import * as permitsApi from "./queries/permits.ts";
import * as quotesApi from "./queries/quotes.ts";
import * as reportsApi from "./queries/reports.ts";
import * as ticketsApi from "./queries/service-tickets.ts";
import * as surveysApi from "./queries/surveys.ts";
import * as usersApi from "./queries/users.ts";

// ─── Query keys ───────────────────────────────────────────────────────────
// Hierarchical, so a mutation can invalidate a whole domain with one call.

export const queryKeys = {
    currentUser: ["currentUser"] as const,
    users: ["users"] as const,

    leads: ["leads"] as const,
    leadList: (filters: unknown) => ["leads", "list", filters] as const,
    leadsEnriched: (filters: unknown) => ["leads", "enriched", filters] as const,
    lead: (id: string) => ["leads", "detail", id] as const,
    leadProperties: (id: string) => ["leads", "properties", id] as const,
    leadActivity: (id: string) => ["leads", "activity", id] as const,
    leadSearch: (q: string) => ["leads", "search", q] as const,
    ticketSearch: (q: string) => ["service_tickets", "search", q] as const,

    leadNotes: ["leadNotes"] as const,
    leadNotesForLead: (leadId: string) => ["leadNotes", "lead", leadId] as const,

    leadFiles: ["leadFiles"] as const,
    leadFilesForLead: (leadId: string) => ["leadFiles", "lead", leadId] as const,

    surveys: ["surveys"] as const,
    surveysForLead: (leadId: string) => ["surveys", "lead", leadId] as const,
    myInspections: (status?: SurveyStatus) =>
        ["surveys", "mine", status ?? "all"] as const,

    quotes: ["quotes"] as const,
    quotesForLead: (leadId: string) => ["quotes", "lead", leadId] as const,
    quoteWithItems: (quoteId: string) => ["quotes", "detail", quoteId] as const,

    contracts: ["contracts"] as const,
    contractForLead: (leadId: string) => ["contracts", "lead", leadId] as const,

    permits: ["permits"] as const,
    permitsForLead: (leadId: string) => ["permits", "lead", leadId] as const,

    installations: ["installations"] as const,
    installationForLead: (leadId: string) => ["installations", "lead", leadId] as const,
    myInstallations: ["installations", "mine"] as const,

    serviceTickets: ["serviceTickets"] as const,
    ticketsForLead: (leadId: string) => ["serviceTickets", "lead", leadId] as const,
    allTickets: ["serviceTickets", "all"] as const,

    reports: ["reports"] as const,

    packages: ["packages"] as const,
    activePackages: ["packages", "active"] as const,

    calendarEvents: (from: string, to: string) => ["calendarEvents", from, to] as const,

    myNotificationPreferences: ["notificationPreferences", "mine"] as const,
} as const;

/**
 * Anything that writes to the pipeline touches lead rows (stage, activity
 * timestamp) and therefore the dashboards and reports too.
 */
function invalidatePipeline(client: QueryClient) {
    return Promise.all([
        client.invalidateQueries({ queryKey: queryKeys.leads }),
        client.invalidateQueries({ queryKey: queryKeys.reports }),
    ]);
}

// ─── Users ────────────────────────────────────────────────────────────────

export function useCurrentUser() {
    return useQuery({
        queryKey: queryKeys.currentUser,
        queryFn: usersApi.getCurrentUser,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
}

export function useUsers() {
    return useQuery({
        queryKey: queryKeys.users,
        queryFn: usersApi.listUsers,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });
}

export function useUpdateUserRole() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: usersApi.updateUserRole,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.users }),
                client.invalidateQueries({ queryKey: queryKeys.currentUser }),
            ]),
    });
}

export function useUpdateUserStatus() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: usersApi.updateUserStatus,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.users }),
    });
}

export function useDeleteUser() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: usersApi.deleteUser,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.users }),
    });
}

export function useUpdateOwnProfile() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: usersApi.updateOwnProfile,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.currentUser }),
                client.invalidateQueries({ queryKey: queryKeys.users }),
            ]),
    });
}

// ─── Leads ────────────────────────────────────────────────────────────────

export function useLeads(
    filters: {
        stage?: LeadStage;
        assignedSalesRepId?: Id<"users">;
        limit?: number;
    } = {},
) {
    return useQuery({
        queryKey: queryKeys.leadList(filters),
        queryFn: () => leadsApi.listLeads(filters),
    });
}

/**
 * Resolves to `{ leads, total, truncated }` — `total` is the exact count of
 * matching rows, so a view can tell the user when the fetch was capped rather
 * than showing a short list as if it were complete.
 */
export function useEnrichedLeads(
    filters: {
        stage?: LeadStage;
        assignedSalesRepId?: Id<"users">;
        limit?: number;
    } = {},
) {
    return useQuery({
        queryKey: queryKeys.leadsEnriched(filters),
        queryFn: () => leadsApi.listEnrichedLeads(filters),
    });
}

export function useLead(id: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.lead(id ?? ""),
        queryFn: () => leadsApi.getLeadById(id!),
        enabled: !!id,
    });
}

export function useLeadProperties(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.leadProperties(leadId ?? ""),
        queryFn: () => leadsApi.getProperties(leadId!),
        enabled: !!leadId,
    });
}

export function useLeadActivity(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.leadActivity(leadId ?? ""),
        queryFn: () => leadsApi.getActivity(leadId!),
        enabled: !!leadId,
    });
}

/** `enabled` stands in for Convex's `"skip"` argument. */
export function useLeadSearch(q: string) {
    const term = q.trim();
    return useQuery({
        queryKey: queryKeys.leadSearch(term),
        queryFn: () => leadsApi.searchLeads(term),
        enabled: term.length > 1,
    });
}

/** Same shape as `useLeadSearch` — enabled once there's something to say. */
export function useTicketSearch(q: string) {
    const term = q.trim();
    return useQuery({
        queryKey: queryKeys.ticketSearch(term),
        queryFn: () => ticketsApi.searchTickets(term),
        enabled: term.length > 1,
    });
}

export function useCreateLead() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadsApi.createLead,
        onSuccess: () => invalidatePipeline(client),
    });
}

export function useUpdateLead() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadsApi.updateLead,
        onSuccess: () => invalidatePipeline(client),
    });
}

export function useUpdateStage() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadsApi.updateStage,
        onSuccess: () => invalidatePipeline(client),
    });
}

export function useUpdateProperty() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadsApi.updateProperty,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.leads }),
    });
}

// ─── Overview: notes ──────────────────────────────────────────────────────

export function useLeadNotes(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.leadNotesForLead(leadId ?? ""),
        queryFn: () => leadNotesApi.listLeadNotes(leadId!),
        enabled: !!leadId,
    });
}

/**
 * Writing a note also writes an activity line and bumps `last_activity_at`,
 * so the lead's staleness and history both have to be refreshed with it.
 */
export function useAddLeadNote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadNotesApi.addLeadNote,
        onSuccess: (_result, variables) =>
            Promise.all([
                client.invalidateQueries({
                    queryKey: queryKeys.leadNotesForLead(variables.leadId),
                }),
                invalidatePipeline(client),
            ]),
    });
}

/** An edit touches only the note's own text — nothing downstream reads it. */
export function useUpdateLeadNote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadNotesApi.updateLeadNote,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.leadNotes }),
    });
}

export function useDeleteLeadNote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadNotesApi.deleteLeadNote,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.leadNotes }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
            ]),
    });
}

// ─── Overview: files ──────────────────────────────────────────────────────

export function useLeadFiles(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.leadFilesForLead(leadId ?? ""),
        queryFn: () => leadFilesApi.listLeadFiles(leadId!),
        enabled: !!leadId,
    });
}

export function useUploadLeadFiles() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadFilesApi.uploadLeadFiles,
        onSuccess: (_result, variables) =>
            Promise.all([
                client.invalidateQueries({
                    queryKey: queryKeys.leadFilesForLead(variables.leadId),
                }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeleteLeadFile() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadFilesApi.deleteLeadFile,
        onSuccess: (_result, variables) =>
            Promise.all([
                client.invalidateQueries({
                    queryKey: queryKeys.leadFilesForLead(variables.leadId),
                }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
            ]),
    });
}

export function useDeleteLead() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: leadsApi.deleteLead,
        onSuccess: () => invalidatePipeline(client),
    });
}

// ─── Surveys ──────────────────────────────────────────────────────────────

export function useSurveysForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.surveysForLead(leadId ?? ""),
        queryFn: () => surveysApi.listSurveysForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useMyInspections(args: { status?: SurveyStatus } = {}) {
    return useQuery({
        queryKey: queryKeys.myInspections(args.status),
        queryFn: () => surveysApi.listMyInspections(args),
    });
}

export function useScheduleSurvey() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.scheduleSurvey,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.surveys }),
                invalidatePipeline(client),
            ]),
    });
}

/**
 * Saves one section of the Site Ocular Report.
 *
 * No pipeline invalidation: saving a field does not move the lead, and the
 * report form is long enough that refetching the whole lead on every section
 * save would fight the person typing.
 */
export function useSaveSurveyReport() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.saveSurveyReport,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.surveys }),
    });
}

export function useAddSurveyPhotos() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.addSurveyPhotos,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.surveys }),
    });
}

export function useDeleteSurveyPhoto() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.deleteSurveyPhoto,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.surveys }),
    });
}

export function useUpdateSurveyPhotoCaption() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.updateSurveyPhotoCaption,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.surveys }),
    });
}

/** Marks a visit done, or undoes it — also refreshes the field dashboard. */
export function useSetSurveyCompleted() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.setSurveyCompleted,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.surveys }),
                client.invalidateQueries({ queryKey: ["surveys", "mine"] }),
                invalidatePipeline(client),
            ]),
    });
}

export function useCancelSurvey() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.cancelSurvey,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.surveys }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeleteSurvey() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: surveysApi.deleteSurvey,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.surveys }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Quotes ───────────────────────────────────────────────────────────────

export function useQuotesForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.quotesForLead(leadId ?? ""),
        queryFn: () => quotesApi.listQuotesForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useQuoteWithItems(quoteId: Id<"quotes"> | undefined) {
    return useQuery({
        queryKey: queryKeys.quoteWithItems(quoteId ?? ""),
        queryFn: () => quotesApi.getQuoteWithItems(quoteId!),
        enabled: !!quoteId,
    });
}

export function useCreateQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.createQuote,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                invalidatePipeline(client),
            ]),
    });
}

export function useSaveQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.saveQuote,
        onSuccess: (_data, variables) =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                client.invalidateQueries({
                    queryKey: queryKeys.quoteWithItems(variables.quoteId),
                }),
                invalidatePipeline(client),
            ]),
    });
}

export function useApproveQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.approveQuote,
        onSuccess: (_data, variables) =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                client.invalidateQueries({
                    queryKey: queryKeys.quoteWithItems(variables.quoteId),
                }),
                invalidatePipeline(client),
            ]),
    });
}

export function useReopenQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.reopenQuote,
        onSuccess: (_data, variables) =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                client.invalidateQueries({
                    queryKey: queryKeys.quoteWithItems(variables.quoteId),
                }),
                invalidatePipeline(client),
            ]),
    });
}

export function useReviseQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.reviseQuote,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeleteQuote() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.deleteQuote,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeleteQuotes() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: quotesApi.deleteQuotes,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Contracts ────────────────────────────────────────────────────────────

export function useContractForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.contractForLead(leadId ?? ""),
        queryFn: () => contractsApi.getContractForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useCreateContract() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.createContract,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.contracts }),
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
                invalidatePipeline(client),
            ]),
    });
}

export function useMarkContractSigned() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.markContractSigned,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.contracts }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
                invalidatePipeline(client),
            ]),
    });
}

export function useMarkContractCancelled() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.markContractCancelled,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.contracts }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
                invalidatePipeline(client),
            ]),
    });
}

export function useAttachContractDocument() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.attachContractDocument,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.contracts }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
                invalidatePipeline(client),
            ]),
    });
}

export function useUpdateContractNotes() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.updateContractNotes,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.contracts }),
    });
}

export function useUpdateContractDetails() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.updateContractDetails,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.contracts }),
    });
}

export function useDeleteContract() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: contractsApi.deleteContract,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.contracts }),
                client.invalidateQueries({ queryKey: queryKeys.quotes }),
                client.invalidateQueries({ queryKey: queryKeys.leads }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Permits ──────────────────────────────────────────────────────────────

export function usePermitsForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.permitsForLead(leadId ?? ""),
        queryFn: () => permitsApi.listPermitsForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useCreatePermit() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: permitsApi.createPermit,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.permits }),
                invalidatePipeline(client),
            ]),
    });
}

export function useUpdatePermitStatus() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: permitsApi.updatePermitStatus,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.permits }),
                invalidatePipeline(client),
            ]),
    });
}

export function useAttachPermitDocument() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: permitsApi.attachPermitDocument,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.permits }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeletePermit() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: permitsApi.deletePermit,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.permits }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Installations ────────────────────────────────────────────────────────

export function useInstallationForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.installationForLead(leadId ?? ""),
        queryFn: () => installationsApi.getInstallationForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useMyInstallations() {
    return useQuery({
        queryKey: queryKeys.myInstallations,
        queryFn: installationsApi.listMyInstallations,
    });
}

export function useCreateInstallation() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.createInstallation,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.installations }),
                invalidatePipeline(client),
            ]),
    });
}

export function useUpdateInstallationStatus() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.updateInstallationStatus,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.installations }),
                invalidatePipeline(client),
            ]),
    });
}

export function useToggleChecklistItem() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.toggleChecklistItem,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.installations }),
    });
}

export function useAddChecklistItem() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.addChecklistItem,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.installations }),
    });
}

export function useAddCompletionPhotos() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.addCompletionPhotos,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.installations }),
                invalidatePipeline(client),
            ]),
    });
}

export function useActivateCustomer() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: installationsApi.activateCustomer,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.installations }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Service tickets ──────────────────────────────────────────────────────

export function useTicketsForLead(leadId: Id<"leads"> | undefined) {
    return useQuery({
        queryKey: queryKeys.ticketsForLead(leadId ?? ""),
        queryFn: () => ticketsApi.listTicketsForLead(leadId!),
        enabled: !!leadId,
    });
}

export function useAllTickets() {
    return useQuery({
        queryKey: queryKeys.allTickets,
        queryFn: ticketsApi.listAllTickets,
    });
}

export function useCreateTicket() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ticketsApi.createTicket,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.serviceTickets }),
                invalidatePipeline(client),
            ]),
    });
}

export function useUpdateTicketStatus() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ticketsApi.updateTicketStatus,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.serviceTickets }),
                invalidatePipeline(client),
            ]),
    });
}

export function useDeleteTicket() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: ticketsApi.deleteTicket,
        onSuccess: () =>
            Promise.all([
                client.invalidateQueries({ queryKey: queryKeys.serviceTickets }),
                invalidatePipeline(client),
            ]),
    });
}

// ─── Reports ──────────────────────────────────────────────────────────────

// ─── Packages ─────────────────────────────────────────────────────────────

export function usePackages() {
    return useQuery({
        queryKey: queryKeys.packages,
        queryFn: packagesApi.listPackages,
    });
}

export function useActivePackages() {
    return useQuery({
        queryKey: queryKeys.activePackages,
        queryFn: packagesApi.listActivePackages,
    });
}

export function useCreatePackage() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: packagesApi.createPackage,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.packages }),
    });
}

export function useUpdatePackage() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: packagesApi.updatePackage,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.packages }),
    });
}

export function useTogglePackageActive() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: packagesApi.togglePackageActive,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.packages }),
    });
}

export function useReorderPackages() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: packagesApi.reorderPackages,
        onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.packages }),
    });
}

export function usePipelineSummary() {
    return useQuery({ queryKey: ["reports", "pipeline"], queryFn: reportsApi.pipelineSummary });
}

export function usePermitsSummary() {
    return useQuery({ queryKey: ["reports", "permits"], queryFn: reportsApi.permitsSummary });
}

export function useQuotesRevenueSummary() {
    return useQuery({
        queryKey: ["reports", "revenue"],
        queryFn: reportsApi.quotesRevenueSummary,
    });
}

export function useInstallationsSummary() {
    return useQuery({
        queryKey: ["reports", "installations"],
        queryFn: reportsApi.installationsSummary,
    });
}

// ─── Calendar ─────────────────────────────────────────────────────────────

export function useCalendarEvents(range: { from: string; to: string }) {
    return useQuery({
        queryKey: queryKeys.calendarEvents(range.from, range.to),
        queryFn: () => calendarApi.listCalendarEvents(range),
    });
}

// ─── Notification preferences ──────────────────────────────────────────────

export function useMyNotificationPreferences() {
    return useQuery({
        queryKey: queryKeys.myNotificationPreferences,
        queryFn: notificationsApi.getMyNotificationPreferences,
    });
}

export function useUpdateMyNotificationPreferences() {
    const client = useQueryClient();
    return useMutation({
        mutationFn: notificationsApi.updateMyNotificationPreferences,
        onSuccess: () =>
            client.invalidateQueries({ queryKey: queryKeys.myNotificationPreferences }),
    });
}

// Re-exported so callers can type their handlers without reaching into
// ./database.types.ts directly.
export type {
    ChecklistItem,
    FinancingOption,
    InstallationStatus,
    LeadFileKind,
    LeadStage,
    PermitStatus,
    PermitType,
    PropertyType,
    QuoteStatus,
    RoofType,
    SurveyStatus,
    TicketPriority,
    TicketStatus,
    UserRole,
};
