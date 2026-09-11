import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    parseISO,
    startOfMonth,
    startOfWeek,
    subMonths,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { ordered, type DateRange } from "./date-range.ts";

/**
 * One month, pick a range by dragging across it.
 *
 * Two date boxes made the reader do the work of noticing that one date has to
 * follow the other. Here the range is the gesture: press on the first day, drag
 * to the last, release. Clicking once and clicking again also works — the same
 * two-click flow every booking site uses — because dragging is awkward on a
 * trackpad and impossible from a keyboard.
 *
 * Fully controlled: `value` is the committed range and every change goes
 * through `onChange`. The in-progress selection lives here, so a drag that is
 * abandoned mid-way never leaves the form holding half a range.
 */
export function DateRangePicker({
    value,
    onChange,
    className,
    ...rest
}: {
    value: DateRange;
    onChange: (range: DateRange) => void;
} & React.ComponentProps<"div">) {
    const [month, setMonth] = useState(() =>
        value.start ? parseISO(value.start) : new Date(),
    );

    // `anchor` is the day the current selection started from. Non-null means a
    // selection is in progress: either the pointer is still down, or one click
    // has landed and we're waiting for the second.
    const [anchor, setAnchor] = useState<string | null>(null);
    const [hover, setHover] = useState<string | null>(null);
    const [dragging, setDragging] = useState(false);
    // Ref so the pointermove handler can read dragging without a stale closure.
    const draggingRef = React.useRef(false);
    const anchorRef = React.useRef<string | null>(null);

    // Releasing outside the grid still ends the drag; without this the next
    // hover anywhere in the month would keep redrawing the range.
    useEffect(() => {
        if (!dragging) return;
        function endDrag() {
            setDragging(false);
            draggingRef.current = false;
        }
        window.addEventListener("pointerup", endDrag);
        window.addEventListener("pointercancel", endDrag);
        return () => {
            window.removeEventListener("pointerup", endDrag);
            window.removeEventListener("pointercancel", endDrag);
        };
    }, [dragging]);

    const days = useMemo(
        () =>
            eachDayOfInterval({
                start: startOfWeek(startOfMonth(month)),
                end: endOfWeek(endOfMonth(month)),
            }),
        [month],
    );

    // What to paint: the in-progress selection while one is running, otherwise
    // whatever the form is holding.
    const shown: DateRange = anchor
        ? ordered(anchor, hover ?? anchor)
        : value;

    function selectTo(anchorDay: string, targetDay: string) {
        onChange(ordered(anchorDay, targetDay));
    }

    function handlePointerDown(day: string, e: React.PointerEvent) {
        // If we have a pending first-click anchor (no drag, just waiting for
        // the second tap) and the user taps a *different* day, complete the
        // range rather than starting over.
        if (anchor && !dragging && day !== anchor) {
            onChange(ordered(anchor, day));
            setAnchor(null);
            anchorRef.current = null;
            setHover(null);
            return;
        }
        // Every other pointerdown (fresh start, or re-tapping the anchor day)
        // always begins a brand-new selection.
        e.preventDefault();
        setAnchor(day);
        anchorRef.current = day;
        setHover(day);
        setDragging(true);
        draggingRef.current = true;
        // Commit immediately so releasing without moving is a valid one-day range.
        onChange({ start: day, end: day });
    }

    function handlePointerEnter(day: string) {
        if (!anchorRef.current || !draggingRef.current) return;
        setHover(day);
        selectTo(anchorRef.current, day);
    }

    /**
     * On mobile, `pointerenter` is unreliable after releasePointerCapture — the
     * browser may not re-hit-test intermediate elements. We use pointermove on
     * the grid container instead, resolving which day button the finger is
     * currently over via `elementFromPoint`.
     */
    function handleGridPointerMove(e: React.PointerEvent<HTMLDivElement>) {
        if (!draggingRef.current || !anchorRef.current) return;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const btn = el?.closest("button[data-day]") as HTMLButtonElement | null;
        if (!btn) return;
        const day = btn.dataset.day;
        if (!day) return;
        setHover(day);
        selectTo(anchorRef.current, day);
    }

    function handlePointerUp(day: string) {
        if (!dragging) return;
        setDragging(false);
        draggingRef.current = false;

        if (day === anchor) {
            // Released on the same day: "first click" of a two-click flow.
            // Keep anchor set so the next tap completes the range.
            return;
        }

        // Released on a different day: drag is complete.
        if (anchor) selectTo(anchor, day);
        setAnchor(null);
        anchorRef.current = null;
        setHover(null);
    }



    return (
        // `...rest` reaches the DOM: `FormControl` (a Radix Slot) clones its
        // child and injects `id`/`aria-invalid`/`aria-describedby`, and without
        // a place for them to land, the FormLabel's `htmlFor` pointed at
        // nothing and a validation error was never announced.
        <div className={cn("rounded-lg border bg-card p-2 select-none", className)} {...rest}>
            <div className="flex items-center justify-between px-1 pb-1.5">
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setMonth((m) => subMonths(m, 1))}
                    aria-label="Previous month"
                >
                    <ChevronLeft className="size-4" />
                </Button>
                <span className="text-xs font-semibold text-foreground">
                    {format(month, "MMMM yyyy")}
                </span>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setMonth((m) => addMonths(m, 1))}
                    aria-label="Next month"
                >
                    <ChevronRight className="size-4" />
                </Button>
            </div>

            <div className="grid grid-cols-7">
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div
                        key={`${d}-${i}`}
                        className="text-center text-[10px] font-semibold text-muted-foreground pb-1"
                    >
                        {d}
                    </div>
                ))}
            </div>

            {/* `touch-none` so dragging across the grid selects days instead of
                scrolling the dialog on a phone. */}
            <div className="grid grid-cols-7 touch-none" onPointerMove={handleGridPointerMove}>
                {days.map((date) => {
                    const key = format(date, "yyyy-MM-dd");
                    const inMonth = isSameMonth(date, month);
                    const selected = Boolean(shown.start) && key >= shown.start && key <= shown.end;
                    const isStart = key === shown.start;
                    const isEnd = key === shown.end;

                    return (
                        <button
                            key={key}
                            type="button"
                            data-day={key}
                            onPointerDown={(e) => {
                                // Touch implicitly captures the pointer to the
                                // element it went down on, which stops
                                // `pointerenter` firing on the days dragged
                                // over. Releasing it restores normal hit
                                // testing. Guarded because the call throws if
                                // the pointer is no longer active.
                                try {
                                    e.currentTarget.releasePointerCapture(e.pointerId);
                                } catch {
                                    /* nothing was captured; carry on */
                                }
                                handlePointerDown(key, e);
                            }}
                            onPointerEnter={() => handlePointerEnter(key)}
                            onPointerUp={() => handlePointerUp(key)}
                            className={cn(
                                "relative h-9 text-xs font-medium",
                                !inMonth && !selected && "text-muted-foreground/40",
                            )}
                        >
                            {/* The band is its own inset layer rather than a
                                background on the cell. A full-bleed cell
                                background is as tall as the row, so the bands
                                of consecutive weeks touch top to bottom and
                                read as one block; inset vertically it stays a
                                pill with the days threaded through it. */}
                            {selected && (
                                <span
                                    aria-hidden
                                    className={cn(
                                        "absolute inset-y-1 left-0 right-0 bg-primary/15",
                                        // 1.5 (6px), not 1: the day circle is
                                        // 28px in a ~40px cell, so its edge sits
                                        // 6px in. Anything less and the band
                                        // pokes out past the end circle.
                                        isStart && "left-1.5 rounded-l-full",
                                        isEnd && "right-1.5 rounded-r-full",
                                    )}
                                />
                            )}
                            <span
                                className={cn(
                                    "relative inline-flex size-7 items-center justify-center rounded-full",
                                    (isStart || isEnd) && selected &&
                                        "bg-primary text-primary-foreground font-semibold",
                                    !selected && "hover:bg-muted",
                                    !selected && isToday(date) && "ring-1 ring-primary/50",
                                )}
                            >
                                {format(date, "d")}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
