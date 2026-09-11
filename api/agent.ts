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
 *
 * Deliberately uses the `(req: VercelRequest, res: VercelResponse)` handler
 * shape (Node.js's own `IncomingMessage`/`ServerResponse`, typed via
 * `@vercel/node`) rather than the Fetch-API `(request: Request) => Response`
 * style — the latter looked cleaner but Vercel's own function-build step
 * resolved a `Request` type without `.method`/`.headers`/`.json()` on it,
 * which is the officially-typed, first-party signature instead.
 *
 * Auth is checked with plain `fetch()` calls straight to Supabase's REST
 * endpoints rather than `@supabase/supabase-js` — not for any deep reason,
 * just that the SDK's `SupabaseAuthClient` type failed to resolve correctly
 * under Vercel's isolated build (a `getUser` that plainly exists came back
 * as "does not exist on type"), and this is one dependency's worth of
 * surface area less to fight for a two-request auth check.
 */
import process from "node:process";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import Anthropic from "@anthropic-ai/sdk";

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

/**
 * Confirms the bearer token is a live Supabase session for an
 * admin/superadmin. This re-checks what `AgentFab.tsx` already gates client
 * side — the same split `RequireRole` documents elsewhere in this app: a UI
 * gate only stops the app from asking, it is not what stops a direct POST to
 * this URL from spending the Anthropic budget on someone this app never
 * meant to give it to.
 */
async function authenticate(authHeader: string | string[] | undefined): Promise<boolean> {
    const headerValue = Array.isArray(authHeader) ? authHeader[0] : authHeader;
    if (!headerValue?.startsWith("Bearer ") || !SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
    const accessToken = headerValue.slice("Bearer ".length);

    const authHeaders = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
    };

    // Validates the JWT against Supabase's own Auth server — the only way to
    // confirm a token server-side without holding the JWT signing secret.
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: authHeaders });
    if (!userRes.ok) return false;
    const user = (await userRes.json().catch(() => null)) as { id?: string } | null;
    if (!user?.id) return false;

    // RLS scopes this to the caller's own row, same as every other query in
    // this app — this is just that same "am I an admin" check `calendar.ts`
    // and others already make, over raw PostgREST instead of supabase-js.
    const roleRes = await fetch(`${SUPABASE_URL}/rest/v1/users?id=eq.${user.id}&select=role`, {
        headers: authHeaders,
    });
    if (!roleRes.ok) return false;
    const rows = (await roleRes.json().catch(() => null)) as { role?: string }[] | null;
    const role = rows?.[0]?.role;

    return Boolean(role && ALLOWED_ROLES.has(role));
}

type ProxyRequestBody = {
    // A plain string still works (Anthropic accepts either), but the client
    // sends the array form so it can attach a cache_control breakpoint —
    // see the comment on callProxy in src/ai/agent.ts.
    system?: string | Anthropic.TextBlockParam[];
    messages?: Anthropic.MessageParam[];
    tools?: Anthropic.Tool[];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed." });
        return;
    }
    if (!ANTHROPIC_API_KEY) {
        res.status(501).json({
            error: "ANTHROPIC_API_KEY is not set on the server — add it in Vercel's project settings.",
        });
        return;
    }

    const authorized = await authenticate(req.headers.authorization);
    if (!authorized) {
        res.status(401).json({ error: "Sign in as an admin to use the AI assistant." });
        return;
    }

    const body = req.body as ProxyRequestBody | undefined;
    if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({ error: '"messages" must be a non-empty array.' });
        return;
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
        res.status(200).json({ content: message.content, stop_reason: message.stop_reason });
    } catch (err) {
        const status = err instanceof Anthropic.APIError ? (err.status ?? 502) : 502;
        const message = err instanceof Error ? err.message : "Claude request failed.";
        res.status(status).json({ error: message });
    }
}
