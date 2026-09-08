import { Outlet } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "@/components/auth-guard.tsx";
import { AccountGate } from "@/components/account-gate.tsx";
import { useAuth } from "@/components/providers/auth-context.ts";
import { useRealtimeSync } from "@/lib/supabase/realtime.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import AppSidebar from "./_components/AppSidebar.tsx";
import MobileNav from "./_components/MobileNavbar.tsx";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/constants.ts";
import { Sun, BarChart3, Users, ClipboardCheck, Shield, Zap } from "lucide-react";

export default function AppLayout() {
    const { isAuthenticated } = useAuth();

    // Convex refreshed every subscriber on write; with React Query this one
    // channel does the same job by invalidating caches on Postgres changes.
    useRealtimeSync(isAuthenticated);

    return (
        <>
            <AuthLoading>
                <div className="flex h-screen items-center justify-center bg-background">
                    <div className="flex flex-col items-center gap-4">
                        <div className="relative">
                            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
                                <Sun className="w-7 h-7 text-primary" />
                            </div>
                        </div>
                        <Skeleton className="h-4 w-32" />
                    </div>
                </div>
            </AuthLoading>
            <Unauthenticated>
                <LandingPage />
            </Unauthenticated>
            <Authenticated>
                <AccountGate>
                    <div className="flex h-screen overflow-hidden bg-background">
                        <AppSidebar />
                        <div className="flex flex-1 flex-col overflow-hidden">
                            <main className="flex-1 overflow-auto pb-16 md:pb-0">
                                <Outlet />
                            </main>
                        </div>
                        <MobileNav />
                    </div>
                </AccountGate>
            </Authenticated>
        </>
    );
}

const features = [
    {
        icon: BarChart3,
        title: "Pipeline Tracking",
        description: "Visual Kanban board from first inquiry to completed installation",
    },
    {
        icon: Users,
        title: "Team Management",
        description: "Assign leads, surveyors, and installation crews with role-based access",
    },
    {
        icon: ClipboardCheck,
        title: "Surveys & Quotes",
        description: "Site surveys, system sizing, and professional proposal generation",
    },
    {
        icon: Shield,
        title: "Permit Tracking",
        description: "Track building permits, electrical permits, and HOA approvals",
    },
    {
        icon: Zap,
        title: "Installation Management",
        description: "Schedule crews, track materials, and manage completion photos",
    },
    {
        icon: Sun,
        title: "Customer Portal",
        description: "Post-installation service tickets and warranty management",
    },
];

function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
            {/* Background gradient decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[40%] -right-[20%] w-[80%] h-[80%] rounded-full bg-primary/5 blur-3xl" />
                <div className="absolute -bottom-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-amber-500/5 blur-3xl" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-12 md:py-6">
                <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-md">
                        <Sun className="w-5 h-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-foreground">
                        {COMPANY_NAME}
                    </span>
                </div>
                <SignInButton variant="outline" size="sm" />
            </header>

            {/* Hero */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 md:py-24">
                <div className="text-center space-y-6 max-w-2xl mx-auto">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                        <Zap className="w-3.5 h-3.5" />
                        Solar Installation CRM
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                        Manage your solar
                        <span className="block text-primary">pipeline with ease</span>
                    </h1>

                    <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
                        {COMPANY_TAGLINE} — from first inquiry to completed installation, track every step of your solar projects.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        <SignInButton
                            className="w-full sm:w-auto px-8"
                            size="lg"
                            signInText="Get Started"
                        />
                    </div>
                </div>

                {/* Features grid */}
                <div className="mt-20 md:mt-28 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto w-full">
                    {features.map((feature) => (
                        <div
                            key={feature.title}
                            className="group relative p-5 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm hover:bg-card hover:border-border hover:shadow-lg transition-all duration-300"
                        >
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/15 transition-colors">
                                <feature.icon className="w-5 h-5 text-primary" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-1">
                                {feature.title}
                            </h3>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 text-center py-6 px-6 text-sm text-muted-foreground">
                © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
            </footer>
        </div>
    );
}
