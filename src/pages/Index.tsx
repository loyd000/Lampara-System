import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import AdminDashboard from "./_components/AdminDashboard.tsx";
import SalesDashboard from "./_components/SalesDashboard.tsx";
import SurveyorDashboard from "./_components/SurveyorDashboard.tsx";
import InstallerDashboard from "./_components/InstallerDashboard.tsx";

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
            <div className="p-6 space-y-4">
                <Skeleton className="h-8 w-56" />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
                </div>
            </div>
        );
    }

    switch (user.role) {
        case "sales":
            return <SalesDashboard user={user} />;
        case "surveyor":
            return <SurveyorDashboard user={user} />;
        case "installer":
            return <InstallerDashboard user={user} />;
        case "admin":
        case "office":
        default:
            return <AdminDashboard user={user} />;
    }
}
