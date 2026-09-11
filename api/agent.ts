/**
 * Server-side proxy for the Lampara AI assistant's Claude calls.
 *
 * The Anthropic API key lives only here, as a Vercel project env var with no
 * `VITE_` prefix — Vite never inlines it into the browser bundle, and
 * `process.env.ANTHROPIC_API_KEY` only ever resolves inside this function,
 * on Vercel's servers. Unlike Gemini, Anthropic keys cannot be restricted to
 * a domain, so there is no safe way to call Claude directly from the
 * browser (see src/ai/agent.ts, which used to do exactly that with Gemini,
 * and now POSTs here instead of talking to api.anthropic.com itself).
 *
 * This function does exactly one thing: authenticate the caller as a
 * signed-in Lampara admin/superadmin, then forward a single Messages API
 * call to Claude and hand back the raw response. It does not know about
 * Lampara's tools and does not run the tool-calling loop — that stays
 * client-side (see src/ai/tools/), scoped to the signed-in user's own
 * Supabase session and RLS, exactly like every other query in this app. All
 * this endpoint ever sees of a tool call is its name, its JSON Schema, and
 * (once the client has run it) its JSON result — never a Supabase query.
 *
 * `model` and `max_tokens` are fixed here, not taken from the request body:
 * a client that sent its own values could otherwise pick a pricier model or
 * a bigger output cap than this assistant is supposed to cost.
 */
import process from "node:process";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;

// The same project the browser already talks to (see
// src/lib/supabase/client.ts) — safe to read server-side too, just via
// Vercel's plain env vars instead of import.meta.env. The anon key is public
// by design (RLS is what actually scopes it); it is not the secret here.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const ALLOWED_ROLES = new Set(["superadmin", "admin"]);

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

/**
 * Confirms the bearer token is a live Supabase session for an
 * admin/superadmin. This re-checks what `AgentFab.tsx` already gates client
 * side — the same split `RequireRole` documents elsewhere in this app: a UI
 * gate only stops the app from asking, it is not what stops a direct POST to
 * this URL from spending the Anthropic budget on someone this app never
 * meant to give it to.
 */
async function authenticate(authHeader: string | null): Promise<boolean> {
    if (!authHeader?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    const accessToken = authHeader.slice("Bearer ".length);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
    if (userError || !userData.user) return false;

    const { data: profile } = await supabase
        .from("users")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle<{ role: string }>();

    return Boolean(profile && ALLOWED_ROLES.has(profile.role));
}

type ProxyRequestBody = {
    system?: string;
    messages?: Anthropic.MessageParam[];
    tools?: Anthropic.Tool[];
};

export default async function handler(request: Request): Promise<Response> {
    if (request.method !== "POST") {
        return jsonResponse(405, { error: "Method not allowed." });
    }
    if (!ANTHROPIC_API_KEY) {
        return jsonResponse(501, {
            error: "ANTHROPIC_API_KEY is not set on the server — add it in Vercel's project settings.",
        });
    }

    const authorized = await authenticate(request.headers.get("authorization"));
    if (!authorized) {
        return jsonResponse(401, { error: "Sign in as an admin to use the AI assistant." });
    }

    let body: ProxyRequestBody;
    try {
        body = (await request.json()) as ProxyRequestBody;
    } catch {
        return jsonResponse(400, { error: "Invalid JSON body." });
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return jsonResponse(400, { error: '"messages" must be a non-empty array.' });
    }

    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    try {
        const message = await anthropic.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: body.system,
            messages: body.messages,
            tools: body.tools,
        });
        return jsonResponse(200, { content: message.content, stop_reason: message.stop_reason });
    } catch (err) {
        const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502;
        const message = err instanceof Error ? err.message : "Claude request failed.";
        return jsonResponse(status, { error: message });
    }
}
