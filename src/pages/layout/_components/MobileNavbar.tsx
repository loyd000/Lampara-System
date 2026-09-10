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
        <nav className="glass-nav fixed bottom-0 left-0 right-0 flex justify-around border-t border-sidebar-border md:hidden z-50">
            {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === "/"}>
                    {({ isActive }) => (
                        <div className={cn(
                            "flex flex-col items-center gap-0.5 py-2.5 px-3 text-[11px] font-medium tracking-tight transition-colors cursor-pointer",
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
