import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Cloud, CloudOff, RefreshCw, AlertCircle } from "lucide-react";

import { offlineDb } from "@/lib/offline/db.ts";
import { drainQueue } from "@/lib/offline/sync-engine.ts";
import { useIsOnline } from "@/lib/offline/network.ts";
import { Button } from "@/components/ui/button.tsx";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
    PopoverHeader,
    PopoverTitle,
    PopoverDescription,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

type FailedItem = { id: string; kind: "patch" | "photo"; error?: string };

/**
 * Offline sync status, embedded next to the Bell (mobile top bar) and next
 * to Sign Out (desktop sidebar footer) — see AppLayout.tsx / AppSidebar.tsx.
 *
 * Reads offlineDb reactively via useLiveQuery, so this never needs its own
 * refetch/poll — a queue write from anywhere in the app (saveSurveyOffline,
 * addPhotosOffline, drainQueue) updates the badge immediately.
 */
export default function SyncStatusButton({
    className,
    size = "icon-lg",
}: {
    className?: string;
    size?: "icon" | "icon-lg" | "icon-sm";
}) {
    const online = useIsOnline();
    const [syncing, setSyncing] = useState(false);

    const pendingPatches =
        useLiveQuery(() => offlineDb.patchQueue.where("status").notEqual("failed").count(), []) ??
        0;
    const pendingPhotos =
        useLiveQuery(() => offlineDb.photoQueue.where("status").notEqual("failed").count(), []) ??
        0;
    const failedPatches =
        useLiveQuery(() => offlineDb.patchQueue.where("status").equals("failed").toArray(), []) ??
        [];
    const failedPhotos =
        useLiveQuery(() => offlineDb.photoQueue.where("status").equals("failed").toArray(), []) ??
        [];

    const pending = pendingPatches + pendingPhotos;
    const failed: FailedItem[] = [
        ...failedPatches.map((p) => ({ id: p.id, kind: "patch" as const, error: p.error })),
        ...failedPhotos.map((p) => ({ id: p.id, kind: "photo" as const, error: p.error })),
    ];

    async function syncNow() {
        setSyncing(true);
        try {
            await drainQueue();
        } finally {
            setSyncing(false);
        }
    }

    async function dismiss(item: FailedItem) {
        const table = item.kind === "patch" ? offlineDb.patchQueue : offlineDb.photoQueue;
        await table.delete(item.id);
    }

    const state: "offline" | "error" | "syncing" | "pending" | "synced" = !online
        ? "offline"
        : failed.length > 0
          ? "error"
          : syncing
            ? "syncing"
            : pending > 0
              ? "pending"
              : "synced";

    const Icon =
        state === "offline"
            ? CloudOff
            : state === "error"
              ? AlertCircle
              : state === "syncing"
                ? RefreshCw
                : Cloud;

    const badgeCount = failed.length > 0 ? failed.length : pending;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size={size}
                    className={cn(
                        "relative",
                        state === "offline" && "text-amber-600 dark:text-amber-400",
                        state === "error" && "text-destructive",
                        (state === "synced" || state === "pending" || state === "syncing") &&
                            "text-muted-foreground",
                        className,
                    )}
                    aria-label="Offline sync status"
                >
                    <Icon className={cn("size-4", state === "syncing" && "animate-spin")} />
                    {badgeCount > 0 && (
                        <span
                            className={cn(
                                "absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold leading-none text-white",
                                failed.length > 0 ? "bg-destructive" : "bg-amber-500",
                            )}
                        >
                            {badgeCount > 99 ? "99+" : badgeCount}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
                <PopoverHeader>
                    <PopoverTitle>
                        {state === "offline"
                            ? "Offline Mode"
                            : failed.length > 0
                              ? "Sync issue"
                              : pending > 0
                                ? `${pending} change${pending !== 1 ? "s" : ""} pending`
                                : "All changes synced"}
                    </PopoverTitle>
                    <PopoverDescription>
                        {state === "offline"
                            ? "Changes are saved on this device and will sync once you're back online."
                            : pending > 0
                              ? "Waiting to sync with the server."
                              : "Nothing to sync."}
                    </PopoverDescription>
                </PopoverHeader>

                {failed.length > 0 && (
                    <div className="mt-3 space-y-2">
                        {failed.map((item) => (
                            <div
                                key={`${item.kind}-${item.id}`}
                                className="flex items-start justify-between gap-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
                            >
                                <span className="min-w-0">
                                    {item.error ?? "This inspection was removed or reassigned."}
                                </span>
                                <button
                                    type="button"
                                    className="shrink-0 underline underline-offset-2"
                                    onClick={() => void dismiss(item)}
                                >
                                    Dismiss
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {online && (pending > 0 || failed.length > 0) && (
                    <Button
                        size="sm"
                        className="mt-3 w-full h-8 text-xs"
                        onClick={() => void syncNow()}
                        disabled={syncing}
                    >
                        {syncing ? "Syncing…" : "Sync Now"}
                    </Button>
                )}
            </PopoverContent>
        </Popover>
    );
}
