import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
    addDays,
    addMonths,
    addWeeks,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameDay,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
    subWeeks,
} from "date-fns";
import { ChevronLeft, ChevronRight, ClipboardCheck, MapPin, Wrench } from "lucide-react";

import { useCalendarEvents } from "@/lib/supabase/hooks.ts";
import type { CalendarEvent } from "@/lib/supabase/queries/calendar.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    ToggleGroup, ToggleGroupItem,
} from "@/components/ui/toggle-group.tsx";
import {
    Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

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

    const { data: events, isLoading } = useCalendarEvents({
        from: format(rangeStart, "yyyy-MM-dd"),
        to: format(rangeEnd, "yyyy-MM-dd"),
    });

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        for (const event of events ?? []) {
            // `at` is a date-only string for installations and a full
            // timestamp for inspections — both parse fine as local dates once
            // sliced to the day, avoiding a UTC-vs-local off-by-one.
            const key = event.at.slice(0, 10);
            const list = map.get(key) ?? [];
            list.push(event);
            map.set(key, list);
        }
        return map;
    }, [events]);

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
        navigate(`/leads/${event.leadId}?tab=${eventTab(event)}`);
    }

    const heading = view === "month"
        ? format(anchor, "MMMM yyyy")
        : `${format(rangeStart, "MMM d")} – ${format(rangeEnd, "MMM d, yyyy")}`;

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
                        <Button size="icon" variant="ghost" className="size-9" onClick={goPrev} aria-label="Previous">
                            <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-9" onClick={goNext} aria-label="Next">
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
                <Skeleton className="h-[60vh] w-full rounded-lg" />
            ) : view === "month" ? (
                <MonthGrid days={days} anchor={anchor} eventsByDay={eventsByDay} onOpen={openEvent} />
            ) : (
                <WeekGrid days={days} eventsByDay={eventsByDay} onOpen={openEvent} />
            )}
        </div>
    );
}

function EventPill({ event, onOpen }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(event); }}
            className={cn(
                "w-full text-left rounded-md border px-1.5 py-1 text-[11px] font-medium leading-tight truncate transition-opacity hover:opacity-80",
                KIND_STYLES[event.kind],
            )}
            title={`${event.leadName} — ${KIND_LABELS[event.kind]}`}
        >
            {!event.allDay && <span className="tabular-nums mr-1">{format(new Date(event.at), "h:mma").toLowerCase()}</span>}
            {event.leadName}
        </button>
    );
}

function MonthGrid({
    days,
    anchor,
    eventsByDay,
    onOpen,
}: {
    days: Date[];
    anchor: Date;
    eventsByDay: Map<string, CalendarEvent[]>;
    onOpen: (e: CalendarEvent) => void;
}) {
    const MAX_VISIBLE = 3;
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
                <div className="grid grid-cols-7">
                    {days.map((day) => {
                        const key = format(day, "yyyy-MM-dd");
                        const dayEvents = eventsByDay.get(key) ?? [];
                        const visible = dayEvents.slice(0, MAX_VISIBLE);
                        const overflow = dayEvents.length - visible.length;
                        return (
                            <div
                                key={key}
                                className={cn(
                                    "min-h-[7rem] border-b border-r border-border p-1.5 space-y-1",
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
                                <div className="space-y-1">
                                    {visible.map((event) => (
                                        <EventPill key={`${event.kind}-${event.id}`} event={event} onOpen={onOpen} />
                                    ))}
                                </div>
                                {overflow > 0 && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className="text-[11px] text-muted-foreground hover:text-foreground font-medium"
                                            >
                                                +{overflow} more
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-64 p-2 space-y-1" align="start">
                                            <p className="text-xs font-semibold text-muted-foreground px-1 pb-1">
                                                {format(day, "MMMM d, yyyy")}
                                            </p>
                                            {dayEvents.map((event) => (
                                                <EventPill key={`${event.kind}-${event.id}`} event={event} onOpen={onOpen} />
                                            ))}
                                        </PopoverContent>
                                    </Popover>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function WeekGrid({
    days,
    eventsByDay,
    onOpen,
}: {
    days: Date[];
    eventsByDay: Map<string, CalendarEvent[]>;
    onOpen: (e: CalendarEvent) => void;
}) {
    return (
        <div className="space-y-3">
            {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const dayEvents = eventsByDay.get(key) ?? [];
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
                                {dayEvents.length} {dayEvents.length === 1 ? "job" : "jobs"}
                            </span>
                        </div>
                        {dayEvents.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-muted-foreground">Nothing scheduled</p>
                        ) : (
                            <div className="divide-y">
                                {dayEvents.map((event) => (
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
