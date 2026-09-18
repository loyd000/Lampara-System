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
 * Only sends projects that have real installation logistics to hand off:
 * stage is installation_scheduled, installation_complete, or active_customer
 * (`ELIGIBLE_STAGES` below) — a project still earlier in the pipeline has no
 * signed contract yet (so no inverter/battery line to report) and nothing
 * for the Inventory System to act on, so it's excluded rather than sent with
 * a bunch of nulls.
 *
 * Response fields:
 *   id                -> Project ID
 *   name, client_name -> Project/Client Name (same value — Lampara has no
 *                          separate "project name," the project *is* the
 *                          customer's job)
 *   location           -> "City, Province" from the property on file
 *   latitude/longitude  -> from the completed site ocular inspection
 *                          (captured on-site, on the *survey*, not the
 *                          property registration — this is real GPS from
 *                          the visit, not a geocoded address guess)
 *   inverter_size,
 *   battery_size        -> the exact lines printed on the signed contract
 *                          (`inverter_line` / `battery_line`) — "based on
 *                          the contract" per the ask, not the quote or the
 *                          package, which can differ if either was revised
 *                          after the contract was generated
 *   system_size_kw      -> the contract's overall kWp, as a plain number
 *   installation_date    -> the installation's scheduled start date
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

const ELIGIBLE_STAGES = ["installation_scheduled", "installation_complete", "active_customer"];

type LeadRow = {
    id: string;
    first_name: string;
    last_name: string;
    properties: { city: string; state: string }[] | null;
};

type SurveyRow = {
    lead_id: string;
    completed_at: string | null;
    latitude: number | null;
    longitude: number | null;
};

type ContractRow = {
    lead_id: string;
    status: string;
    signed_at: string | null;
    inverter_line: string | null;
    battery_line: string | null;
    system_size_kw: number | string | null;
};

type InstallationRow = {
    lead_id: string;
    scheduled_date: string | null;
};

/** Keeps the most recently completed/signed row per lead when a lead has
 * more than one (a re-inspection, a re-quoted-and-re-signed contract). */
function latestByLead<T extends { lead_id: string }>(
    rows: T[],
    sortKey: (row: T) => string | null,
): Map<string, T> {
    const map = new Map<string, T>();
    for (const row of rows) {
        const existing = map.get(row.lead_id);
        if (!existing || (sortKey(row) ?? "") > (sortKey(existing) ?? "")) {
            map.set(row.lead_id, row);
        }
    }
    return map;
}

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
            .in("stage", ELIGIBLE_STAGES)
            .returns<LeadRow[]>();
        if (leadsError) throw leadsError;

        const leadIds: string[] = (leads ?? []).map((l: LeadRow) => l.id);

        // `.in(..., [])` is valid PostgREST — it just matches zero rows — so
        // these always run rather than branching on an empty leadIds list.
        const [surveysRes, contractsRes, installationsRes] = await Promise.all([
            db.from("surveys")
                .select("lead_id, completed_at, latitude, longitude")
                .in("lead_id", leadIds)
                .not("completed_at", "is", null)
                .returns<SurveyRow[]>(),
            db.from("contracts")
                .select("lead_id, status, signed_at, inverter_line, battery_line, system_size_kw")
                .in("lead_id", leadIds)
                .eq("status", "signed")
                .returns<ContractRow[]>(),
            db.from("installations")
                .select("lead_id, scheduled_date")
                .in("lead_id", leadIds)
                .returns<InstallationRow[]>(),
        ]);
        if (surveysRes.error) throw surveysRes.error;
        if (contractsRes.error) throw contractsRes.error;
        if (installationsRes.error) throw installationsRes.error;

        const surveyByLead = latestByLead(surveysRes.data ?? [], (s) => s.completed_at);
        const contractByLead = latestByLead(contractsRes.data ?? [], (c) => c.signed_at);
        const installByLead = new Map((installationsRes.data ?? []).map((i) => [i.lead_id, i]));

        const projects = (leads ?? []).map((lead) => {
            const name = `${lead.first_name} ${lead.last_name}`;
            const property = lead.properties?.[0] ?? null;
            const survey = surveyByLead.get(lead.id);
            const contract = contractByLead.get(lead.id);
            const installation = installByLead.get(lead.id);

            return {
                id: lead.id,
                name,
                client_name: name,
                location: property ? `${property.city}, ${property.state}` : null,
                latitude: survey?.latitude ?? null,
                longitude: survey?.longitude ?? null,
                inverter_size: contract?.inverter_line ?? null,
                battery_size: contract?.battery_line ?? null,
                system_size_kw: contract?.system_size_kw != null ? Number(contract.system_size_kw) : null,
                installation_date: installation?.scheduled_date ?? null,
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
