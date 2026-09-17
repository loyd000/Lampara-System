import * as React from "react";

import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card"
            className={cn(
                // Flat by default — minimalist panels, matching every other
                // content surface in the app. Shadows are reserved for
                // things that actually float above content: dialogs,
                // popovers, dropdowns, the mobile nav bar.
                "flex flex-col gap-6 rounded-xl border border-border bg-card py-6 text-card-foreground",
                className,
            )}
            {...props}
        />
    );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-header"
            className={cn(
                "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-1.5 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-4",
                className,
            )}
            {...props}
        />
    );
}

/** Renders as a real heading element (h2 by default, matching this app's
 * existing "h1 page title, h2 section titles" convention) so screen-reader
 * users can navigate between card sections by heading, not just by scanning
 * styled text. Pass `level` for a card nested under another card's heading. */
function CardTitle({ className, level = 2, ...props }: React.ComponentProps<"h2"> & { level?: 2 | 3 | 4 }) {
    const Heading = `h${level}` as `h${typeof level}`;
    return (
        <Heading
            data-slot="card-title"
            className={cn("text-base font-semibold tracking-tight text-foreground leading-snug", className)}
            {...props}
        />
    );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-description"
            className={cn("text-xs text-muted-foreground", className)}
            {...props}
        />
    );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-action"
            className={cn(
                "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
                className,
            )}
            {...props}
        />
    );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-content"
            className={cn("px-6", className)}
            {...props}
        />
    );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
    return (
        <div
            data-slot="card-footer"
            className={cn("flex items-center px-6 [.border-t]:pt-4", className)}
            {...props}
        />
    );
}

export {
    Card,
    CardHeader,
    CardFooter,
    CardTitle,
    CardAction,
    CardDescription,
    CardContent,
};
