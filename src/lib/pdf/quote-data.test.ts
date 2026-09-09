import { describe, expect, it } from "vitest";

import type { Lead, Property, QuoteWithItems } from "@/lib/supabase/types.ts";
import { buildQuotePdfData, formatPhp, quotePdfFileName } from "./quote-data.ts";

describe("quote-data", () => {
    const mockLead: Lead = {
        _id: "lead-123",
        _creationTime: 1725408000000,
        firstName: "Ervin",
        lastName: "Pacheco",
        phone: "09171234567",
        email: "ervin@example.com",
        source: "referral",
        stage: "proposal_sent",
        lastActivityAt: "2026-09-04T08:00:00Z",
    };

    const mockProperty: Property = {
        _id: "prop-123",
        _creationTime: 1725408000000,
        leadId: "lead-123",
        address: "123 Solar Way",
        city: "Malabon",
        state: "Metro Manila",
        zip: "1470",
        propertyType: "residential",
    };

    const mockQuote: QuoteWithItems = {
        _id: "quote-123",
        _creationTime: 1725408000000,
        leadId: "lead-123",
        version: 1,
        status: "in_progress",
        quotationNo: "PV System Quotation-294",
        totalPhp: 366500,
        createdBy: "user-1",
        createdByName: "Carlo Abanilla",
        preparerName: "Carlo Fernan P. Abanilla",
        items: [
            {
                _id: "item-1",
                _creationTime: 1725408000000,
                quoteId: "quote-123",
                description: "PV System Installation - 6kWp Hybrid Package",
                qty: 1,
                unit: "set",
                unitPricePhp: 366500,
                lineTotalPhp: 366500,
                sortOrder: 0,
            },
        ],
    };

    it("formats PHP currency amounts consistently", () => {
        expect(formatPhp(366500)).toBe("PHP 366,500.00");
        expect(formatPhp(0)).toBe("PHP 0.00");
        expect(formatPhp(12345.67)).toBe("PHP 12,345.67");
    });

    it("generates a clean sanitised PDF download filename", () => {
        const filename = quotePdfFileName(mockQuote, mockLead);
        expect(filename).toBe("PV-System-Quotation-294-Ervin-Pacheco.pdf");
    });

    it("builds flat quote PDF data matching document layout", async () => {
        const data = await buildQuotePdfData(mockQuote, mockLead, mockProperty);

        expect(data.quotationNo).toBe("PV System Quotation-294");
        expect(data.customerName).toBe("Ervin Pacheco");
        expect(data.customerAddress).toContain("123 Solar Way, Malabon");
        expect(data.preparerName).toBe("Carlo Fernan P. Abanilla");
        expect(data.items).toHaveLength(1);
        expect(data.items[0].description).toBe(
            "PV System Installation - 6kWp Hybrid Package",
        );
        expect(data.items[0].qtyStr).toBe("1 set");
        expect(data.items[0].priceStr).toBe("PHP 366,500.00");
        expect(data.items[0].totalStr).toBe("PHP 366,500.00");
        expect(data.grandTotalStr).toBe("PHP 366,500.00");
    });
});
