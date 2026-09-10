import { NavLink } from "react-router-dom";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { cn } from "@/lib/utils.ts";
import { LayoutDashboard, Users, KanbanSquare, UserCog, BarChart3, CalendarDays } from "lucide-react";

export default function MobileNav() {
    const { data: currentUser } = useCurrentUser();
    const role = currentUser?.role ?? "";

    const items = [
        { label: "Home", to: "/", icon: LayoutDashboard },
        { label: "Pipeline", to: "/pipeline", icon: KanbanSquare },
        { label: "Leads", to: "/leads", icon: Users },
        { label: "Calendar", to: "/calendar", icon: CalendarDays },
        ...(["superadmin", "admin"].includes(role) ? [{ label: "Reports", to: "/reports", icon: BarChart3 }] : []),
        ...(["superadmin", "admin"].includes(role) ? [{ label: "Team", to: "/team", icon: UserCog }] : []),
    ];

    return (
        <nav
            className="glass-nav fixed left-3 right-3 flex justify-around rounded-2xl border border-sidebar-border shadow-lg md:hidden z-50"
            style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
            {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"} className="min-w-0 flex-1">
                    {({ isActive }) => (
                        <div className={cn(
                            "flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium tracking-tight transition-colors cursor-pointer",
                            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                        )}>
                            <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                            {item.label}
                        </div>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}
