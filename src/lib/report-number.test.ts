import { describe, expect, it } from "vitest";
import { parseReportInteger, parseReportNumber } from "./report-number.ts";

describe("ocular report number parsing", () => {
    it("accepts formatted amounts", () => {
        expect(parseReportNumber("10,000")).toBe(10000);
        expect(parseReportNumber(" 2.5 ")).toBe(2.5);
    });

    it("keeps blank optional fields empty", () => {
        expect(parseReportNumber("   ")).toBeUndefined();
    });

    it("rejects malformed nonblank values instead of clearing them", () => {
        expect(() => parseReportNumber("10,00", "Monthly bill")).toThrow("Monthly bill");
        expect(() => parseReportInteger("2.5")).toThrow();
    });
});
