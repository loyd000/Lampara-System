/**
 * Last-known-good current-user profile, persisted outside React Query's
 * cache (which doesn't survive a reload).
 *
 * getCurrentUser() calls supabase.auth.getUser(), which always revalidates
 * against the server — unlike the session itself (read locally, no network
 * call), this fails offline every time. Without a fallback, a cold reload
 * while offline hard-blocks at AccountGate before a technician can reach
 * anything, including downloaded offline work. This is that fallback: seeded
 * on every successful fetch, read as useCurrentUser's `initialData`.
 */

import type { User } from "../supabase/types.ts";

const KEY = "lampara.cachedCurrentUser.v1";

export function cacheCurrentUser(user: User): void {
    try {
        localStorage.setItem(KEY, JSON.stringify(user));
    } catch {
        // Private browsing / storage full — the app just won't survive a
        // cold offline reload as gracefully; nothing else depends on this.
    }
}

export function clearCachedCurrentUser(): void {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}

export function getCachedCurrentUser(): User | undefined {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as User) : undefined;
    } catch {
        return undefined;
    }
}
