import { supabase, toAppError } from "../client.ts";
import type { NotificationEvent, NotificationLogRow } from "../database.types.ts";
import type { Id } from "../types.ts";

export type { NotificationEvent } from "../database.types.ts";

// ─── Notification content templates ─────────────────────────────────────────

function titleAndMessage(
    event: NotificationEvent,
    meta: Record<string, string>,
): { title: string; message: string } {
    const leadName = meta.leadName ?? "a lead";
    switch (event) {
        case "lead_assigned":
            return {
                title: "Lead assigned to you",
                message: `${leadName} has been assigned to you.`,
            };
        case "inspection_scheduled":
            return {
                title: "Inspection scheduled",
                message:
                    `You're assigned to ${leadName}'s site inspection` +
                    (meta.scheduledAt ? `, scheduled for ${meta.scheduledAt}.` : "."),
            };
        case "installation_scheduled":
            return {
                title: "Installation scheduled",
                message:
                    `You're on the crew for ${leadName}'s installation` +
                    (meta.scheduledDate ? `, scheduled for ${meta.scheduledDate}.` : "."),
            };
        case "quote_accepted":
            return {
                title: "Quote approved",
                message: `The quote for ${leadName}${meta.quotationNo ? ` (${meta.quotationNo})` : ""} has been approved.`,
            };
        case "contract_signed":
            return {
                title: "Contract signed",
                message: `${leadName}'s contract has been signed.`,
            };
    }
}

// ─── Write in-app notifications ─────────────────────────────────────────────

/**
 * Inserts notification rows directly into `notification_log`. Unlike the old
 * email flow this never throws — a notification failing to save must not make
 * the caller think their actual action failed.
 */
export async function notifyEvent(args: {
    event: NotificationEvent;
    leadId: Id<"leads">;
    recipientUserIds: Id<"users">[];
    meta?: Record<string, string>;
}): Promise<void> {
    const recipientUserIds = args.recipientUserIds.filter(Boolean);
    if (recipientUserIds.length === 0) return;

    // Resolve lead name for the notification text
    let leadName = "a lead";
    try {
        const { data: lead } = await supabase
            .from("leads")
            .select("first_name, last_name")
            .eq("id", args.leadId)
            .maybeSingle<{ first_name: string; last_name: string }>();
        if (lead) leadName = `${lead.first_name} ${lead.last_name}`;
    } catch {
        // Swallow — the notification will just say "a lead"
    }

    const meta = { ...(args.meta ?? {}), leadName };
    const { title, message } = titleAndMessage(args.event, meta);

    const rows = recipientUserIds.map((uid) => ({
        event: args.event,
        lead_id: args.leadId,
        recipient_user_id: uid,
        status: "sent" as const,
        title,
        message,
        is_read: false,
    }));

    const { error } = await supabase.from("notification_log").insert(rows);
    if (error) console.warn(`Failed to save "${args.event}" notification:`, error.message);
}

// ─── Read notifications ─────────────────────────────────────────────────────

export type AppNotification = {
    id: string;
    event: NotificationEvent;
    leadId: string | null;
    title: string | null;
    message: string | null;
    isRead: boolean;
    createdAt: string;
};

function toAppNotification(row: NotificationLogRow): AppNotification {
    return {
        id: row.id,
        event: row.event,
        leadId: row.lead_id,
        title: row.title,
        message: row.message,
        isRead: row.is_read,
        createdAt: row.created_at,
    };
}

export async function getMyNotifications(
    limit = 50,
    offset = 0,
): Promise<AppNotification[]> {
    const { data, error } = await supabase
        .from("notification_log")
        .select("*")
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
    if (error) throw toAppError(error, "Failed to load notifications");
    return (data as NotificationLogRow[]).map(toAppNotification);
}

export async function getMyUnreadCount(): Promise<number> {
    const { count, error } = await supabase
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false);
    if (error) throw toAppError(error, "Failed to count unread notifications");
    return count ?? 0;
}

export async function markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase
        .from("notification_log")
        .update({ is_read: true })
        .eq("id", id);
    if (error) throw toAppError(error, "Failed to mark notification as read");
}

export async function markAllNotificationsRead(): Promise<void> {
    const { error } = await supabase
        .from("notification_log")
        .update({ is_read: true })
        .eq("is_read", false);
    if (error) throw toAppError(error, "Failed to mark notifications as read");
}
