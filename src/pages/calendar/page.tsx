import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, ClipboardCheck, MapPin, Wrench } from "lucide-react";

import { useCalendarEvents } from "@/lib/supabase/hooks.ts";
import { daysBetween, type CalendarEvent } from "@/lib/supabase/queries/calendar.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";
import {
    ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group.tsx";
import { cn } from "@/lib/utils.ts";
import { layOutWeek, type Segment } from "./week-layout.ts";

type ViewMode = "month" | "week";

const KIND_STYLES: Record<CalendarEvent["kind"], string> = {
    inspection: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800/50",
    installation: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 border-teal-200 dark:border-teal-800/50",
};

const KIND_LABELS: Record<CalendarEvent["kind"], string> = {
    inspection: "Inspection",
    installation: "Installation",
};

function eventTab(event: CalendarEvent): string {
    return event.kind === "inspection" ? "ocular" : "installation";
}

function dayKey(day: Date): string {
    return format(day, "yyyy-MM-dd");
}

function spanLabel(event: CalendarEvent): string {
    const days = daysBetween(event.startDate, event.endDate).length;
    return days > 1 ? ` (${days} days)` : "";
}

export default function CalendarPage() {
    const navigate = useNavigate();
    const [anchor, setAnchor] = useState(() => new Date());
    const [view, setView] = useState<ViewMode>(() =>
        typeof window !== "undefined" && window.innerWidth < 640 ? "week" : "month",
    );

    // Month view fills full weeks (so the grid never shows a partial row);
    // week view is just the seven days around the anchor.
    const rangeStart = view === "month"
        ? startOfWeek(startOfMonth(anchor))
        : startOfWeek(anchor);
    const rangeEnd = view === "month"
        ? endOfWeek(endOfMonth(anchor))
        : endOfWeek(anchor);

    const days = useMemo(
        () => eachDayOfInterval({ start: rangeStart, end: rangeEnd }),
        [rangeStart, rangeEnd],
    );

    const { data: events, isLoading, isError, refetch } = useCalendarEvents({
        from: format(rangeStart, "yyyy-MM-dd"),
        to: format(rangeEnd, "yyyy-MM-dd"),
    });

    function goToday() {
        setAnchor(new Date());
    }
    function goPrev() {
        setAnchor((d) => (view === "month" ? subMonths(d, 1) : subWeeks(d, 1)));
    }
    function goNext() {
        setAnchor((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)));
    }

    function openEvent(event: CalendarEvent) {
        navigate(`/projects/${event.leadId}?tab=${eventTab(event)}`);
    }

    const heading = view === "month"
        ? format(anchor, "MMMM yyyy")
        : `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`;

    if (isError) {
        return <QueryError title="Couldn't load the calendar" onRetry={() => void refetch()} />;
    }

    return (
        <div className="p-4 sm:p-6 space-y-4 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">Calendar</h1>
                    <p className="text-sm text-muted-foreground mt-1.5">
                        Inspections and installations, in one schedule
                    </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <ToggleGroup
                        type="single"
                        value={view}
                        onValueChange={(v) => v && setView(v as ViewMode)}
                        variant="outline"
                        size="sm"
                    >
                        <ToggleGroupItem value="week" className="text-xs px-3">Week</ToggleGroupItem>
                        <ToggleGroupItem value="month" className="text-xs px-3">Month</ToggleGroupItem>
                    </ToggleGroup>
                    <Button size="sm" variant="outline" onClick={goToday}>Today</Button>
                    <div className="flex items-center gap-1">
                        <Button size="icon-sm" variant="ghost" onClick={goPrev} aria-label="Previous">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button size="icon-sm" variant="ghost" onClick={goNext} aria-label="Next">
                            <ChevronRight className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-foreground">{heading}</h2>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-blue-500" />Inspection
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-teal-500" />Installation
                    </span>
                </div>
            </div>

            {/* Grid */}
            {isLoading ? (
                <Skeleton className="h-[60vh] w-full rounded-xl" />
            ) : view === "month" ? (
                <MonthGrid days={days} anchor={anchor} events={events ?? []} onOpen={openEvent} />
            ) : (
                <WeekList days={days} events={events ?? []} onOpen={openEvent} />
            )}
        </div>
    );
}

/** The bar itself — one per run of days, not one per day. */
function EventBar({
    segment,
    onOpen,
}: {
    segment: Segment<CalendarEvent>;
    onOpen: (e: CalendarEvent) => void;
}) {
    const { event, continuesLeft, continuesRight } = segment;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(event); }}
            className={cn(
                "w-full h-full flex items-center gap-1 border px-1.5 text-[11px] font-medium leading-none truncate transition-opacity hover:opacity-80",
                // Square off whichever end runs into the next week, so the bar
                // reads as continuing rather than as two separate jobs.
                continuesLeft ? "rounded-l-none border-l-0" : "rounded-l-md",
                continuesRight ? "rounded-r-none border-r-0" : "rounded-r-md",
                KIND_STYLES[event.kind],
            )}
            title={
                [
                    `${event.leadName} — ${KIND_LABELS[event.kind]}${spanLabel(event)}`,
                    event.address,
                ]
                    .filter(Boolean)
                    .join("\n")
            }
        >
            {continuesLeft && <span aria-hidden className="opacity-60 shrink-0">◀</span>}
            {!event.allDay && (
                <span className="tabular-nums shrink-0">
                    {format(new Date(event.at), "h:mma").toLowerCase()}
                </span>
            )}
            <span className="truncate">
                {event.leadName}
                {event.address && (
                    <span className="font-normal opacity-70"> · {event.address}</span>
                )}
            </span>
            {continuesRight && <span aria-hidden className="opacity-60 shrink-0 ml-auto">▶</span>}
        </button>
    );
}

const LANE_HEIGHT = 22; // px per stacked bar, including its gap
/**
 * Space reserved above the bars for the day number.
 *
 * The number is a 20px badge under 6px of cell padding, so it ends at 26px;
 * starting the bars there left them touching it. This is that plus a gap.
 */
const DATE_ROW_HEIGHT = 34;

function MonthGrid({
    days,
    anchor,
    events,
    onOpen,
}: {
    days: Date[];
    anchor: Date;
    events: CalendarEvent[];
    onOpen: (e: CalendarEvent) => void;
}) {
    const weeks = useMemo(() => {
        const out: Date[][] = [];
        for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
        return out;
    }, [days]);

    return (
        <div className="bg-card rounded-xl shadow-sm overflow-x-auto">
            <div className="min-w-[640px]">
                <div className="grid grid-cols-7 border-b border-border">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                        <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center">
                            {d}
                        </div>
                    ))}
                </div>

                {weeks.map((week) => {
                    const { segments, laneCount } = layOutWeek(week.map(dayKey), events);
                    const rowHeight = Math.max(
                        112,
                        DATE_ROW_HEIGHT + laneCount * LANE_HEIGHT + 8,
                    );

                    return (
                        <div key={dayKey(week[0])} className="relative" style={{ minHeight: rowHeight }}>
                            {/* The day cells are the backdrop: they draw the
                                borders and the date numbers only. */}
                            <div className="absolute inset-0 grid grid-cols-7">
                                {week.map((day) => (
                                    <div
                                        key={dayKey(day)}
                                        className={cn(
                                            "border-b border-r border-border p-1.5",
                                            !isSameMonth(day, anchor) && "bg-muted/40",
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                "inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold",
                                                isToday(day)
                                                    ? "bg-primary text-primary-foreground"
                                                    : !isSameMonth(day, anchor)
                                                      ? "text-muted-foreground/50"
                                                      : "text-foreground",
                                            )}
                                        >
                                            {format(day, "d")}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            {/* Bars sit in their own grid on top, so one can
                                span several columns instead of being chopped
                                up into a chip inside each day cell. */}
                            <div
                                className="absolute inset-x-0 grid grid-cols-7"
                                style={{ top: DATE_ROW_HEIGHT }}
                            >
                                {segments.map((segment) => (
                                    <div
                                        key={`${segment.event.kind}-${segment.event.id}`}
                                        className="px-1"
                                        style={{
                                            gridColumn: `${segment.startCol + 1} / span ${segment.span}`,
                                            gridRow: segment.lane + 1,
                                            height: LANE_HEIGHT - 4,
                                            marginBottom: 4,
                                        }}
                                    >
                                        <EventBar segment={segment} onOpen={onOpen} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/**
 * The narrow view: a card per day. Here a multi-day job *should* repeat, since
 * each day is its own agenda and the crew is on site on all of them — so it is
 * expanded per day and told which day of the run this is.
 */
function WeekList({
    days,
    events,
    onOpen,
}: {
    days: Date[];
    events: CalendarEvent[];
    onOpen: (e: CalendarEvent) => void;
}) {
    const byDay = useMemo(() => {
        const map = new Map<string, { event: CalendarEvent; dayIndex: number; dayCount: number }[]>();
        for (const event of events) {
            const span = daysBetween(event.startDate, event.endDate);
            span.forEach((day, i) => {
                const list = map.get(day) ?? [];
                list.push({ event, dayIndex: i + 1, dayCount: span.length });
                map.set(day, list);
            });
        }
        return map;
    }, [events]);

    return (
        <div className="space-y-3">
            {days.map((day) => {
                const key = dayKey(day);
                const entries = byDay.get(key) ?? [];
                return (
                    <div key={key} className="bg-card rounded-xl shadow-sm overflow-hidden">
                        <div
                            className={cn(
                                "flex items-center gap-2 px-3 py-2 border-b border-border",
                                isToday(day) && "bg-primary/10",
                            )}
                        >
                            <span className="text-sm font-semibold text-foreground">
                                {format(day, "EEEE, MMM d")}
                            </span>
                            {isToday(day) && (
                                <span className="text-[10px] font-semibold text-primary uppercase tracking-wide">
                                    Today
                                </span>
                            )}
                            <span className="text-xs text-muted-foreground ml-auto">
                                {entries.length} {entries.length === 1 ? "job" : "jobs"}
                            </span>
                        </div>
                        {entries.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-muted-foreground">Nothing scheduled</p>
                        ) : (
                            <div className="divide-y">
                                {entries.map(({ event, dayIndex, dayCount }) => (
                                    <button
                                        key={`${event.kind}-${event.id}`}
                                        type="button"
                                        onClick={() => onOpen(event)}
                                        className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
                                    >
                                        <div
                                            className={cn(
                                                "mt-0.5 flex items-center justify-center rounded-md size-7 shrink-0 border",
                                                KIND_STYLES[event.kind],
                                            )}
                                        >
                                            {event.kind === "inspection" ? (
                                                <ClipboardCheck className="size-3.5" />
                                            ) : (
                                                <Wrench className="size-3.5" />
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-foreground truncate">
                                                {event.leadName}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate">
                                                {KIND_LABELS[event.kind]}
                                                {!event.allDay && ` · ${format(new Date(event.at), "h:mm a")}`}
                                                {event.allDay && " · All day"}
                                                {dayCount > 1 && ` · Day ${dayIndex} of ${dayCount}`}
                                                {event.assigneeNames.length > 0 && ` · ${event.assigneeNames.join(", ")}`}
                                            </p>
                                            {event.address && (
                                                <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                                                    <MapPin className="size-3 shrink-0" />
                                                    {event.address}
                                                </p>
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
