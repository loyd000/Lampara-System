import { useEffect, useState } from "react";

/** How often the clock ticks. Staleness is measured in days, so a minute is ample. */
const DEFAULT_INTERVAL_MS = 60_000;

/**
 * The current time as a millisecond epoch, refreshed on an interval.
 *
 * Reading `Date.now()` directly during render is impure — the value changes
 * between renders for reasons React cannot see. Holding it in state makes the
 * dependency explicit and has the side benefit that "3d inactive" badges tick
 * over on their own instead of freezing at whatever the page load said.
 */
export function useNow(intervalMs: number = DEFAULT_INTERVAL_MS): number {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
        return () => window.clearInterval(timer);
    }, [intervalMs]);

    return now;
}
