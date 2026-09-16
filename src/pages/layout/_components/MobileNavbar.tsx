import { useState } from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils.ts";
import { LayoutDashboard, Users, CalendarDays, Columns3, Plus } from "lucide-react";
import CreateLeadDialog from "@/pages/leads/_components/CreateLeadDialog.tsx";

// Just the four everyday tabs. Notifications has its own bell button in the
// mobile top bar (AppLayout.tsx); Packages and Team moved to the Profile
// page, which already gates them by role — six-plus items each fighting for
// under 50px was the thing being fixed here.
const ITEMS = [
    { label: "Home", to: "/", icon: LayoutDashboard },
    { label: "Projects", to: "/projects", icon: Users },
];
const ITEMS_AFTER = [
    { label: "Pipeline", to: "/pipeline", icon: Columns3 },
    { label: "Calendar", to: "/calendar", icon: CalendarDays },
];

export default function MobileNav() {
    const [createOpen, setCreateOpen] = useState(false);

    return (
        <>
            <nav
                className="glass-nav fixed left-3 right-3 flex items-center justify-around rounded-2xl border border-sidebar-border shadow-lg md:hidden z-50"
                style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
            >
                {ITEMS.map((item) => <NavItem key={item.to} item={item} />)}

                {/* New Project — used to live as a button in the dashboard
                    header; raised out of the bar into the center like a
                    typical tab-bar action button so it reads as "the" thing
                    to do, not a fifth peer of Home/Projects/Pipeline/Calendar. */}
                <div className="min-w-0 flex-1 flex justify-center">
                    <button
                        type="button"
                        onClick={() => setCreateOpen(true)}
                        aria-label="New Project"
                        className="-mt-6 flex size-14 items-center justify-center rounded-full bg-sidebar-primary text-primary-foreground shadow-lg ring-4 ring-background cursor-pointer transition-transform active:scale-95"
                    >
                        <Plus className="size-6" strokeWidth={2.5} />
                    </button>
                </div>

                {ITEMS_AFTER.map((item) => <NavItem key={item.to} item={item} />)}
            </nav>

            <CreateLeadDialog open={createOpen} onClose={() => setCreateOpen(false)} />
        </>
    );
}

function NavItem({ item }: { item: { label: string; to: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> } }) {
    return (
        <NavLink to={item.to} end={item.to === "/"} className="min-w-0 flex-1">
            {({ isActive }) => (
                <div className={cn(
                    "flex flex-col items-center gap-0.5 py-2.5 px-1 text-[10px] font-medium tracking-tight transition-colors cursor-pointer relative",
                    isActive ? "text-sidebar-primary" : "text-sidebar-foreground/60",
                )}>
                    <item.icon className="w-5 h-5" strokeWidth={isActive ? 2.25 : 1.75} />
                    <span className="w-full truncate text-center leading-none">
                        {item.label}
                    </span>
                </div>
            )}
        </NavLink>
    );
}
