import { cn } from "@/lib/utils.ts";

/**
 * The bar that appears while a form has unsaved work.
 *
 * Shared because both places that need one got their positioning wrong in
 * different ways. The quote builder pinned a pill to `bottom-4` at `z-40`,
 * which put it underneath the `z-50` floating tab bar on a phone — the save
 * button was rendering the whole time, just invisible, and read as "there is
 * no save button". The ocular report used `sticky`, which anchors to the
 * bottom of its *form* rather than the screen, so it came to rest halfway up
 * the page with report photos below it.
 *
 * Fixed to the viewport, clear of the tab bar (`.above-mobile-nav`). Full
 * width on a phone so the actions have room; a centred pill from `md` up,
 * where a full-width bar would look like a page-level toolbar it isn't.
 */
export default function UnsavedChangesBar({
    label = "Unsaved changes",
    className,
    children,
}: {
    label?: string;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div
            role="status"
            className={cn(
                "glass-nav above-mobile-nav fixed z-40",
                "left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2",
                "flex items-center justify-between gap-3 md:gap-4",
                "rounded-2xl md:rounded-full border border-border shadow-lg",
                "px-4 py-2.5",
                "animate-in fade-in slide-in-from-bottom-3 duration-200",
                className,
            )}
        >
            {/* `min-w-0` + `truncate`: the buttons are `shrink-0`, so without
                this the label wrapped to two lines at ~320px and the bar grew
                a row taller mid-edit. */}
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span className="size-2 shrink-0 rounded-full bg-amber-500 animate-pulse" />
                <span className="truncate">{label}</span>
            </span>
            <div className="flex shrink-0 items-center gap-2">{children}</div>
        </div>
    );
}
