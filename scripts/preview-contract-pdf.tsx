/**
 * Renders the Photovoltaic Installation Contract to a PDF with the sample
 * data from `public/Contract Sample.docx`, so the layout can be checked
 * without a database or a signed-in session.
 *
 *   npx vite-node scripts/preview-contract-pdf.tsx
 *
 * Development only — not imported by the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";

import { ContractPdf } from "../src/lib/pdf/ContractPdf.tsx";
import { buildContractPdfData } from "../src/lib/pdf/contract-data.ts";

// react-pdf resolves `/report/*.jpg` against a server that isn't running here.
const logo = `data:image/jpeg;base64,${readFileSync(
    "public/report/lampara-logo.jpg",
).toString("base64")}`;

const data = buildContractPdfData({
    homeownerName: "Ervin Pacheco",
    siteAddress: "62 Kabesang Imo St, Valenzuela, Metro Manila",
    phoneNumber: "09166241297",
    systemSizeKw: 7.32,
    panelLine: "( 12 PCS )  TIER 1 610-630 WATTS",
    inverterLine: "( 1 PC/S )  SOLIS S6-EH1P6K L-PRO/PLUS",
    batteryLine: "( 1 PC/S )  PYLONTECH 51.2V 314AH",
    pricePhp: 366500,
    preparedByName: "Carlo Fernan P. Abanilla",
    contractDate: "2026-09-04",
});

const buffer = await renderToBuffer(<ContractPdf data={data} logo={logo} />);
writeFileSync("contract-preview.pdf", buffer);
console.log(`Wrote contract-preview.pdf (${buffer.length} bytes)`);
