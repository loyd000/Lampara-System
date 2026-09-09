/**
 * `notify` — sends the email side of six pipeline events.
 *
 * Called fire-and-forget from the app right after the write that caused the
 * event (see `notifyEvent()` in `src/lib/supabase/queries/notifications.ts`):
 * a failure here must never surface as a failure of the user's actual action,
 * which is why the client wrapper swallows errors — but this function still
 * logs every attempt to `notification_log` so a silent failure is at least
 * debuggable from the database afterward.
 *
 * Request body:
 *   {
 *     event: "lead_assigned" | "inspection_scheduled" | "installation_scheduled"
 *          | "quote_accepted" | "contract_signed" | "permit_overdue",
 *     leadId: string,
 *     recipientUserIds: string[],   // who to notify — never an email address
 *     meta?: Record<string, string> // small bits of context for the template
 *   }
 *
 * Deploy: `supabase functions deploy notify`
 * Secrets: `supabase secrets set RESEND_API_KEY=... NOTIFY_FROM="Lampara <notify@yourdomain>"`
 */
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { callerClient, serviceClient } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/email.ts";

type NotificationEvent =
    | "lead_assigned"
    | "inspection_scheduled"
    | "installation_scheduled"
    | "quote_accepted"
    | "contract_signed"
    | "permit_overdue";

const PREFERENCE_COLUMN: Record<NotificationEvent, string> = {
    lead_assigned: "lead_assigned",
    inspection_scheduled: "inspection_scheduled",
    installation_scheduled: "installation_scheduled",
    quote_accepted: "quote_accepted",
    contract_signed: "contract_signed",
    permit_overdue: "permit_overdue",
};

function subjectAndBody(
    event: NotificationEvent,
    leadName: string,
    meta: Record<string, string>,
): { subject: string; body: string } {
    switch (event) {
        case "lead_assigned":
            return {
                subject: `Lead assigned to you: ${leadName}`,
                body: `${leadName} has been assigned to you in Lampara CRM. Open the lead to get started.`,
            };
        case "inspection_scheduled":
            return {
                subject: `Site ocular inspection scheduled: ${leadName}`,
                body: `You're the assigned technician for ${leadName}'s site inspection` +
                    (meta.scheduledAt ? `, scheduled for ${meta.scheduledAt}.` : "."),
            };
        case "installation_scheduled":
            return {
                subject: `Installation scheduled: ${leadName}`,
                body: `You're on the crew for ${leadName}'s installation` +
                    (meta.scheduledDate ? `, scheduled for ${meta.scheduledDate}.` : "."),
            };
        case "quote_accepted":
            return {
                subject: `Quote approved: ${leadName}`,
                body: `The quote for ${leadName}${meta.quotationNo ? ` (${meta.quotationNo})` : ""} has been approved. The lead has moved to Proposal Sent.`,
            };
        case "contract_signed":
            return {
                subject: `Contract signed: ${leadName}`,
                body: `${leadName}'s contract has been signed. The lead is ready for permitting.`,
            };
        case "permit_overdue":
            return {
                subject: `Permit overdue: ${leadName}`,
                body: `A permit for ${leadName} has passed its due date and needs attention.`,
            };
    }
}

Deno.serve(async (req) => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    try {
        // Confirm the request comes from a signed-in session. We don't need
        // *who* beyond that — the recipients are named explicitly in the
        // body, and every address is still resolved server-side below.
        const { data: auth } = await callerClient(req).auth.getUser();
        if (!auth.user) {
            return new Response(JSON.stringify({ error: "Not signed in" }), {
                status: 401,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const body = (await req.json()) as {
            event: NotificationEvent;
            leadId: string;
            recipientUserIds: string[];
            meta?: Record<string, string>;
        };

        if (!body.event || !PREFERENCE_COLUMN[body.event]) {
            return new Response(JSON.stringify({ error: "Unknown event" }), {
                status: 400,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }
        const recipientIds = [...new Set(body.recipientUserIds ?? [])].filter(Boolean);
        if (recipientIds.length === 0) {
            return new Response(JSON.stringify({ sent: 0, skipped: 0, failed: 0 }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
        }

        const db = serviceClient();
        const meta = body.meta ?? {};

        const [{ data: lead }, { data: recipients }, { data: prefs }] = await Promise.all([
            db.from("leads").select("first_name, last_name").eq("id", body.leadId).maybeSingle(),
            db
                .from("users")
                .select("id, name, email, is_active")
                .in("id", recipientIds),
            db
                .from("notification_preferences")
                .select("*")
                .in("user_id", recipientIds),
        ]);

        const leadName = lead ? `${lead.first_name} ${lead.last_name}` : "a lead";
        const { subject, body: text } = subjectAndBody(body.event, leadName, meta);
        const prefsByUser = new Map((prefs ?? []).map((p) => [p.user_id, p]));
        const prefColumn = PREFERENCE_COLUMN[body.event];

        let sent = 0, skipped = 0, failed = 0;

        for (const recipientId of recipientIds) {
            const user = (recipients ?? []).find((r) => r.id === recipientId);
            const pref = prefsByUser.get(recipientId);
            // Missing preference row means "never asked" — defaults to on,
            // matching the client's lazy-create-on-first-read behaviour.
            const optedIn = pref ? pref[prefColumn] !== false : true;

            let status: "sent" | "skipped" | "failed";
            let error: string | null = null;

            if (!user || !user.is_active || !user.email) {
                status = "skipped";
            } else if (!optedIn) {
                status = "skipped";
            } else {
                const result = await sendEmail({ to: user.email, subject, text });
                if (result.ok) {
                    status = "sent";
                } else {
                    status = "failed";
                    error = result.error;
                }
            }

            if (status === "sent") sent++;
            else if (status === "skipped") skipped++;
            else failed++;

            await db.from("notification_log").insert({
                event: body.event,
                lead_id: body.leadId,
                recipient_user_id: recipientId,
                status,
                error,
            });
        }

        return new Response(JSON.stringify({ sent, skipped, failed }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
