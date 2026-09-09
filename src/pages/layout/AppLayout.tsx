import { Outlet } from "react-router-dom";
import { Authenticated, Unauthenticated, AuthLoading } from "@/components/auth-guard.tsx";
import { AccountGate } from "@/components/account-gate.tsx";
import { useAuth } from "@/components/providers/auth-context.ts";
import { useRealtimeSync } from "@/lib/supabase/realtime.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import AppSidebar from "./_components/AppSidebar.tsx";
import MobileNav from "./_components/MobileNavbar.tsx";
import { COMPANY_NAME, COMPANY_TAGLINE } from "@/lib/constants.ts";
import { BarChart3, Users, ClipboardCheck, Shield, Zap, Sparkles } from "lucide-react";

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
                            <div className="size-12 rounded-lg bg-card border border-border flex items-center justify-center animate-pulse p-2.5 shadow-2xs">
                                <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />
                            </div>
                        </div>
                        <Skeleton className="h-4 w-32 rounded-md" />
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
                            {/* Mobile top bar */}
                            <div className="flex md:hidden items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur-sm">
                                <div className="flex items-center gap-2.5">
                                    <div className="size-7 rounded-md bg-card border border-border flex items-center justify-center p-1 shadow-2xs">
                                        <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />
                                    </div>
                                    <span className="font-bold text-sm tracking-tight text-foreground">{COMPANY_NAME}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <ThemeToggle />
                                    <SignOutButton />
                                </div>
                            </div>
                            {/*
                              `relative` is load-bearing. Radix renders a hidden
                              native <input> inside every Checkbox and Radio for
                              form participation, positioned absolutely — and
                              `overflow: auto` does not establish a containing
                              block. Without a positioned ancestor those inputs
                              resolve against the document instead, stretching it
                              to their lowest coordinate: a second scrollbar, and
                              a page that scrolls past the shell into empty space.
                              Worst on the ocular report, which has ~40 of them.
                            */}
                            <main className="relative flex-1 overflow-auto pb-16 md:pb-0">
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
        description: "Assign leads and field technicians with role-based access",
    },
    {
        icon: ClipboardCheck,
        title: "Inspections & Quotes",
        description: "Site ocular inspections, system sizing, and professional proposal generation",
    },
    {
        icon: Shield,
        title: "Permit Tracking",
        description: "Track building permits, electrical permits, and HOA approvals",
    },
    {
        icon: Zap,
        title: "Installation Management",
        description: "Schedule technicians, track materials, and manage completion photos",
    },
    {
        icon: Sparkles,
        title: "Customer Portal",
        description: "Post-installation service tickets and warranty management",
    },
];

function LandingPage() {
    return (
        <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
            {/* Background monochrome decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-[30%] -right-[15%] w-[70%] h-[70%] rounded-full bg-foreground/[0.03] blur-3xl" />
                <div className="absolute -bottom-[30%] -left-[15%] w-[60%] h-[60%] rounded-full bg-foreground/[0.02] blur-3xl" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex items-center justify-between px-6 py-4 md:px-12 md:py-6 border-b border-border/40 bg-background/80 backdrop-blur-md">
                <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-lg bg-card border border-border flex items-center justify-center p-1.5 shadow-2xs">
                        <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-foreground">
                        {COMPANY_NAME}
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <SignInButton variant="default" size="sm" />
                </div>
            </header>

            {/* Hero */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 md:py-24">
                <div className="text-center space-y-6 max-w-2xl mx-auto">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-border bg-card text-foreground text-xs font-medium shadow-2xs">
                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                        Solar Installation CRM
                    </div>

                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                        Manage your solar
                        <span className="block text-muted-foreground">pipeline with ease</span>
                    </h1>

                    <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
                        {COMPANY_TAGLINE} — from first inquiry to completed installation, track every step of your solar projects.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                        <SignInButton
                            className="w-full sm:w-auto px-8 shadow-xs"
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
                            className="group relative p-5 rounded-lg border border-border bg-card hover:border-foreground/30 hover:shadow-xs transition-all duration-200"
                        >
                            <div className="size-9 rounded-md bg-secondary border border-border flex items-center justify-center mb-3 group-hover:bg-accent transition-colors">
                                <feature.icon className="w-4 h-4 text-foreground" />
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
            <footer className="relative z-10 text-center py-6 px-6 text-sm text-muted-foreground border-t border-border/40">
                © {new Date().getFullYear()} {COMPANY_NAME}. All rights reserved.
            </footer>
        </div>
    );
}
