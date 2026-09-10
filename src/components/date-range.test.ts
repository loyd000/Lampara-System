import { describe, expect, it } from "vitest";

import { describeRange, ordered } from "./date-range.ts";

describe("ordered", () => {
    it("leaves an already-ordered pair alone", () => {
        expect(ordered("2026-09-14", "2026-09-17")).toEqual({
            start: "2026-09-14",
            end: "2026-09-17",
        });
    });

    it("swaps a pair dragged backwards", () => {
        // Dragging right-to-left is the whole reason this exists.
        expect(ordered("2026-09-17", "2026-09-14")).toEqual({
            start: "2026-09-14",
            end: "2026-09-17",
        });
    });

    it("handles a single day", () => {
        expect(ordered("2026-09-14", "2026-09-14")).toEqual({
            start: "2026-09-14",
            end: "2026-09-14",
        });
    });

    it("orders across a month and a year boundary", () => {
        expect(ordered("2027-01-02", "2026-12-30")).toEqual({
            start: "2026-12-30",
            end: "2027-01-02",
        });
    });
});

describe("describeRange", () => {
    it("counts a single day as one", () => {
        expect(describeRange({ start: "2026-09-14", end: "2026-09-14" })).toBe(
            "Mon, Sep 14 · 1 day",
        );
    });

    it("counts both ends of a run", () => {
        expect(describeRange({ start: "2026-09-14", end: "2026-09-17" })).toBe(
            "Mon, Sep 14 – Thu, Sep 17 · 4 days",
        );
    });

    it("counts correctly across a DST transition", () => {
        // The count divides by a fixed 86,400,000ms. Parsing these as local
        // midnights means a DST week is 23 or 25 hours short/long, which is why
        // the result is rounded rather than floored.
        const spring = describeRange({ start: "2026-03-07", end: "2026-03-10" });
        expect(spring.endsWith("· 4 days")).toBe(true);
        const autumn = describeRange({ start: "2026-10-31", end: "2026-11-03" });
        expect(autumn.endsWith("· 4 days")).toBe(true);
    });

    it("says so when nothing is picked yet", () => {
        expect(describeRange({ start: "", end: "" })).toBe("No dates selected");
    });
});
