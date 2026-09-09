/**
 * Renders the Site Ocular Report to a PDF with sample data, so the layout can
 * be checked without a database or a signed-in session.
 *
 *   npx vite-node scripts/preview-ocular-pdf.tsx
 *
 * Development only — not imported by the app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderToBuffer } from "@react-pdf/renderer";

import { OcularReport, type ReportData } from "../src/lib/pdf/OcularReport.tsx";

// react-pdf resolves `/report/*.jpg` against a server that isn't running here,
// so the same assets are inlined for the preview.
const dataUri = (path: string) =>
    `data:image/jpeg;base64,${readFileSync(path).toString("base64")}`;

const logo = dataUri("public/report/lampara-logo.jpg");
const compass = dataUri("public/report/compass.jpg");

const photo = (label: string) => ({ src: logo, caption: label });

const data: ReportData = {
    name: "Carlo Fernan P. Abanilla",
    date: "8 August 2026",
    address: "Persan Village, Blk 7 Lot 12, Tanza, Cavite 4108",
    coords: "14.378573277485053, 120.85588935250186",
    usageHabit: "evening",
    kwh: "666",
    bill: "10,000",
    appliances: [
        { label: "Air condition Unit", on: true, note: "1 unit, 1.5hp" },
        { label: "Washing Machine", on: true, note: "" },
        { label: "Television", on: true, note: "2 units" },
        { label: "Refrigerator", on: true, note: "" },
    ],
    others: "",
    vehicle: "Tamaraw",

    roofType: "N/A (structural support)",
    supportPurlins: ["steel"],
    roofArea: "36.8 m²",
    roofWidth: "8 m",
    roofLength: "4.6 m",
    roofAccess: "ladder",
    mounting: ["l_foot"],
    orientation: ["north"],
    estDc: "25 m",
    estAc: "5 m",

    meterPhase: "single",
    transformers: "1",
    meterKind: "main",
    meterForm: "round",
    serviceDisconnect: false,
    sdRating: "",
    grounding: true,
    mdp: "Surface-mount, 8 branches",
    cbSize: "60A",
    wireSize: "3.5mm²",
    connectionType: "wifi",
    floors: "2",

    systemCapacity: "6kwp",
    packageType: "with_battery",
    batteryOption: "314ah_16kwh",
    panelOption: "610_630wp",
    notes: "6kw inverter\n12pcs panels\n314AH battery\nUse EMT conduit for outdoor",

    photos: {
        buildingFront: [photo("front")],
        roofView: [photo("roof")],
        meralcoMeter: [photo("meter")],
        mainBreaker: [photo("breaker")],
        meralcoBill: [photo("bill")],
        roofPanelDesign: [photo("design")],
        inverterBattery: [photo("inverter")],
        dcConduit: [photo("dc1"), photo("dc2")],
        acConduit: [photo("ac1")],
        other: [],
    },

    preparedBy: "Carlo Fernan P. Abanilla",
    preparedDate: "8 August 2026",
    approvedBy: "Maria Santos",
    approvedDate: "9 August 2026",
};

const buffer = await renderToBuffer(<OcularReport data={data} logo={logo} compass={compass} />);
writeFileSync("ocular-report-preview.pdf", buffer);
console.log(`Wrote ocular-report-preview.pdf (${(buffer.length / 1024).toFixed(0)} KB)`);
