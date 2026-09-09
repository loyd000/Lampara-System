/**
 * `supabase.functions.invoke()` is a browser `fetch()` under the hood, so it
 * sends a CORS preflight like any other cross-origin request. Every function
 * in this project shares one policy: allow the usual invoke headers, allow
 * any origin (the anon key already scopes what an unauthenticated caller can
 * do — CORS here is about the browser allowing the response through, not
 * about authorization).
 */
export const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
};

export function handleCorsPreflight(req: Request): Response | null {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }
    return null;
}
