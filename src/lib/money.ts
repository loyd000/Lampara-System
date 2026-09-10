/**
 * Peso arithmetic and formatting.
 *
 * Money lives in `numeric(12,2)` columns, so every figure that reaches the
 * database has exactly two decimal places. The write path has always rounded
 * to match; the quote builder's on-screen subtotal did not, and multiplied
 * `qty * unitPrice` raw. The two could disagree by fractions of a centavo —
 * and the one the customer reads is the screen.
 *
 * These are that arithmetic in one place, so a line total means the same thing
 * in the builder, in the PDF and in the row that gets written.
 */

/** Round to centavos — what `numeric(12,2)` will store either way. */
function toCentavos(amount: number): number {
    return Math.round(amount * 100) / 100;
}

/** One line's total, rounded the way the database stores it. */
export function lineTotalPhp(qty: number, unitPricePhp: number): number {
    return toCentavos(qty * unitPricePhp);
}

/**
 * Sum of line totals — each line rounded *before* summing, then the total
 * rounded again.
 *
 * Order matters: summing raw products and rounding once gives a different
 * answer from rounding each line, and the stored `line_total_php` values are
 * the rounded ones. Rounding per line is what makes the on-screen subtotal
 * equal the sum of the numbers printed above it.
 */
export function sumLineTotalsPhp(
    lines: readonly { qty: number; unitPricePhp: number }[],
): number {
    return toCentavos(
        lines.reduce((total, line) => total + lineTotalPhp(line.qty, line.unitPricePhp), 0),
    );
}

/**
 * "₱1,234.00" — the on-screen format.
 *
 * The PDF (`lib/pdf/quote-data.ts`) and the contract DOCX
 * (`lib/docx/contract-data.ts`) deliberately keep their own: the PDF spells out
 * "PHP" because the ₱ glyph is not guaranteed in its embedded font, and the
 * contract prints a bare number because the template supplies the currency
 * word itself. Those are requirements, not drift — don't collapse them here.
 */
export function formatPhp(amount: number): string {
    return (
        "₱" +
        amount.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })
    );
}
