import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AdminDashboard from "./_components/AdminDashboard.tsx";
import FieldDashboard from "./_components/FieldDashboard.tsx";

/**
 * Picks the dashboard for the signed-in user's role.
 *
 * Rendering only happens inside <AccountGate>, which has already established
 * that there is a session, a profile row, and that the account is active — so
 * the query here is warm and `user` is only briefly undefined.
 */
export default function Index() {
    const { data: user } = useCurrentUser();

    if (!user) {
        return (
            <div className="p-6 space-y-6 max-w-7xl mx-auto">
                <Skeleton className="h-8 w-56 rounded-md" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
                </div>
            </div>
        );
    }

    // superadmin and admin share one dashboard — the roster of who can see it
    // is a role list on Team and the nav, not a second dashboard to maintain.
    switch (user.role) {
        case "field":
            return <FieldDashboard user={user} />;
        case "superadmin":
        case "admin":
        default:
            return <AdminDashboard user={user} />;
    }
}
