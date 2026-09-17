import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, CloudOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

/** Vite/browser wording for a failed `import()` — a route chunk that's
 *  neither reachable over the network nor already cached. Distinct from an
 *  actual rendering crash: offline, this is expected for any page whose code
 *  was never fetched while online, not a bug to show a stack trace for. */
function isChunkLoadError(message: string | undefined): boolean {
    return !!message && /dynamically imported module|module script failed|failed to fetch/i.test(message);
}

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("[ErrorBoundary caught an error]:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            // A failed chunk import means this page's code couldn't be
            // fetched — not a crash. Previously this also required
            // `!navigator.onLine`, but that flag only reflects whether the OS
            // reports a network interface as up, not whether the fetch could
            // actually succeed; on the spotty/captive-portal signal a field
            // technician is exactly likely to hit, it can read `true` while
            // still misclassifying the real cause. The message pattern alone
            // is the reliable signal here: whatever kept the chunk from
            // loading, "Reload Page" would just repeat the same failure, so
            // this sends the person somewhere that IS guaranteed cached (the
            // dashboard is part of the entry bundle, not a lazy route)
            // instead of looping on a raw stack trace.
            const offlineChunkFailure = isChunkLoadError(this.state.error?.message);

            return (
                <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
                    <div className="w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-6 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                            {offlineChunkFailure ? (
                                <CloudOff className="size-6" />
                            ) : (
                                <AlertCircle className="size-6" />
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <h1 className="text-lg font-semibold text-foreground">
                                {offlineChunkFailure ? "Not available offline" : "Something went wrong"}
                            </h1>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                {offlineChunkFailure
                                    ? "This page hasn't been opened while online yet, so it wasn't saved for offline use. Connect to the internet and open it once — after that, it'll work offline too."
                                    : "An unexpected error occurred while rendering the page."}
                            </p>
                        </div>
                        {!offlineChunkFailure && this.state.error?.message && (
                            <div className="rounded-md border border-border bg-secondary/50 p-3 text-left font-mono text-xs text-muted-foreground break-words max-h-32 overflow-auto">
                                {this.state.error.message}
                            </div>
                        )}
                        <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5 mx-auto"
                            onClick={() =>
                                offlineChunkFailure
                                    ? (window.location.href = "/")
                                    : window.location.reload()
                            }
                        >
                            <RefreshCw className="size-3.5" />
                            {offlineChunkFailure ? "Go to Dashboard" : "Reload Page"}
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
