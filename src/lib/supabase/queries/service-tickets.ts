/** Replaces convex/serviceTickets.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { LeadRow, ServiceTicketRow, TicketPriority, TicketStatus } from "../database.types.ts";
import {
    toServiceTicket,
    type Id,
    type ServiceTicketDetail,
    type ServiceTicketWithCustomer,
} from "../types.ts";
import { logActivity } from "./leads.ts";

type NameOnly = { name: string | null; email: string | null } | null;

export async function listTicketsForLead(
    leadId: Id<"leads">,
): Promise<ServiceTicketDetail[]> {
    const rows = unwrap(
        await supabase
            .from("service_tickets")
            .select("*, assignee:users!service_tickets_assigned_to_id_fkey(name, email)")
            .eq("lead_id", leadId)
            .order("created_at", { ascending: false })
            .returns<(ServiceTicketRow & { assignee: NameOnly })[]>(),
        "Failed to load service tickets",
    );

    return rows.map((row) => ({
        ...toServiceTicket(row),
        assignedToName: row.assignee
            ? (row.assignee.name ?? row.assignee.email ?? null)
            : null,
    }));
}

export async function listAllTickets(): Promise<ServiceTicketWithCustomer[]> {
    const rows = unwrap(
        await supabase
            .from("service_tickets")
            .select("*, leads(first_name, last_name)")
            .order("created_at", { ascending: false })
            .returns<
                (ServiceTicketRow & {
                    leads: Pick<LeadRow, "first_name" | "last_name"> | null;
                })[]
            >(),
        "Failed to load service tickets",
    );

    return rows.map((row) => ({
        ...toServiceTicket(row),
        customerName: row.leads
            ? `${row.leads.first_name} ${row.leads.last_name}`
            : "Unknown",
    }));
}

/** Case-insensitive match across title and description, for global search. */
export async function searchTickets(q: string): Promise<ServiceTicketWithCustomer[]> {
    const term = q.trim();
    if (term.length < 2) return [];

    const pattern = `%${term.replace(/[%_,()]/g, "")}%`;
    const rows = unwrap(
        await supabase
            .from("service_tickets")
            .select("*, leads(first_name, last_name)")
            .or(`title.ilike.${pattern},description.ilike.${pattern}`)
            .order("created_at", { ascending: false })
            .limit(8)
            .returns<
                (ServiceTicketRow & {
                    leads: Pick<LeadRow, "first_name" | "last_name"> | null;
                })[]
            >(),
        "Failed to search service tickets",
    );

    return rows.map((row) => ({
        ...toServiceTicket(row),
        customerName: row.leads
            ? `${row.leads.first_name} ${row.leads.last_name}`
            : "Unknown",
    }));
}

export async function createTicket(args: {
    leadId: Id<"leads">;
    installationId: Id<"installations">;
    title: string;
    description: string;
    priority: TicketPriority;
    assignedToId?: Id<"users">;
    scheduledVisitAt?: string;
    warrantyRelated: boolean;
}): Promise<Id<"serviceTickets">> {
    const ticket = unwrap(
        await supabase
            .from("service_tickets")
            .insert({
                lead_id: args.leadId,
                installation_id: args.installationId,
                title: args.title,
                description: args.description,
                status: "open",
                priority: args.priority,
                assigned_to_id: args.assignedToId || null,
                scheduled_visit_at: args.scheduledVisitAt || null,
                warranty_related: args.warrantyRelated,
            })
            .select("id")
            .single(),
        "Failed to create ticket",
    ) as { id: string };

    await logActivity({
        leadId: args.leadId,
        action: `Service ticket created: ${args.title}`,
        details: `Priority: ${args.priority}${args.warrantyRelated ? " · Warranty" : ""}`,
        entityType: "serviceTicket",
        entityId: ticket.id,
    });

    return ticket.id;
}

export async function updateTicketStatus(args: {
    ticketId: Id<"serviceTickets">;
    status: TicketStatus;
}): Promise<void> {
    const ticket = unwrap(
        await supabase
            .from("service_tickets")
            .select("lead_id, title")
            .eq("id", args.ticketId)
            .single(),
        "Ticket not found",
    ) as { lead_id: string; title: string };

    const { error } = await supabase
        .from("service_tickets")
        .update({
            status: args.status,
            ...(args.status === "resolved"
                ? { resolved_at: new Date().toISOString() }
                : {}),
        })
        .eq("id", args.ticketId);

    if (error) throw toAppError(error, "Failed to update ticket");

    await logActivity({
        leadId: ticket.lead_id,
        action: `Service ticket "${ticket.title}" marked ${args.status.replace(/_/g, " ")}`,
        entityType: "serviceTicket",
        entityId: args.ticketId,
    });
}

export async function deleteTicket(args: {
    ticketId: Id<"serviceTickets">;
}): Promise<void> {
    const ticket = unwrap(
        await supabase
            .from("service_tickets")
            .select("lead_id, title")
            .eq("id", args.ticketId)
            .single(),
        "Ticket not found",
    ) as { lead_id: string; title: string };

    const { error } = await supabase
        .from("service_tickets")
        .delete()
        .eq("id", args.ticketId);
    if (error) throw toAppError(error, "Failed to delete ticket");

    await logActivity({
        leadId: ticket.lead_id,
        action: `Service ticket "${ticket.title}" deleted`,
        entityType: "serviceTicket",
    });
}
