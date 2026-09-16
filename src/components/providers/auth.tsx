import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";

import { supabase, toAppError } from "@/lib/supabase/client.ts";
import { queryKeys } from "@/lib/supabase/hooks.ts";
import { watchAccountAccess } from "@/lib/supabase/access-cache.ts";
import { clearCachedCurrentUser } from "@/lib/offline/current-user-cache.ts";
import { AuthContext, type AuthContextValue } from "./auth-context.ts";

/**
 * Supabase session state for the app — the replacement for HerculesAuthProvider.
 *
 * Sits *inside* QueryClientProvider so a sign-out or account switch can clear the React
 * Query cache; leaving another user's leads in memory across a session change
 * would leak data the new session may not be allowed to see.
 */
export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
    const queryClient = useQueryClient();
    const [session, setSession] = useState<Session | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
    const currentUserIdRef = useRef<string | null>(null);

    useEffect(() => watchAccountAccess(queryClient), [queryClient]);

    useEffect(() => {
        let active = true;

        supabase.auth
            .getSession()
            .then(({ data }) => {
                if (!active) return;
                currentUserIdRef.current = data.session?.user?.id ?? null;
                setSession(data.session);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        const { data: subscription } = supabase.auth.onAuthStateChange((event, next) => {
            if (!active) return;

            const previousUserId = currentUserIdRef.current;
            const nextUserId = next?.user?.id ?? null;
            currentUserIdRef.current = nextUserId;

            // Only update session state if the session identity or token actually changed,
            // preventing spurious re-renders on tab switch / visibility changes.
            setSession((prev) => {
                if (
                    prev?.access_token === next?.access_token &&
                    prev?.user?.id === next?.user?.id &&
                    prev?.user?.updated_at === next?.user?.updated_at
                ) {
                    return prev;
                }
                return next;
            });
            setIsLoading(false);

            // Fires when Supabase consumes a recovery link. The user is now
            // signed in, but the only thing they should be able to do is set a
            // new password.
            if (event === "PASSWORD_RECOVERY") setIsPasswordRecovery(true);

            // Only wipe the query cache when a session actually ends (SIGNED_OUT)
            // or when switching to a different user account. We MUST NEVER wipe
            // the cache on tab focus, background token refresh, or when the
            // same user remains signed in, as doing so wipes React Query and unmounts
            // the whole app tree.
            if (event === "SIGNED_OUT") {
                setIsPasswordRecovery(false);
                queryClient.clear();
                clearCachedCurrentUser();
            } else if (previousUserId && nextUserId && previousUserId !== nextUserId) {
                queryClient.clear();
                clearCachedCurrentUser();
            } else if (event === "USER_UPDATED") {
                queryClient.invalidateQueries({ queryKey: queryKeys.currentUser });
            }
        });

        return () => {
            active = false;
            subscription.subscription.unsubscribe();
        };
    }, [queryClient]);

    // Native Google sign-in opens the OAuth flow in an in-app browser tab
    // (see signInWithGoogle) since a WebView can't receive the redirect
    // Google sends back. This listener catches that redirect via the
    // com.lampara.crm://auth/callback deep link registered in
    // AndroidManifest.xml, exchanges the PKCE code for a session, and
    // closes the tab — completing the flow without ever leaving the app.
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;

        const listenerPromise = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
            const code = new URL(url).searchParams.get("code");
            if (!code) return;

            supabase.auth.exchangeCodeForSession(code).finally(() => {
                Browser.close().catch(() => {});
            });
        });

        return () => {
            listenerPromise.then((listener) => listener.remove());
        };
    }, []);

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
        const isNative = Capacitor.isNativePlatform();
        // On native, skip Supabase's own window.location redirect — a WebView
        // navigation there would leave the app for the system browser and
        // never come back. Instead open the OAuth URL in an in-app browser
        // tab pointed at the custom-scheme redirect the appUrlOpen listener
        // above catches.
        const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: isNative
                    ? "com.lampara.crm://auth/callback"
                    : `${window.location.origin}/auth/callback`,
                queryParams: { access_type: "offline", prompt: "select_account" },
                skipBrowserRedirect: isNative,
            },
        });
        if (oauthError) {
            const wrapped = toAppError(oauthError, "Could not start Google sign-in");
            setError(wrapped);
            throw wrapped;
        }
        if (isNative && data.url) {
            await Browser.open({ url: data.url });
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
