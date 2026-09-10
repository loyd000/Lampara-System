/**
 * Placing a week's events into lanes, so a multi-day job draws as one
 * continuous bar instead of a separate chip inside each day cell.
 *
 * Split out of the page so it can be tested without rendering a calendar.
 */

/** The minimum an event needs for layout; the real CalendarEvent has more. */
export type Spanning = {
    /** Inclusive yyyy-mm-dd. */
    startDate: string;
    endDate: string;
};

/**
 * One event's run across a single week row: which column it starts in, how many
 * columns it covers, and whether it was cut off by the edge of the row.
 */
export type Segment<T extends Spanning> = {
    event: T;
    startCol: number;
    span: number;
    lane: number;
    continuesLeft: boolean;
    continuesRight: boolean;
};

/**
 * Packs `events` into the fewest lanes in which none overlap.
 *
 * Events are taken in the order given — the query sorts them longest-first
 * within a start date, so the longest run claims the top lane and shorter jobs
 * settle beneath it. Feeding them in some other order still produces a correct
 * layout, just a jumpier-looking one.
 *
 * A run extending past either end of the week is clipped to the row and
 * flagged, so the bar can be drawn square-ended and show it continues rather
 * than reading as two unrelated jobs.
 *
 * `weekDays` is the row's seven yyyy-mm-dd keys, in order.
 */
export function layOutWeek<T extends Spanning>(
    weekDays: string[],
    events: readonly T[],
): { segments: Segment<T>[]; laneCount: number } {
    if (weekDays.length === 0) return { segments: [], laneCount: 0 };

    const first = weekDays[0];
    const last = weekDays[weekDays.length - 1];
    const columnOf = new Map(weekDays.map((day, i) => [day, i]));

    const lanes: boolean[][] = [];
    const segments: Segment<T>[] = [];

    for (const event of events) {
        // A backwards range would compute a negative span and corrupt the row.
        if (event.endDate < event.startDate) continue;
        if (event.endDate < first || event.startDate > last) continue;

        const clippedStart = event.startDate < first ? first : event.startDate;
        const clippedEnd = event.endDate > last ? last : event.endDate;
        const startCol = columnOf.get(clippedStart);
        const endCol = columnOf.get(clippedEnd);
        // A date inside the row's range but not one of its keys means the week
        // isn't seven contiguous days; skip rather than guess a column.
        if (startCol === undefined || endCol === undefined) continue;

        let lane = 0;
        for (;;) {
            if (!lanes[lane]) lanes[lane] = new Array<boolean>(weekDays.length).fill(false);
            const free = lanes[lane].slice(startCol, endCol + 1).every((taken) => !taken);
            if (free) {
                for (let c = startCol; c <= endCol; c += 1) lanes[lane][c] = true;
                break;
            }
            lane += 1;
        }

        segments.push({
            event,
            startCol,
            span: endCol - startCol + 1,
            lane,
            continuesLeft: event.startDate < clippedStart,
            continuesRight: event.endDate > clippedEnd,
        });
    }

    return { segments, laneCount: lanes.length };
}
