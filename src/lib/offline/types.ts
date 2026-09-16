export type SyncState = "synced" | "offline" | "syncing" | "error";

export type PendingCounts = {
    patches: number;
    photos: number;
    failed: number;
};
