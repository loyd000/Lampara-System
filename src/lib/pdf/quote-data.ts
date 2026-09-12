import type { Lead, Property, QuoteWithItems, SurveyForLead } from "@/lib/supabase/types.ts";

export type QuotePdfPhoto = {
    src: string;
    caption?: string;
};

export type QuotePdfData = {
    // Header & Meta
    quotationNo: string;
    date: string;
    preparerName: string;

    // Client
    customerName: string;
    customerPhone: string;
    customerEmail?: string;
    customerAddress?: string;

    // Items
    items: Array<{
        num: number;
        description: string;
        qtyStr: string;
        priceStr: string;
        totalStr: string;
    }>;
    grandTotalStr: string;
    notes?: string;

    // Ocular Photos (if available)
    inverterBatteryPhoto?: QuotePdfPhoto;
    roofPanelPhoto?: QuotePdfPhoto;
};

async function toDataUri(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () =>
                resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

export function formatPhp(amount: number): string {
    return (
        "PHP " +
        amount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}

export async function buildQuotePdfData(
    quote: QuoteWithItems,
    lead: Lead,
    property?: Property,
    surveys?: SurveyForLead[],
): Promise<QuotePdfData> {
    const customerName = `${lead.firstName} ${lead.lastName}`.trim();
    const customerAddress = property
        ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`.trim()
        : undefined;

    // Always the quote's real issue date — never "today", or re-downloading
    // the same quote later would silently print a different date each time.
    const quoteDate = new Date(quote._creationTime);
    const dateFormatted = quoteDate.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const items = (quote.items || []).map((item, idx) => ({
        num: idx + 1,
        description: item.description,
        qtyStr: `${item.qty} ${item.unit}`.trim(),
        // A package's included components are listed for what they are, not
        // what they cost — the package's own line carries the real price.
        // Printing "₱0.00" next to each one reads as "these are free," which
        // is exactly the confusion blanking the cell avoids. `!== 0`, not
        // `> 0`: a genuine negative-discount line is a real price too, and
        // blanking it would make the printed items stop visibly summing to
        // the grand total.
        priceStr: item.unitPricePhp !== 0 ? formatPhp(item.unitPricePhp) : "",
        totalStr: item.unitPricePhp !== 0 ? formatPhp(item.lineTotalPhp) : "",
    }));

    const grandTotal = (quote.items || []).reduce(
        (sum, item) => sum + item.lineTotalPhp,
        0,
    );
    const grandTotalStr = formatPhp(grandTotal > 0 ? grandTotal : quote.totalPhp);

    // Pull ocular inspection photos if available
    let inverterBatteryPhoto: QuotePdfPhoto | undefined;
    let roofPanelPhoto: QuotePdfPhoto | undefined;

    if (surveys && surveys.length > 0) {
        // Pick latest non-cancelled survey
        const activeSurvey = surveys.find((s) => s.status !== "cancelled") ?? surveys[0];
        if (activeSurvey && activeSurvey.photos) {
            const invPhoto = activeSurvey.photos.find(
                (p) => p.category === "inverter_battery" && p.url,
            );
            if (invPhoto && invPhoto.url) {
                const uri = await toDataUri(invPhoto.url);
                if (uri) {
                    inverterBatteryPhoto = {
                        src: uri,
                        caption: invPhoto.caption || "Proposed Inverter & Battery location",
                    };
                }
            }

            const roofPhoto = activeSurvey.photos.find(
                (p) => p.category === "roof_panel_design" && p.url,
            );
            if (roofPhoto && roofPhoto.url) {
                const uri = await toDataUri(roofPhoto.url);
                if (uri) {
                    roofPanelPhoto = {
                        src: uri,
                        caption: roofPhoto.caption || "Proposed Roof Panel Layout",
                    };
                }
            }
        }
    }

    return {
        quotationNo: quote.quotationNo || `PV System Quotation-${quote.version}`,
        date: dateFormatted,
        preparerName: quote.preparerName || quote.createdByName || "Lampara Sales",
        customerName,
        customerPhone: lead.phone,
        customerEmail: lead.email,
        customerAddress,
        items,
        grandTotalStr,
        notes: quote.notes,
        inverterBatteryPhoto,
        roofPanelPhoto,
    };
}
