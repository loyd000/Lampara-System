import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import { PasswordRecoveryGate } from "./components/password-recovery-gate.tsx";
import { useServiceWorker } from "@/hooks/use-service-worker.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { ErrorBoundary } from "@/components/error-boundary.tsx";
import { RequireRole } from "@/components/require-role.tsx";
import { MissingConfigScreen } from "@/components/missing-config.tsx";
import { isSupabaseConfigured } from "@/lib/supabase/client.ts";
import AppLayout from "./pages/layout/AppLayout.tsx";
import Index from "./pages/Index.tsx";
// Eager, not lazy — deliberately the one exception to the route-splitting
// convention below. This page has to be physically present in the bundle
// the browser/WebView already loaded, with zero fetch required to reach it,
// so it works from a cold start with no signal. See
// docs/plans/Offline_Export_Import_plan.md.
import OfflineReportPage from "./pages/offline-report/page.tsx";

// Split at the route boundary. The landing page, shell and dashboard are what a
// signed-in user sees first, so they stay in the entry chunk; the rest — and
// their form/validation dependencies — load when someone actually navigates.
const AuthCallback = lazy(() => import("./pages/auth/Callback.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const LeadsPage = lazy(() => import("./pages/leads/page.tsx"));
const LeadDetailPage = lazy(() => import("./pages/leads/[id]/page.tsx"));
const CalendarPage = lazy(() => import("./pages/calendar/page.tsx"));
const ProfilePage = lazy(() => import("./pages/profile/page.tsx"));
const TeamPage = lazy(() => import("./pages/team/page.tsx"));
const PackagesPage = lazy(() => import("./pages/packages/page.tsx"));
const PipelinePage = lazy(() => import("./pages/pipeline/page.tsx"));
const NotificationsPage = lazy(() => import("./pages/notifications/page.tsx"));

function RouteFallback() {
    return (
        <div className="flex h-full min-h-[60vh] items-center justify-center">
            <Spinner className="size-6" />
        </div>
    );
}

export default function App() {
    useServiceWorker();

    if (!isSupabaseConfigured) {
        return <MissingConfigScreen />;
    }

    return (
        <ErrorBoundary>
            <DefaultProviders>
                <BrowserRouter>
                    <PasswordRecoveryGate>
                        <Suspense fallback={<RouteFallback />}>
                            <Routes>
                                <Route path="/auth/callback" element={<AuthCallback />} />
                                {/* Outside AppLayout/Authenticated on purpose — no
                                    auth check, no data fetch, reachable
                                    regardless of connectivity or session state. */}
                                <Route path="/offline-report" element={<OfflineReportPage />} />
                                <Route element={<AppLayout />}>
                                    <Route path="/" element={<Index />} />
                                    <Route path="/calendar" element={<CalendarPage />} />
                                    <Route path="/projects" element={<LeadsPage />} />
                                    <Route path="/projects/:id" element={<LeadDetailPage />} />
                                    <Route path="/pipeline" element={<PipelinePage />} />
                                    <Route
                                        path="/packages"
                                        element={
                                            <RequireRole roles={["superadmin"]}>
                                                <PackagesPage />
                                            </RequireRole>
                                        }
                                    />
                                    <Route path="/team" element={<TeamPage />} />
                                    <Route path="/profile" element={<ProfilePage />} />
                                    <Route path="/notifications" element={<NotificationsPage />} />
                                    {/* Inside the layout, not beside it: a
                                        mistyped URL used to strand a signed-in
                                        user on a bare page with no sidebar, no
                                        mobile nav and one button out. */}
                                    <Route path="*" element={<NotFound />} />
                                </Route>
                            </Routes>
                        </Suspense>
                    </PasswordRecoveryGate>
                </BrowserRouter>
            </DefaultProviders>
        </ErrorBoundary>
    );
}
