/**
 * Renders the Quotation to a PDF with sample data, so the layout can be
 * checked without a database or a signed-in session.
 *
 *   npx vite-node scripts/preview-quote-pdf.tsx
 *
 * Development only — not imported by the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";

import { QuotePdf } from "../src/lib/pdf/QuotePdf.tsx";
import type { QuotePdfData } from "../src/lib/pdf/quote-data.ts";

// react-pdf resolves `/report/*.jpg` against a server that isn't running
// here, so the logo is inlined for the preview — same as the other two
// preview scripts.
const dataUri = (path: string) =>
    `data:image/jpeg;base64,${readFileSync(path).toString("base64")}`;
const logo = dataUri("public/report/lampara-logo.jpg");

const data: QuotePdfData = {
    quotationNo: "PV System Quotation-1",
    date: "11 September 2026",
    preparerName: "Carlo Fernan P. Abanilla",
    customerName: "Juan Dela Cruz",
    customerPhone: "0917 123 4567",
    customerEmail: "juan@example.com",
    customerAddress: "Persan Village, Blk 7 Lot 12, Tanza, Cavite 4108",
    items: [
        {
            num: 1,
            description: "6kWp Hybrid PV System (with Battery)",
            qtyStr: "1 set",
            priceStr: "PHP 291,500.00",
            totalStr: "PHP 291,500.00",
        },
        {
            num: 2,
            description: "12 solar panels (620/625W)",
            qtyStr: "12 pcs",
            priceStr: "",
            totalStr: "",
        },
        {
            num: 3,
            description: "1 Solis 6kW inverter",
            qtyStr: "1 pc",
            priceStr: "",
            totalStr: "",
        },
    ],
    grandTotalStr: "PHP 291,500.00",
    notes: "Includes standard mounting hardware and EMT conduit for outdoor runs.",
};

const buffer = await renderToBuffer(<QuotePdf data={data} logo={logo} />);
writeFileSync("quote-pdf-preview.pdf", buffer);
console.log(`Wrote quote-pdf-preview.pdf (${(buffer.length / 1024).toFixed(0)} KB)`);
