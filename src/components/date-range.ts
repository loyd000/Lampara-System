import { format, parseISO } from "date-fns";

/**
 * The range type and its two pure helpers, kept out of the picker component
 * so that file exports only components — mixing the two breaks Fast Refresh,
 * and the lint gate rightly refuses it.
 */
export type DateRange = { start: string; end: string };

/** yyyy-mm-dd sorts lexicographically, so no Date parsing is needed to order. */
export function ordered(a: string, b: string): DateRange {
    return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** "Mon, Sep 14 · 1 day" or "Mon, Sep 14 – Thu, Sep 17 · 4 days". */
export function describeRange(range: DateRange): string {
    if (!range.start) return "No dates selected";
    const day = (iso: string) => format(parseISO(iso), "EEE, MMM d");
    if (range.start === range.end) return `${day(range.start)} · 1 day`;
    const count =
        Math.round(
            (parseISO(range.end).getTime() - parseISO(range.start).getTime()) / 86_400_000,
        ) + 1;
    return `${day(range.start)} – ${day(range.end)} · ${count} days`;
}
