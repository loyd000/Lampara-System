import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
        "Missing Supabase configuration. Copy .env.example to .env.local and set " +
            "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your project's API settings.",
    );
}

/**
 * The one Supabase client for the app.
 *
 * Unlike Convex this is a plain singleton, not a React provider — auth state is
 * surfaced through <SupabaseAuthProvider> and data through React Query.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Supabase parses the OAuth/magic-link fragment itself; /auth/callback
        // just waits for the resulting session.
        detectSessionInUrl: true,
        flowType: "pkce",
    },
});

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
