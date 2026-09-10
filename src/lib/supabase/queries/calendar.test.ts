import { describe, expect, it } from "vitest";

import { daysBetween } from "./calendar.ts";

describe("daysBetween", () => {
    it("returns the single day when a job starts and ends on the same date", () => {
        expect(daysBetween("2026-09-14", "2026-09-14")).toEqual(["2026-09-14"]);
    });

    it("includes both ends of a run", () => {
        expect(daysBetween("2026-09-14", "2026-09-17")).toEqual([
            "2026-09-14",
            "2026-09-15",
            "2026-09-16",
            "2026-09-17",
        ]);
    });

    it("crosses a month boundary", () => {
        expect(daysBetween("2026-09-29", "2026-10-02")).toEqual([
            "2026-09-29",
            "2026-09-30",
            "2026-10-01",
            "2026-10-02",
        ]);
    });

    it("counts a leap day", () => {
        expect(daysBetween("2028-02-27", "2028-03-01")).toEqual([
            "2028-02-27",
            "2028-02-28",
            "2028-02-29",
            "2028-03-01",
        ]);
    });

    it("neither skips nor repeats a day across a DST transition", () => {
        // These are plain dates. Stepping them through a local-time Date in a
        // DST-observing zone is how a range loses or doubles a day; stepping in
        // UTC is why this holds regardless of the machine's timezone.
        const spring = daysBetween("2026-03-07", "2026-03-10");
        expect(spring).toEqual(["2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);

        const autumn = daysBetween("2026-10-31", "2026-11-03");
        expect(autumn).toEqual(["2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03"]);
    });

    it("yields nothing for a backwards range instead of looping forever", () => {
        // The CHECK constraint makes this unreachable from the database, but a
        // runaway loop is a far worse failure than an empty list.
        expect(daysBetween("2026-09-17", "2026-09-14")).toEqual([]);
    });

    it("gives up safely on an unparseable date", () => {
        expect(daysBetween("not-a-date", "2026-09-14")).toEqual(["not-a-date"]);
    });
});
