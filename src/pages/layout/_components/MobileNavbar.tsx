import { NavLink } from "react-router-dom";
import { useCurrentUser, useUnreadNotificationCount } from "@/lib/supabase/hooks.ts";
import { cn } from "@/lib/utils.ts";
import { LayoutDashboard, Users, UserCog, Package, CalendarDays, Columns3, Bell } from "lucide-react";

export default function MobileNav() {
    const { data: currentUser } = useCurrentUser();
    const { data: unreadCount } = useUnreadNotificationCount();
    const role = currentUser?.role ?? "";

    const items = [
        { label: "Home", to: "/", icon: LayoutDashboard },
        { label: "Projects", to: "/projects", icon: Users },
        { label: "Pipeline", to: "/pipeline", icon: Columns3 },
        { label: "Calendar", to: "/calendar", icon: CalendarDays },
        { label: "Alerts", to: "/notifications", icon: Bell },
        // Packages matches the desktop sidebar and the route's own
        // RequireRole: superadmin only, not admin.
        ...(role === "superadmin" ? [{ label: "Packages", to: "/packages", icon: Package }] : []),
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
                            "flex flex-col items-center gap-0.5 py-2.5 px-1 text-[10px] font-medium tracking-tight transition-colors cursor-pointer relative",
                            isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                        )}>
                            <div className="relative">
                                <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                                {item.to === "/notifications" && (unreadCount ?? 0) > 0 && (
                                    <span className="absolute -top-1 -right-1.5 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold leading-none">
                                        {unreadCount! > 99 ? "99+" : unreadCount}
                                    </span>
                                )}
                            </div>
                            {/* Six tabs can share under 50px each on a small phone.
                                Without this a label like "Calendar" wraps to two
                                lines and grows the whole bar, shifting every icon. */}
                            <span className="w-full truncate text-center leading-none">
                                {item.label}
                            </span>
                        </div>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}
