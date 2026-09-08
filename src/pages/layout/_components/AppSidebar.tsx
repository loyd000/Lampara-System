import { NavLink } from "react-router-dom";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { cn } from "@/lib/utils.ts";
import {
    LayoutDashboard,
    Users,
    SunMedium,
    KanbanSquare,
    UserCog,
    BarChart3,
} from "lucide-react";

type NavItem = {
    label: string;
    to: string;
    icon: React.ComponentType<{ className?: string }>;
    roles?: string[];
};

const NAV_ITEMS: NavItem[] = [
    { label: "Dashboard", to: "/", icon: LayoutDashboard },
    { label: "Pipeline", to: "/pipeline", icon: KanbanSquare },
    { label: "Leads", to: "/leads", icon: Users },
    { label: "Reports", to: "/reports", icon: BarChart3, roles: ["admin", "office", "sales"] },
    { label: "Team", to: "/team", icon: UserCog, roles: ["admin", "office"] },
];

export default function AppSidebar() {
    const { data: currentUser } = useCurrentUser();
    const role = currentUser?.role ?? "";

    const visibleNav = NAV_ITEMS.filter(
        (item) => !item.roles || item.roles.includes(role),
    );

    return (
        <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex-shrink-0">
            {/* Logo */}
            <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
                <div className="w-8 h-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
                    <SunMedium className="w-4 h-4 text-sidebar-primary-foreground" />
                </div>
                <span className="font-bold text-lg tracking-tight text-sidebar-foreground">Lampara</span>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-0.5">
                {visibleNav.map((item) => (
                    <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                        {({ isActive }) => (
                            <div
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                                    isActive
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
                                )}
                            >
                                <item.icon className="w-4 h-4 flex-shrink-0" />
                                {item.label}
                            </div>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User info */}
            {currentUser && (
                <div className="px-4 py-4 border-t border-sidebar-border">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-sidebar-primary/20 flex items-center justify-center text-sidebar-primary font-semibold text-sm">
                            {(currentUser.name ?? "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-sidebar-foreground truncate">
                                {currentUser.name ?? "User"}
                            </p>
                            <p className="text-xs text-sidebar-foreground/50 capitalize">{currentUser.role}</p>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
