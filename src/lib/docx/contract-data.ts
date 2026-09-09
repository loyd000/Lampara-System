import { phpAmountToWords } from "./number-to-words.ts";

export type ContractDocxData = {
    homeowner_name: string;
    site_address: string;
    phone_number: string;
    system_size_kw: string;
    panel_line: string;
    inverter_line: string;
    battery_line: string;
    price_words: string;
    price_figures: string;
    prepared_by_name: string;
    contract_date: string;
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

function formatPhp(amount: number): string {
    return amount.toLocaleString("en-US", {
        minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    });
}

export function buildContractDocxData(details: ContractDetailsInput): ContractDocxData {
    const price = details.pricePhp ?? 0;
    const date = details.contractDate ? new Date(`${details.contractDate}T00:00:00`) : new Date();

    return {
        homeowner_name: details.homeownerName,
        site_address: details.siteAddress,
        phone_number: details.phoneNumber,
        system_size_kw: details.systemSizeKw != null ? details.systemSizeKw.toFixed(2) : "",
        panel_line: details.panelLine,
        inverter_line: details.inverterLine,
        battery_line: details.batteryLine,
        price_words: phpAmountToWords(price),
        price_figures: formatPhp(price),
        prepared_by_name: details.preparedByName,
        contract_date: date
            .toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })
            .toUpperCase(),
    };
}

export function contractDocxFileName(firstName: string, lastName: string): string {
    const name = `${firstName}-${lastName}`.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
    return `Contract-${name}.docx`;
}
