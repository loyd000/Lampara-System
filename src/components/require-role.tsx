import { Navigate } from "react-router-dom";

import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import type { UserRole } from "@/lib/supabase/types.ts";

/**
 * Route-level role gate.
 *
 * Hiding a link in the sidebar is presentation, not authorization — the route
 * still renders for anyone who types the URL. This is the check that actually
 * refuses, and it belongs at the route so the page's own hooks never run: a
 * guard placed *inside* a page still fires that page's queries before it gets
 * to redirect, which for `/reports` means firing the revenue RPCs on behalf of
 * someone who isn't allowed to read them.
 *
 * Not a security boundary on its own — RLS and the RPCs' own `security invoker`
 * scoping are what actually protect the data. This stops the UI from asking.
 *
 * Safe to render unconditionally: `AccountGate` (see AppLayout) already holds
 * every route until `useCurrentUser` resolves, so `user` is populated by the
 * time this runs. The undefined branch is belt-and-braces against that
 * ordering ever changing — render nothing rather than bounce a legitimate
 * admin to the dashboard on a page refresh.
 */
export function RequireRole({
    roles,
    children,
}: {
    roles: UserRole[];
    children: React.ReactNode;
}) {
    const { data: user } = useCurrentUser();

    if (!user) return null;
    if (!roles.includes(user.role)) return <Navigate to="/" replace />;

    return <>{children}</>;
}
