/** Blank means unrecorded; malformed nonblank input must never erase a value. */
export function parseReportNumber(value: string, label = "Number"): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    if (!/^[+-]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
        throw new Error(`${label}: enter a valid number, such as 10000 or 10,000.`);
    }
    const parsed = Number(trimmed.replaceAll(",", ""));
    if (!Number.isFinite(parsed)) throw new Error(`${label}: enter a finite number.`);
    return parsed;
}

export function parseReportInteger(value: string, label = "Count"): number | undefined {
    const parsed = parseReportNumber(value, label);
    if (parsed !== undefined && (!Number.isSafeInteger(parsed) || parsed < 0)) {
        throw new Error(`${label}: enter a non-negative whole number.`);
    }
    return parsed;
}
