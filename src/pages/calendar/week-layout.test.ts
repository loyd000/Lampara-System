import { describe, expect, it } from "vitest";

import { layOutWeek, type Spanning } from "./week-layout.ts";

/** Sun 13 Sep 2026 – Sat 19 Sep 2026. */
const WEEK = [
    "2026-09-13",
    "2026-09-14",
    "2026-09-15",
    "2026-09-16",
    "2026-09-17",
    "2026-09-18",
    "2026-09-19",
];

const ev = (startDate: string, endDate: string, name = "x"): Spanning & { name: string } => ({
    startDate,
    endDate,
    name,
});

describe("layOutWeek", () => {
    it("gives a one-day event a single column", () => {
        const { segments, laneCount } = layOutWeek(WEEK, [ev("2026-09-15", "2026-09-15")]);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({
            startCol: 2,
            span: 1,
            lane: 0,
            continuesLeft: false,
            continuesRight: false,
        });
        expect(laneCount).toBe(1);
    });

    it("draws a multi-day run as one segment, not one per day", () => {
        // This is the whole point: four days is one bar spanning four columns.
        const { segments } = layOutWeek(WEEK, [ev("2026-09-14", "2026-09-17")]);
        expect(segments).toHaveLength(1);
        expect(segments[0]).toMatchObject({ startCol: 1, span: 4 });
    });

    it("clips a run that began before the week and flags it", () => {
        const { segments } = layOutWeek(WEEK, [ev("2026-09-10", "2026-09-15")]);
        expect(segments[0]).toMatchObject({
            startCol: 0,
            span: 3,
            continuesLeft: true,
            continuesRight: false,
        });
    });

    it("clips a run that ends after the week and flags it", () => {
        const { segments } = layOutWeek(WEEK, [ev("2026-09-18", "2026-09-24")]);
        expect(segments[0]).toMatchObject({
            startCol: 5,
            span: 2,
            continuesLeft: false,
            continuesRight: true,
        });
    });

    it("flags both ends when a run swallows the whole week", () => {
        const { segments } = layOutWeek(WEEK, [ev("2026-09-01", "2026-09-30")]);
        expect(segments[0]).toMatchObject({
            startCol: 0,
            span: 7,
            continuesLeft: true,
            continuesRight: true,
        });
    });

    it("stacks overlapping events into separate lanes", () => {
        const { segments, laneCount } = layOutWeek(WEEK, [
            ev("2026-09-14", "2026-09-17", "long"),
            ev("2026-09-15", "2026-09-16", "short"),
        ]);
        expect(segments.map((s) => s.lane)).toEqual([0, 1]);
        expect(laneCount).toBe(2);
    });

    it("reuses a lane for events that do not overlap", () => {
        // Mon–Tue and Thu–Fri never share a column, so they belong on one row.
        const { segments, laneCount } = layOutWeek(WEEK, [
            ev("2026-09-14", "2026-09-15", "early"),
            ev("2026-09-17", "2026-09-18", "late"),
        ]);
        expect(segments.map((s) => s.lane)).toEqual([0, 0]);
        expect(laneCount).toBe(1);
    });

    it("treats touching-but-not-overlapping runs as overlapping when they share a day", () => {
        const { laneCount } = layOutWeek(WEEK, [
            ev("2026-09-14", "2026-09-16", "a"),
            ev("2026-09-16", "2026-09-18", "b"),
        ]);
        expect(laneCount).toBe(2);
    });

    it("ignores events outside the week entirely", () => {
        const { segments, laneCount } = layOutWeek(WEEK, [
            ev("2026-08-01", "2026-08-05"),
            ev("2026-10-01", "2026-10-05"),
        ]);
        expect(segments).toEqual([]);
        expect(laneCount).toBe(0);
    });

    it("skips a backwards range rather than computing a negative span", () => {
        const { segments } = layOutWeek(WEEK, [ev("2026-09-17", "2026-09-14")]);
        expect(segments).toEqual([]);
    });

    it("returns nothing for an empty week", () => {
        expect(layOutWeek([], [ev("2026-09-14", "2026-09-15")])).toEqual({
            segments: [],
            laneCount: 0,
        });
    });

    it("never lets two segments in one lane share a column", () => {
        const events = [
            ev("2026-09-13", "2026-09-19", "week"),
            ev("2026-09-14", "2026-09-15", "a"),
            ev("2026-09-15", "2026-09-17", "b"),
            ev("2026-09-16", "2026-09-16", "c"),
            ev("2026-09-18", "2026-09-19", "d"),
        ];
        const { segments } = layOutWeek(WEEK, events);

        const occupied = new Map<string, number>();
        for (const s of segments) {
            for (let c = s.startCol; c < s.startCol + s.span; c += 1) {
                const cell = `${s.lane}:${c}`;
                occupied.set(cell, (occupied.get(cell) ?? 0) + 1);
            }
        }
        expect([...occupied.values()].every((n) => n === 1)).toBe(true);
        expect(segments).toHaveLength(events.length);
    });
});
