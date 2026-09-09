import { ROOF_TYPE_LABELS } from "@/lib/constants.ts";
import type { Lead, Property, SurveyForLead, SurveyPhoto } from "@/lib/supabase/types.ts";
import type { ReportData, ReportPhoto } from "./OcularReport.tsx";

/**
 * Turns one inspection into the flat shape the PDF renders.
 *
 * Photos are fetched here and inlined as data URIs rather than handed to the
 * renderer as URLs. Two reasons: the bucket's signed URLs expire, and a render
 * that reaches for the network mid-layout fails a page at a time with nothing
 * to show for it. Fetching first means a photo either makes the report or is
 * quietly left out, and the report always renders.
 */

const decimal = (v: number | undefined) =>
    v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** "36.8" alone reads as nothing in particular on a printed page. */
const withUnit = (v: number | undefined, unit: string) =>
    v === undefined ? "" : `${decimal(v)} ${unit}`;

const longDate = (iso: string | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
        ? ""
        : d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
};

/** How many photos each slot on the printed page can actually hold. */
const SLOT_LIMITS = {
    building_front: 1,
    roof_view: 1,
    meralco_meter: 1,
    main_circuit_breaker: 1,
    meralco_bill: 1,
    roof_panel_design: 1,
    inverter_battery: 1,
    dc_conduit: 3,
    ac_conduit: 3,
    other: 3,
} as const;

async function toDataUri(url: string): Promise<string | null> {
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

async function fetchSlot(photos: SurveyPhoto[], limit: number): Promise<ReportPhoto[]> {
    const wanted = photos.filter((p) => p.url).slice(0, limit);
    const resolved = await Promise.all(
        wanted.map(async (p): Promise<ReportPhoto | null> => {
            const src = await toDataUri(p.url!);
            return src ? { src, caption: p.caption } : null;
        }),
    );
    return resolved.filter((p): p is ReportPhoto => p !== null);
}

export async function buildReportData(
    survey: SurveyForLead,
    lead: Lead,
    property: Property | undefined,
): Promise<ReportData> {
    const byCategory = new Map<string, SurveyPhoto[]>();
    for (const photo of survey.photos) {
        const list = byCategory.get(photo.category) ?? [];
        list.push(photo);
        byCategory.set(photo.category, list);
    }
    const slot = (key: keyof typeof SLOT_LIMITS) =>
        fetchSlot(byCategory.get(key) ?? [], SLOT_LIMITS[key]);

    // One pass over every slot, in parallel — a report with a dozen photos
    // should not take a dozen round trips end to end.
    const [
        buildingFront,
        roofView,
        meralcoMeter,
        mainBreaker,
        meralcoBill,
        roofPanelDesign,
        inverterBattery,
        dcConduit,
        acConduit,
        other,
    ] = await Promise.all([
        slot("building_front"),
        slot("roof_view"),
        slot("meralco_meter"),
        slot("main_circuit_breaker"),
        slot("meralco_bill"),
        slot("roof_panel_design"),
        slot("inverter_battery"),
        slot("dc_conduit"),
        slot("ac_conduit"),
        slot("other"),
    ]);

    return {
        name: `${lead.firstName} ${lead.lastName}`.trim(),
        date: longDate(survey.inspectionDate ?? survey.scheduledAt),
        address: property
            ? `${property.address}, ${property.city}, ${property.state} ${property.zip}`.trim()
            : "",
        coords:
            survey.latitude !== undefined && survey.longitude !== undefined
                ? `${survey.latitude}, ${survey.longitude}`
                : "",
        usageHabit: survey.usageHabit,
        kwh: decimal(survey.monthlyConsumptionKwh),
        bill: decimal(survey.monthlyBillPhp),
        appliances: [
            { label: "Air condition Unit", on: survey.applianceAircon, note: survey.applianceAirconNote ?? "" },
            { label: "Washing Machine", on: survey.applianceWasher, note: survey.applianceWasherNote ?? "" },
            { label: "Television", on: survey.applianceTv, note: survey.applianceTvNote ?? "" },
            { label: "Refrigerator", on: survey.applianceRef, note: survey.applianceRefNote ?? "" },
        ],
        others: survey.applianceOthers ?? "",
        vehicle: survey.recommendedVehicle ?? "",

        roofType: [
            survey.roofType ? ROOF_TYPE_LABELS[survey.roofType] : "",
            survey.roofTypeNote,
        ]
            .filter(Boolean)
            .join(" "),
        supportPurlins: survey.supportPurlins,
        roofArea: withUnit(survey.roofAreaSqm, "m²"),
        roofWidth: withUnit(survey.roofWidthM, "m"),
        roofLength: withUnit(survey.roofLengthM, "m"),
        roofAccess: survey.roofAccess,
        mounting: survey.mounting,
        orientation: survey.roofOrientation,
        estDc: withUnit(survey.estDcRunM, "m"),
        estAc: withUnit(survey.estAcRunM, "m"),

        meterPhase: survey.meterPhase,
        transformers: survey.transformerCount === undefined ? "" : String(survey.transformerCount),
        meterKind: survey.meterKind,
        meterForm: survey.meterForm,
        serviceDisconnect: survey.serviceDisconnect,
        sdRating: survey.serviceDisconnectRating ?? "",
        grounding: survey.grounding,
        mdp: survey.mainDistributionPanel ?? "",
        cbSize: survey.cbSizeRating ?? "",
        wireSize: survey.wireSize ?? "",
        connectionType: survey.connectionType,
        floors: survey.floorCount === undefined ? "" : String(survey.floorCount),

        systemCapacity: survey.systemCapacity,
        packageType: survey.packageType,
        batteryOption: survey.batteryOption,
        panelOption: survey.panelOption,
        notes: survey.reportNotes ?? "",

        photos: {
            buildingFront,
            roofView,
            meralcoMeter,
            mainBreaker,
            meralcoBill,
            roofPanelDesign,
            inverterBattery,
            dcConduit,
            acConduit,
            other,
        },

    };
}

/** A filename someone can find again in a downloads folder. */
export function reportFileName(survey: SurveyForLead, lead: Lead): string {
    const who = `${lead.firstName}-${lead.lastName}`.replace(/[^a-zA-Z0-9-]/g, "");
    const when = (survey.inspectionDate ?? survey.scheduledAt).slice(0, 10);
    return `Site-Ocular-Report_${who}_${when}.pdf`;
}

