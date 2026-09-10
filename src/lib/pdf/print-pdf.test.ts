import { describe, expect, it } from "vitest";

import { leadDocumentName } from "./print-pdf.ts";

describe("leadDocumentName", () => {
    it("names a document after the lead and what it is", () => {
        expect(leadDocumentName("John", "Dela Cruz", "Quotation")).toBe(
            "John Dela Cruz - Quotation",
        );
        expect(leadDocumentName("John", "Dela Cruz", "Contract")).toBe(
            "John Dela Cruz - Contract",
        );
        expect(leadDocumentName("John", "Dela Cruz", "Ocular Inspection Report")).toBe(
            "John Dela Cruz - Ocular Inspection Report",
        );
    });

    it("keeps the spaces and the separating hyphen", () => {
        // The obvious sanitising mistake is a character class wide enough to
        // eat these, which silently turns the name into "JohnDelaCruzQuotation".
        const name = leadDocumentName("John", "Dela Cruz", "Quotation");
        expect(name).toContain(" - ");
        expect(name.split(" ")).toHaveLength(5);
    });

    it("drops characters Windows won't accept in a filename", () => {
        expect(leadDocumentName('Jo/hn:*?"<>|\\', "Cruz", "Quotation")).toBe(
            "John Cruz - Quotation",
        );
    });

    it("collapses stray whitespace rather than doubling it", () => {
        expect(leadDocumentName("  John  ", "  Cruz ", "Contract")).toBe(
            "John Cruz - Contract",
        );
    });

    it("falls back to the document kind when there is no name", () => {
        expect(leadDocumentName("", "", "Contract")).toBe("Contract");
        expect(leadDocumentName(undefined, undefined, "Quotation")).toBe("Quotation");
    });
});
