import { useEffect, useState } from "react";

/**
 * True when the browser/WebView believes it has a network path. Deliberately
 * not a ping-based "real connectivity" check — a failed sync attempt is
 * itself the correct fallback signal, and a field-ops app on cellular data
 * hitting a captive portal is rare enough not to justify a ping endpoint.
 */
export function useIsOnline(): boolean {
    const [online, setOnline] = useState(navigator.onLine);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);
    return online;
}
