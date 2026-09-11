import { NavLink } from "react-router-dom";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { cn } from "@/lib/utils.ts";
import {
    LayoutDashboard,
    Users,
    KanbanSquare,
    UserCog,
    Package,
    CalendarDays,
    Search,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import { COMPANY_NAME, ROLE_LABELS } from "@/lib/constants.ts";

type NavItem = {
    label: string;
    to: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    roles?: string[];
};

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

const NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", to: "/", icon: LayoutDashboard },
    { label: "Pipeline", to: "/pipeline", icon: KanbanSquare },
    { label: "Leads", to: "/leads", icon: Users },
    { label: "Calendar", to: "/calendar", icon: CalendarDays },
    { label: "Packages", to: "/packages", icon: Package, roles: ["superadmin"] },
    { label: "Team", to: "/team", icon: UserCog, roles: ["superadmin", "admin"] },
];

export default function AppSidebar() {
    const { data: currentUser } = useCurrentUser();
    const role = currentUser?.role ?? "";

    const visibleNav = NAV_ITEMS.filter(
        (item) => !item.roles || item.roles.includes(role),
    );

    return (
        <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border shrink-0">
            {/* Logo & Theme Toggle */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-sidebar-border">
                <div className="flex items-center gap-2.5">
                    <img
                        src="/lampara-icon.png"
                        alt="Lampara"
                        className="size-7 object-contain drop-shadow-md dark:invert shrink-0"
                    />
                    <div className="flex flex-col">
                        <span className="font-bold text-base tracking-tight text-sidebar-foreground leading-tight">{COMPANY_NAME}</span>
                        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Solar CRM</span>
                    </div>
                </div>
                <ThemeToggle />
            </div>

            {/* Search */}
            <div className="px-3 pt-3">
                <button
                    type="button"
                    onClick={() => document.dispatchEvent(new CustomEvent("lampara:open-search"))}
                    className="flex w-full items-center gap-2 rounded-lg bg-sidebar-accent/60 hover:bg-sidebar-accent px-3 py-2 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                >
                    <Search className="w-3.5 h-3.5" />
                    <span className="flex-1 text-left">Search</span>
                    <kbd className="text-[10px] font-medium border border-sidebar-border rounded px-1 py-0.5">
                        {isMac ? "⌘K" : "Ctrl K"}
                    </kbd>
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 pb-4 pt-3 space-y-0.5">
                {visibleNav.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                        {({ isActive }) => (
                            <div
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium tracking-tight transition-colors cursor-pointer",
                                    isActive
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold shadow-sm"
                                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                                )}
                            >
                                <item.icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.25 : 1.75} />
                                {item.label}
                            </div>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User info & Logout */}
            {currentUser && (
                <div className="px-3.5 py-3 border-t border-sidebar-border">
                    <div className="flex items-center justify-between gap-2">
                        <NavLink
                            to="/profile"
                            className="flex flex-1 items-center gap-2.5 min-w-0 rounded-md -mx-1 px-1 py-1 hover:bg-sidebar-accent/50 transition-colors"
                        >
                            <div className="size-8 rounded-md bg-secondary text-foreground flex items-center justify-center font-semibold text-xs border border-border shrink-0">
                                {(currentUser.name ?? currentUser.email ?? "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-sidebar-foreground truncate leading-snug">
                                    {currentUser.name ?? "User"}
                                </p>
                                <p className="text-[11px] text-muted-foreground truncate leading-none mt-0.5">
                                    {ROLE_LABELS[currentUser.role] ?? currentUser.role}
                                </p>
                            </div>
                        </NavLink>
                        <SignOutButton />
                    </div>
                </div>
            )}
        </aside>
    );
}
