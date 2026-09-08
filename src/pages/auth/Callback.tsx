import { useEffect, useState } from "react";

import { useNavigate } from "react-router-dom";
import { useAuth } from "@/components/providers/auth-context.ts";
import { Spinner } from "@/components/ui/spinner.tsx";
import { Button } from "@/components/ui/button.tsx";

/**
 * OAuth / email-confirmation landing page.
 *
 * Far simpler than the Hercules OIDC callback it replaces: the Supabase client
 * is configured with `detectSessionInUrl`, so it consumes the code or fragment
 * on its own. This page only waits for the resulting session — or surfaces the
 * error the provider sent back.
 */
export default function AuthCallback() {
    const navigate = useNavigate();
    const { isAuthenticated, isLoading } = useAuth();
    // Supabase reports failures in the query string (PKCE) or the hash
    // (implicit). Read once on mount — the client strips these from the URL as
    // soon as it processes them, so a later read would come back empty.
    const [providerError] = useState<string | null>(() => {
        const params = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        const description =
            params.get("error_description") ??
            hash.get("error_description") ??
            params.get("error") ??
            hash.get("error");
        return description ? description.replace(/\+/g, " ") : null;
    });
    const [timedOut, setTimedOut] = useState(false);

    useEffect(() => {
        if (!isLoading && isAuthenticated) navigate("/", { replace: true });
    }, [isLoading, isAuthenticated, navigate]);

    // If no session has appeared, the link was probably already used or expired.
    useEffect(() => {
        const timer = window.setTimeout(() => setTimedOut(true), 10_000);
        return () => window.clearTimeout(timer);
    }, []);

    const failed = providerError || (timedOut && !isAuthenticated);

    if (failed) {
        return (
            <div className="flex flex-col items-center justify-center h-svh gap-6 px-4">
                <div className="flex flex-col items-center gap-2 text-center">
                    <p className="text-destructive font-medium">Something went wrong</p>
                    <p className="text-sm text-muted-foreground max-w-md">
                        {providerError ??
                            "We couldn't complete sign-in. The link may have expired or already been used."}
                    </p>
                </div>
                <div className="flex gap-3">
                    <Button variant="secondary" onClick={() => navigate("/", { replace: true })}>
                        Return home
                    </Button>
                    <Button onClick={() => window.location.assign("/")}>Try again</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center h-svh gap-4">
            <Spinner className="size-8" />
            <p className="text-sm text-muted-foreground">Signing you in…</p>
        </div>
    );
}
