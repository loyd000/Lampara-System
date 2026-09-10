import { phpAmountToWords } from "./number-to-words.ts";

/**
 * The contract's print-ready strings.
 *
 * Every field is a formatted string, not a raw value: the PDF component's job
 * is layout, and keeping the number/date formatting here is what lets it be
 * unit-tested without rendering a document.
 */
export type ContractPdfData = {
    homeownerName: string;
    siteAddress: string;
    phoneNumber: string;
    systemSizeKw: string;
    panelLine: string;
    inverterLine: string;
    batteryLine: string;
    priceWords: string;
    priceFigures: string;
    preparedByName: string;
    contractDate: string;
};

/** The editable contract fields, as held by the Contract Details form. */
export type ContractDetailsInput = {
    homeownerName: string;
    siteAddress: string;
    phoneNumber: string;
    systemSizeKw: number | null;
    panelLine: string;
    inverterLine: string;
    batteryLine: string;
    pricePhp: number | null;
    preparedByName: string;
    contractDate: string; // yyyy-mm-dd, or "" for today
};

/**
 * Bare number, no currency mark: clause 2 prints the figure next to the
 * amount already spelled out in words, and prefixes it with "PHP" in the
 * document itself — the ₱ glyph isn't guaranteed in Helvetica's built-in
 * encoding, so it must never reach the renderer.
 */
function formatContractPhp(amount: number): string {
    return amount.toLocaleString("en-US", {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

export function buildContractPdfData(details: ContractDetailsInput): ContractPdfData {
    const price = details.pricePhp ?? 0;
    const date = details.contractDate
        ? new Date(`${details.contractDate}T00:00:00`)
        : new Date();

    return {
        homeownerName: details.homeownerName,
        siteAddress: details.siteAddress,
        phoneNumber: details.phoneNumber,
        systemSizeKw: details.systemSizeKw != null ? details.systemSizeKw.toFixed(2) : "",
        panelLine: details.panelLine,
        inverterLine: details.inverterLine,
        batteryLine: details.batteryLine,
        priceWords: phpAmountToWords(price),
        priceFigures: formatContractPhp(price),
        preparedByName: details.preparedByName,
        contractDate: date
            .toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
            .toUpperCase(),
    };
}
