import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";

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
            return (
                <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
                    <div className="w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-6 shadow-xs text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                            <AlertCircle className="size-6" />
                        </div>
                        <div className="space-y-1.5">
                            <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                An unexpected error occurred while rendering the page.
                            </p>
                        </div>
                        {this.state.error?.message && (
                            <div className="rounded-md border border-border bg-secondary/50 p-3 text-left font-mono text-xs text-muted-foreground break-words max-h-32 overflow-auto">
                                {this.state.error.message}
                            </div>
                        )}
                        <Button
                            variant="default"
                            size="sm"
                            className="gap-1.5 mx-auto"
                            onClick={() => window.location.reload()}
                        >
                            <RefreshCw className="size-3.5" />
                            Reload Page
                        </Button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
