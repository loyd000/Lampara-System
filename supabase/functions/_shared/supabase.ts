import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Two clients, deliberately kept separate:
 *
 * - `callerClient` carries the caller's own JWT, forwarded automatically by
 *   `supabase.functions.invoke()`. Used only to confirm *someone signed in*
 *   made this request — RLS on their own session would reject an anonymous
 *   caller outright when we ask "who is this."
 * - `serviceClient` uses the service-role key and bypasses RLS entirely.
 *   Recipient emails, preferences and the notification log all go through
 *   this one, because the whole point is: the caller supplies a *user id*
 *   to notify, never an email address, and this function resolves the real
 *   address itself. Trusting an address in the request body would let any
 *   signed-in user redirect a notification anywhere.
 */
export function callerClient(req: Request) {
    return createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
}

export function serviceClient() {
    return createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
}
