import { supabase, toAppError } from "../client.ts";
import type { NotificationEvent, NotificationPreferencesRow } from "../database.types.ts";
import type { Id } from "../types.ts";

export type { NotificationEvent } from "../database.types.ts";

export type NotificationPreferences = {
    leadAssigned: boolean;
    inspectionScheduled: boolean;
    installationScheduled: boolean;
    quoteAccepted: boolean;
    contractSigned: boolean;
};

const DEFAULT_PREFERENCES: NotificationPreferences = {
    leadAssigned: true,
    inspectionScheduled: true,
    installationScheduled: true,
    quoteAccepted: true,
    contractSigned: true,
};

function toPreferences(row: NotificationPreferencesRow): NotificationPreferences {
    return {
        leadAssigned: row.lead_assigned,
        inspectionScheduled: row.inspection_scheduled,
        installationScheduled: row.installation_scheduled,
        quoteAccepted: row.quote_accepted,
        contractSigned: row.contract_signed,
    };
}

/**
 * A missing row means "never asked," not "opted out" — so a first read
 * creates one with everything on, rather than requiring a signup-time
 * backfill for every existing user.
 */
export async function getMyNotificationPreferences(): Promise<NotificationPreferences> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return DEFAULT_PREFERENCES;

    const { data: existing, error: selectError } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", auth.user.id)
        .maybeSingle<NotificationPreferencesRow>();
    if (selectError) throw toAppError(selectError, "Failed to load notification preferences");
    if (existing) return toPreferences(existing);

    const { data: created, error: insertError } = await supabase
        .from("notification_preferences")
        .insert({ user_id: auth.user.id })
        .select("*")
        .single<NotificationPreferencesRow>();
    if (insertError) throw toAppError(insertError, "Failed to set up notification preferences");
    return toPreferences(created);
}

export async function updateMyNotificationPreferences(
    prefs: Partial<NotificationPreferences>,
): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const { error } = await supabase
        .from("notification_preferences")
        .upsert({
            user_id: auth.user.id,
            ...(prefs.leadAssigned !== undefined && { lead_assigned: prefs.leadAssigned }),
            ...(prefs.inspectionScheduled !== undefined && {
                inspection_scheduled: prefs.inspectionScheduled,
            }),
            ...(prefs.installationScheduled !== undefined && {
                installation_scheduled: prefs.installationScheduled,
            }),
            ...(prefs.quoteAccepted !== undefined && { quote_accepted: prefs.quoteAccepted }),
            ...(prefs.contractSigned !== undefined && { contract_signed: prefs.contractSigned }),
        });
    if (error) throw toAppError(error, "Failed to save notification preferences");
}

/**
 * Fires the `notify` Edge Function and never throws — a notification email
 * failing to send must not make the caller think their actual action (the
 * lead assignment, the schedule, the approval) failed. Every attempt is still
 * logged server-side in `notification_log`, so a silent failure here is at
 * least debuggable later.
 */
export async function notifyEvent(args: {
    event: NotificationEvent;
    leadId: Id<"leads">;
    recipientUserIds: Id<"users">[];
    meta?: Record<string, string>;
}): Promise<void> {
    const recipientUserIds = args.recipientUserIds.filter(Boolean);
    if (recipientUserIds.length === 0) return;

    const { error } = await supabase.functions.invoke("notify", {
        body: {
            event: args.event,
            leadId: args.leadId,
            recipientUserIds,
            meta: args.meta ?? {},
        },
    });
    if (error) console.warn(`Failed to send "${args.event}" notification:`, error.message);
}
