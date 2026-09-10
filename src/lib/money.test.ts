import { describe, expect, it } from "vitest";

import { formatPhp, lineTotalPhp, sumLineTotalsPhp } from "./money.ts";

describe("lineTotalPhp", () => {
    it("rounds to centavos", () => {
        // 3 × 10.005 = 30.014999… in binary floating point.
        expect(lineTotalPhp(3, 10.005)).toBe(30.02);
    });

    it("leaves exact amounts alone", () => {
        expect(lineTotalPhp(4, 53750)).toBe(215000);
    });

    it("handles fractional quantities, which `qty numeric(10,2)` allows", () => {
        expect(lineTotalPhp(2.5, 100.4)).toBe(251);
    });
});

describe("sumLineTotalsPhp", () => {
    it("rounds each line before summing, matching what is stored", () => {
        // Each line stores 0.01 (0.005 rounds up), so the total is 0.03 —
        // not the 0.015 you get from summing the raw products first.
        const lines = [
            { qty: 1, unitPricePhp: 0.005 },
            { qty: 1, unitPricePhp: 0.005 },
            { qty: 1, unitPricePhp: 0.005 },
        ];
        expect(sumLineTotalsPhp(lines)).toBe(0.03);
    });

    it("does not accumulate binary floating-point error", () => {
        // 0.1 + 0.2 === 0.30000000000000004 unrounded.
        expect(
            sumLineTotalsPhp([
                { qty: 1, unitPricePhp: 0.1 },
                { qty: 1, unitPricePhp: 0.2 },
            ]),
        ).toBe(0.3);
    });

    it("is zero for no lines", () => {
        expect(sumLineTotalsPhp([])).toBe(0);
    });
});

describe("formatPhp", () => {
    it("always shows two decimal places", () => {
        expect(formatPhp(215000)).toBe("₱215,000.00");
        expect(formatPhp(0)).toBe("₱0.00");
    });
});
