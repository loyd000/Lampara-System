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

// Split at the route boundary. The landing page, shell and dashboard are what a
// signed-in user sees first, so they stay in the entry chunk; the rest — and
// their form/validation dependencies — load when someone actually navigates.
const AuthCallback = lazy(() => import("./pages/auth/Callback.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const LeadsPage = lazy(() => import("./pages/leads/page.tsx"));
const LeadDetailPage = lazy(() => import("./pages/leads/[id]/page.tsx"));
const PipelinePage = lazy(() => import("./pages/pipeline/page.tsx"));
const CalendarPage = lazy(() => import("./pages/calendar/page.tsx"));
const ProfilePage = lazy(() => import("./pages/profile/page.tsx"));
const TeamPage = lazy(() => import("./pages/team/page.tsx"));
const PackagesPage = lazy(() => import("./pages/packages/page.tsx"));

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
                                <Route element={<AppLayout />}>
                                    <Route path="/" element={<Index />} />
                                    <Route path="/pipeline" element={<PipelinePage />} />
                                    <Route path="/calendar" element={<CalendarPage />} />
                                    <Route path="/leads" element={<LeadsPage />} />
                                    <Route path="/leads/:id" element={<LeadDetailPage />} />
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
