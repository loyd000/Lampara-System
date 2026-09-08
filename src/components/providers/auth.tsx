import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";

import { supabase, toAppError } from "@/lib/supabase/client.ts";
import { AuthContext, type AuthContextValue } from "./auth-context.ts";

/**
 * Supabase session state for the app — the replacement for HerculesAuthProvider.
 *
 * Sits *inside* QueryClientProvider so a sign-in or sign-out can clear the React
 * Query cache; leaving another user's leads in memory across a session change
 * would leak data the new session may not be allowed to see.
 */
export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

    useEffect(() => {
        let active = true;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (!active) return;
                setSession(data.session);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
            if (!active) return;
            setSession(next);
            setIsLoading(false);

            // Fires when Supabase consumes a recovery link. The user is now
            // signed in, but the only thing they should be able to do is set a
            // new password.
            if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);

            if (event === "SIGNED_OUT") setIsPasswordRecovery(false);

            // A token refresh keeps the same identity, so only wipe the cache
            // when the signed-in user actually changes.
            if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
                queryClient.clear();
            }
        });

        return () => {
            active = false;
            subscription.subscription.unsubscribe();
        };
    }, [queryClient]);

    const signInWithPassword = useCallback(async (email: string, password: string) => {
        setError(null);
        const { error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (signInError) {
            const wrapped = toAppError(signInError, "Could not sign in");
            setError(wrapped);
            throw wrapped;
        }
    }, []);

    const signUpWithPassword = useCallback(
        async (email: string, password: string, name?: string) => {
            setError(null);
            const { data, error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    // Read by the handle_new_auth_user trigger to seed users.name.
                    data: name ? { full_name: name } : undefined,
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (signUpError) {
                const wrapped = toAppError(signUpError, "Could not create your account");
                setError(wrapped);
                throw wrapped;
            }
            return { needsConfirmation: !data.session };
        },
        [],
    );

    const signInWithGoogle = useCallback(async () => {
        setError(null);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
                queryParams: { access_type: "offline", prompt: "select_account" },
            },
        });
        if (oauthError) {
            const wrapped = toAppError(oauthError, "Could not start Google sign-in");
            setError(wrapped);
            throw wrapped;
        }
    }, []);

    const sendPasswordReset = useCallback(async (email: string) => {
        setError(null);
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/callback`,
        });
        if (resetError) {
            const wrapped = toAppError(resetError, "Could not send the reset email");
            setError(wrapped);
            throw wrapped;
        }
    }, []);

    const updatePassword = useCallback(async (password: string) => {
        setError(null);
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            const wrapped = toAppError(updateError, "Could not update your password");
            setError(wrapped);
            throw wrapped;
        }
        setIsPasswordRecovery(false);
    }, []);

    const dismissPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

    const signOut = useCallback(async () => {
        setError(null);
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
            const wrapped = toAppError(signOutError, "Could not sign out");
            setError(wrapped);
            throw wrapped;
        }
    }, []);

    const value = useMemo<AuthContextValue>(
        () => ({
            user: session?.user ?? null,
            session,
            isLoading,
            isAuthenticated: !!session,
            error,
            signInWithPassword,
            signUpWithPassword,
            signInWithGoogle,
            sendPasswordReset,
            isPasswordRecovery,
            updatePassword,
            dismissPasswordRecovery,
            signOut,
        }),
        [
            session,
            isLoading,
            error,
            isPasswordRecovery,
            signInWithPassword,
            signUpWithPassword,
            signInWithGoogle,
            sendPasswordReset,
            updatePassword,
            dismissPasswordRecovery,
            signOut,
        ],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
