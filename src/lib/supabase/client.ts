import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
    supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl !== "https://your-project.supabase.co" &&
    supabaseAnonKey !== "your-anon-or-publishable-key"
);

if (!isSupabaseConfigured) {
    console.error(
        "[Lampara CRM] Missing Supabase configuration.\n" +
        "• If running locally: copy .env.example to .env.local and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n" +
        "• If deployed on Vercel: go to Vercel Dashboard → Project Settings → Environment Variables and add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then Redeploy."
    );
}

/**
 * The one Supabase client for the app.
 *
 * Sits as a singleton. Uses fallback credentials when unconfigured to prevent
 * top-level script evaluation crashes that cause blank white screens in deployment.
 */
export const supabase = createClient<Database>(
    supabaseUrl || "https://placeholder-project.supabase.co",
    supabaseAnonKey || "placeholder-anon-key",
    {
        auth: {
            persistSession: isSupabaseConfigured,
            autoRefreshToken: isSupabaseConfigured,
            detectSessionInUrl: isSupabaseConfigured,
            flowType: "pkce",
        },
    },
);

/**
 * Normalises a PostgREST/Storage error into something `toast.error(e.message)`
 * can display. RLS denials surface as a permission error rather than an empty
 * result, so they are translated to the same wording the Convex guards used.
 */
export function toAppError(error: unknown, fallback = "Something went wrong"): Error {
    if (!error) return new Error(fallback);

    if (typeof error === "object" && "message" in error) {
        const { message, code } = error as { message?: string; code?: string };

        if (code === "42501" || message?.includes("row-level security")) {
            return new Error("Insufficient permissions");
        }
        if (code === "23505") {
            return new Error("That record already exists");
        }
        if (code === "23503") {
            return new Error("This record is still referenced by other data");
        }
        if (code === "PGRST116") {
            return new Error("Not found");
        }
        if (message) return new Error(message);
    }

    return error instanceof Error ? error : new Error(fallback);
}

/** Throws on a PostgREST error, otherwise returns the data. */
export function unwrap<T>(
    result: { data: T | null; error: unknown },
    fallbackMessage?: string,
): T {
    if (result.error) throw toAppError(result.error, fallbackMessage);
    return result.data as T;
}
