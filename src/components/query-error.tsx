import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

/**
 * The whole-page "that didn't load" state.
 *
 * Deliberately shaped like a page header — same `text-[28px]` h1 and muted
 * subtitle as every real page — so a failed load reads as the page it replaced
 * rather than as a stray alert dropped on top of the layout.
 *
 * This one is page-sized. A section that fails inside a card wants an inline
 * message instead, not this; see `InlineQueryError`.
 */
export function QueryError({ title, onRetry }: { title: string; onRetry: () => void }) {
    return (
        <div role="alert" className="p-6 space-y-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">
                    {title}
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                    Check your connection and try again.
                </p>
            </div>
            <Button onClick={onRetry}>Try again</Button>
        </div>
    );
}

/**
 * The same thing for a panel inside a page, where the page header still exists
 * and a second 28px heading would be absurd.
 */
export function InlineQueryError({
    message,
    onRetry,
}: {
    message: string;
    onRetry: () => void;
}) {
    return (
        <div role="alert" className="flex flex-wrap items-center gap-3 py-2">
            <p className="text-sm text-muted-foreground">{message}</p>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onRetry}>
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Retry
            </Button>
        </div>
    );
}
