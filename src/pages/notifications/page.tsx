import { useNavigate } from "react-router-dom";
import {
    Bell,
    BellOff,
    CheckCheck,
    ClipboardCheck,
    FileSignature,
    HardHat,
    Search as SearchIcon,
    UserPlus,
    Wrench,
} from "lucide-react";

import {
    useMyNotifications,
    useMarkNotificationRead,
    useMarkAllNotificationsRead,
    useUnreadNotificationCount,
} from "@/lib/supabase/hooks.ts";
import type { AppNotification } from "@/lib/supabase/queries/notifications.ts";
import type { NotificationEvent } from "@/lib/supabase/database.types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    Empty,
    EmptyHeader,
    EmptyMedia,
    EmptyTitle,
    EmptyDescription,
} from "@/components/ui/empty.tsx";
import { cn } from "@/lib/utils.ts";

// ─── Event icon/color mapping ───────────────────────────────────────────────

const EVENT_CONFIG: Record<
    NotificationEvent,
    { icon: React.ComponentType<{ className?: string }>; color: string }
> = {
    lead_assigned: { icon: UserPlus, color: "text-blue-500 bg-blue-500/10" },
    inspection_scheduled: { icon: SearchIcon, color: "text-amber-500 bg-amber-500/10" },
    installation_scheduled: { icon: Wrench, color: "text-emerald-500 bg-emerald-500/10" },
    quote_accepted: { icon: ClipboardCheck, color: "text-violet-500 bg-violet-500/10" },
    contract_signed: { icon: FileSignature, color: "text-rose-500 bg-rose-500/10" },
};

// ─── Relative time helper ───────────────────────────────────────────────────

function timeAgo(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
}

// ─── Notification card ──────────────────────────────────────────────────────

function NotificationCard({
    notification,
    onMarkRead,
    onClick,
}: {
    notification: AppNotification;
    onMarkRead: (id: string) => void;
    onClick: (n: AppNotification) => void;
}) {
    const config = EVENT_CONFIG[notification.event] ?? {
        icon: Bell,
        color: "text-muted-foreground bg-muted",
    };
    const Icon = config.icon;

    return (
        <button
            type="button"
            onClick={() => onClick(notification)}
            className={cn(
                "w-full flex items-start gap-3.5 px-4 py-3.5 text-left rounded-xl transition-all duration-150",
                "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !notification.isRead
                    ? "bg-accent/40"
                    : "bg-transparent",
            )}
        >
            {/* Icon */}
            <div
                className={cn(
                    "shrink-0 size-9 rounded-lg flex items-center justify-center mt-0.5",
                    config.color,
                )}
            >
                <Icon className="size-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p
                        className={cn(
                            "text-sm leading-snug",
                            !notification.isRead
                                ? "font-semibold text-foreground"
                                : "font-medium text-foreground/80",
                        )}
                    >
                        {notification.title ?? notification.event.replace(/_/g, " ")}
                    </p>
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0 mt-0.5">
                        {timeAgo(notification.createdAt)}
                    </span>
                </div>
                {notification.message && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                        {notification.message}
                    </p>
                )}
            </div>

            {/* Unread dot */}
            {!notification.isRead && (
                <div className="shrink-0 mt-2">
                    <div className="size-2 rounded-full bg-primary" />
                </div>
            )}
        </button>
    );
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function NotificationsPage() {
    const navigate = useNavigate();
    const { data: notifications, isLoading } = useMyNotifications();
    const { data: unreadCount } = useUnreadNotificationCount();
    const { mutateAsync: markRead } = useMarkNotificationRead();
    const { mutateAsync: markAllRead, isPending: markingAll } = useMarkAllNotificationsRead();

    function handleClick(n: AppNotification) {
        if (!n.isRead) void markRead(n.id);
        if (n.leadId) navigate(`/projects/${n.leadId}`);
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">
                        Notifications
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        {unreadCount
                            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
                            : "You're all caught up"}
                    </p>
                </div>
                {(unreadCount ?? 0) > 0 && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void markAllRead()}
                        disabled={markingAll}
                        className="shrink-0 gap-1.5"
                    >
                        <CheckCheck className="size-3.5" />
                        {markingAll ? "Marking…" : "Mark all read"}
                    </Button>
                )}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className="flex items-start gap-3.5 p-4">
                            <Skeleton className="size-9 rounded-lg shrink-0" />
                            <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-full" />
                            </div>
                        </div>
                    ))}
                </div>
            ) : !notifications || notifications.length === 0 ? (
                <Empty className="min-h-[50vh]">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <BellOff />
                        </EmptyMedia>
                        <EmptyTitle>No notifications yet</EmptyTitle>
                        <EmptyDescription>
                            You'll see updates here when leads are assigned, inspections are
                            scheduled, quotes are approved, and more.
                        </EmptyDescription>
                    </EmptyHeader>
                </Empty>
            ) : (
                <div className="divide-y divide-border/50 rounded-xl border border-border bg-card overflow-hidden">
                    {notifications.map((n) => (
                        <NotificationCard
                            key={n.id}
                            notification={n}
                            onMarkRead={(id) => void markRead(id)}
                            onClick={handleClick}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
