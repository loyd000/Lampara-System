const ONES = [
    "", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE",
    "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN",
    "SEVENTEEN", "EIGHTEEN", "NINETEEN",
];

const TENS = [
    "", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY",
];

const SCALES = ["", "THOUSAND", "MILLION", "BILLION"];

function threeDigitsToWords(n: number): string {
    const parts: string[] = [];
    if (n >= 100) {
        parts.push(ONES[Math.floor(n / 100)], "HUNDRED");
        n %= 100;
    }
    if (n >= 20) {
        parts.push(TENS[Math.floor(n / 10)]);
        n %= 10;
        if (n > 0) parts.push(ONES[n]);
    } else if (n > 0) {
        parts.push(ONES[n]);
    }
    return parts.join(" ");
}

function integerToWords(n: number): string {
    if (n === 0) return "ZERO";
    const groups: string[] = [];
    let scale = 0;
    while (n > 0) {
        const chunk = n % 1000;
        if (chunk > 0) {
            groups.unshift(`${threeDigitsToWords(chunk)}${SCALES[scale] ? " " + SCALES[scale] : ""}`);
        }
        n = Math.floor(n / 1000);
        scale += 1;
    }
    return groups.join(" ");
}

/**
 * Spells out a peso amount the way the contract template expects, e.g.
 * `366500` -> "THREE HUNDRED SIXTY SIX THOUSAND FIVE HUNDRED PESOS ONLY",
 * `366500.5` -> "THREE HUNDRED SIXTY SIX THOUSAND FIVE HUNDRED PESOS AND 50/100 ONLY".
 */
export function phpAmountToWords(amount: number): string {
    const rounded = Math.round(Math.abs(amount) * 100) / 100;
    const pesos = Math.floor(rounded);
    const centavos = Math.round((rounded - pesos) * 100);

    const pesosWords = `${integerToWords(pesos)} PESOS`;
    if (centavos === 0) return `${pesosWords} ONLY`;
    return `${pesosWords} AND ${String(centavos).padStart(2, "0")}/100 ONLY`;
}
