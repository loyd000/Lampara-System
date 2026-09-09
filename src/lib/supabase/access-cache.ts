import type { QueryClient } from "@tanstack/react-query";
import type { User } from "./types.ts";

/** Discard data fetched under an earlier set of account permissions. */
export function watchAccountAccess(client: QueryClient) {
    let previousAccess: string | undefined;
    return client.getQueryCache().subscribe((event) => {
        const query = event.query;
        if (query.queryKey[0] !== "currentUser" || query.state.status !== "success") return;
        const user = query.state.data as User | null;
        const access = user ? `${user._id}:${user.role}:${user.isActive}` : "none";
        const changed = previousAccess !== undefined && previousAccess !== access;
        previousAccess = access;
        if (changed) {
            // Reset also cancels in-flight requests and clears inactive cached results.
            // Active observers get a fresh request using the server's current RLS rules.
            void client.resetQueries({ predicate: (item) => item.queryKey[0] !== "currentUser" });
        }
    });
}
