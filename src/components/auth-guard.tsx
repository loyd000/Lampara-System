/**
 * Drop-in replacements for Convex's <Authenticated>, <Unauthenticated> and
 * <AuthLoading>, backed by the Supabase session.
 *
 * The three are mutually exclusive: exactly one renders at any moment, so the
 * existing "render all three siblings" pattern in AppLayout still works.
 */

import { useAuth } from "@/components/providers/auth-context.ts";

export function Authenticated({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading || !isAuthenticated) return null;
    return <>{children}</>;
}

export function Unauthenticated({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();
    if (isLoading || isAuthenticated) return null;
    return <>{children}</>;
}

export function AuthLoading({ children }: { children: React.ReactNode }) {
    const { isLoading } = useAuth();
    if (!isLoading) return null;
    return <>{children}</>;
}
