/**
 * Auth context shape and hook.
 *
 * Kept in its own module (no components) so the provider file stays a pure
 * component module — react-refresh only handles files that export components.
 */

import { createContext, useContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthContextValue = {
    user: User | null;
    session: Session | null;
    /** True until the initial session has been read from storage. */
    isLoading: boolean;
    isAuthenticated: boolean;
    /** Last auth failure, cleared on the next attempt. */
    error: Error | null;
    signInWithPassword: (email: string, password: string) => Promise<void>;
    /**
     * Creates an account. Resolves to `needsConfirmation: true` when the project
     * has email confirmation on and no session was returned.
     */
    signUpWithPassword: (
        email: string,
        password: string,
        name?: string,
    ) => Promise<{ needsConfirmation: boolean }>;
    signInWithGoogle: () => Promise<void>;
    sendPasswordReset: (email: string) => Promise<void>;
    /**
     * True from the moment Supabase processes a recovery link until the user
     * has either set a new password or dismissed the prompt. While it is set,
     * <PasswordRecoveryGate> takes over the whole app — the recovery link
     * signs the user in, so without this they would land on the dashboard with
     * no way to actually change the password they forgot.
     */
    isPasswordRecovery: boolean;
    /** Sets a new password for the signed-in user and ends recovery mode. */
    updatePassword: (password: string) => Promise<void>;
    /** Leaves recovery mode without changing anything. */
    dismissPasswordRecovery: () => void;
    signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used inside <SupabaseAuthProvider>");
    }
    return context;
}
