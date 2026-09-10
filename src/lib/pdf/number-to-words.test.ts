import { describe, expect, it } from "vitest";
import { phpAmountToWords } from "./number-to-words.ts";

describe("phpAmountToWords", () => {
    it("matches the contract sample's wording", () => {
        expect(phpAmountToWords(366500)).toBe(
            "THREE HUNDRED SIXTY SIX THOUSAND FIVE HUNDRED PESOS ONLY",
        );
    });

    it("handles zero", () => {
        expect(phpAmountToWords(0)).toBe("ZERO PESOS ONLY");
    });

    it("spells out centavos", () => {
        expect(phpAmountToWords(400000.5)).toBe("FOUR HUNDRED THOUSAND PESOS AND 50/100 ONLY");
    });

    it("handles millions", () => {
        expect(phpAmountToWords(1250000)).toBe(
            "ONE MILLION TWO HUNDRED FIFTY THOUSAND PESOS ONLY",
        );
    });

    it("handles teens and tens correctly", () => {
        expect(phpAmountToWords(19)).toBe("NINETEEN PESOS ONLY");
        expect(phpAmountToWords(21)).toBe("TWENTY ONE PESOS ONLY");
    });
});
