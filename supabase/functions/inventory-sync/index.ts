/**
 * `inventory-sync` — read-only project feed for the companion Inventory
 * System's "CRM Sync" pull. It calls this endpoint on its own schedule and
 * expects a bare JSON array; nothing in this repo calls it.
 *
 * Auth is a shared secret, not a Supabase session — the caller is another
 * app's backend, not someone signed in to Lampara. Matches the "Authorization
 * Header" field in the Inventory System's CRM Sync settings:
 *   Authorization: Bearer <LAMPARA_SYNC_SECRET>
 *
 * Deliberately NOT the Supabase auto-generated REST API pointed straight at
 * `leads` (the simpler-looking alternative): that would mean either handing
 * the service-role key to an external caller (bypasses RLS entirely, and is
 * a much more sensitive secret to put in another app's env vars), or opening
 * an RLS policy for anonymous reads on customer data. A dedicated function
 * keeps the service-role key server-side-only here, exposes exactly the
 * fields below, and the shared secret is the only thing that leaves this
 * project — easy to rotate, useless for anything but this one read.
 *
 * Field mapping on the Inventory System's side (Settings → CRM Sync):
 *   Project ID     -> id
 *   Project Name   -> name          (customer name — Lampara has no separate
 *                                     "project name"; the project *is* the
 *                                     customer's job)
 *   Client Name    -> client_name   (same value as `name`, on purpose)
 *   Location       -> location      ("City, Province" from the property on
 *                                     file, same format Lampara's own
 *                                     Projects list shows — null pre-survey)
 * Status/Start Date/End Date are deliberately not sent — the Inventory
 * System doesn't need them, so this doesn't touch the installations table
 * at all.
 *
 * Deploy (note --no-verify-jwt — the caller sends the shared secret above,
 * not a Supabase-issued JWT, so Supabase's own gateway must not reject it
 * before this code even runs):
 *   supabase functions deploy inventory-sync --no-verify-jwt
 * Secrets:
 *   supabase secrets set LAMPARA_SYNC_SECRET=<a long random value>
 * Put the same URL + `Bearer <value>` into the Inventory System's
 * CRM Sync settings.
 */
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { serviceClient } from "../_shared/supabase.ts";

type LeadRow = {
    id: string;
    first_name: string;
    last_name: string;
    properties: { city: string; state: string }[] | null;
};

Deno.serve(async (req) => {
    const preflight = handleCorsPreflight(req);
    if (preflight) return preflight;

    const expected = `Bearer ${Deno.env.get("LAMPARA_SYNC_SECRET") ?? ""}`;
    if (!Deno.env.get("LAMPARA_SYNC_SECRET") || req.headers.get("Authorization") !== expected) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    try {
        const db = serviceClient();

        const { data: leads, error: leadsError } = await db
            .from("leads")
            .select("id, first_name, last_name, properties(city, state)")
            .returns<LeadRow[]>();
        if (leadsError) throw leadsError;

        const projects = (leads ?? []).map((lead) => {
            const name = `${lead.first_name} ${lead.last_name}`;
            const property = lead.properties?.[0] ?? null;
            return {
                id: lead.id,
                name,
                client_name: name,
                location: property ? `${property.city}, ${property.state}` : null,
            };
        });

        return new Response(JSON.stringify(projects), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (e) {
        return new Response(
            JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }
});
