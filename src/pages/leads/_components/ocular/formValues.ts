/**
 * The Ocular Report's form-value shape and conversions — shared between the
 * online form (OcularReportForm.tsx) and the offline export/import page
 * (src/pages/offline-report/page.tsx), so the two can never drift apart on
 * what fields exist or how they're coerced.
 *
 * Values are held as strings and coerced on save. Number inputs that bind
 * straight to numbers fight the person typing — "1." and "" both become NaN
 * mid-keystroke — so the conversion happens once, at the edge.
 */

import { parseReportNumber as toNum, parseReportInteger as toInt } from "@/lib/report-number.ts";
import type { SurveyReportPatch } from "@/lib/supabase/queries/surveys.ts";
import type { SurveyForLead } from "@/lib/supabase/types.ts";

export type FormValues = {
    inspectionDate: string;
    latitude: string;
    longitude: string;
    usageHabit: string;
    monthlyConsumptionKwh: string;
    monthlyBillPhp: string;

    applianceAircon: boolean;
    applianceAirconNote: string;
    applianceTv: boolean;
    applianceTvNote: string;
    applianceRef: boolean;
    applianceRefNote: string;
    applianceWasher: boolean;
    applianceWasherNote: string;
    applianceOthers: string;
    recommendedVehicle: string;

    roofType: string;
    roofTypeNote: string;
    supportPurlins: string[];
    roofAreaSqm: string;
    roofWidthM: string;
    roofLengthM: string;
    roofAccess: string;
    mounting: string[];
    roofOrientation: string[];
    estDcRunM: string;
    estAcRunM: string;

    meterPhase: string;
    transformerCount: string;
    meterKind: string;
    meterForm: string;
    serviceDisconnect: string;
    serviceDisconnectRating: string;

    grounding: string;
    mainDistributionPanel: string;
    cbSizeRating: string;
    wireSize: string;
    connectionType: string;
    floorCount: string;

    systemCapacity: string;
    packageType: string;
    batteryOption: string;
    panelOption: string;
    reportNotes: string;
};

/** A wholly blank form — the offline page's starting point for a new draft,
 *  with no survey to derive defaults from. */
export function emptyFormValues(): FormValues {
    return {
        inspectionDate: "",
        latitude: "",
        longitude: "",
        usageHabit: "",
        monthlyConsumptionKwh: "",
        monthlyBillPhp: "",
        applianceAircon: false,
        applianceAirconNote: "",
        applianceTv: false,
        applianceTvNote: "",
        applianceRef: false,
        applianceRefNote: "",
        applianceWasher: false,
        applianceWasherNote: "",
        applianceOthers: "",
        recommendedVehicle: "",
        roofType: "",
        roofTypeNote: "",
        supportPurlins: [],
        roofAreaSqm: "",
        roofWidthM: "",
        roofLengthM: "",
        roofAccess: "",
        mounting: [],
        roofOrientation: [],
        estDcRunM: "",
        estAcRunM: "",
        meterPhase: "",
        transformerCount: "",
        meterKind: "",
        meterForm: "",
        serviceDisconnect: "",
        serviceDisconnectRating: "",
        grounding: "",
        mainDistributionPanel: "",
        cbSizeRating: "",
        wireSize: "",
        connectionType: "",
        floorCount: "",
        systemCapacity: "",
        packageType: "",
        batteryOption: "",
        panelOption: "",
        reportNotes: "",
    };
}

const str = (v: string | undefined | null) => v ?? "";
const numStr = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v));
const boolStr = (v: boolean | undefined | null) =>
    v === undefined || v === null ? "" : v ? "yes" : "no";

export function toForm(survey: SurveyForLead): FormValues {
    return {
        inspectionDate: str(survey.inspectionDate),
        latitude: numStr(survey.latitude),
        longitude: numStr(survey.longitude),
        usageHabit: str(survey.usageHabit),
        monthlyConsumptionKwh: numStr(survey.monthlyConsumptionKwh),
        monthlyBillPhp: numStr(survey.monthlyBillPhp),

        applianceAircon: survey.applianceAircon,
        applianceAirconNote: str(survey.applianceAirconNote),
        applianceTv: survey.applianceTv,
        applianceTvNote: str(survey.applianceTvNote),
        applianceRef: survey.applianceRef,
        applianceRefNote: str(survey.applianceRefNote),
        applianceWasher: survey.applianceWasher,
        applianceWasherNote: str(survey.applianceWasherNote),
        applianceOthers: str(survey.applianceOthers),
        recommendedVehicle: str(survey.recommendedVehicle),

        roofType: str(survey.roofType),
        roofTypeNote: str(survey.roofTypeNote),
        supportPurlins: survey.supportPurlins,
        roofAreaSqm: numStr(survey.roofAreaSqm),
        roofWidthM: numStr(survey.roofWidthM),
        roofLengthM: numStr(survey.roofLengthM),
        roofAccess: str(survey.roofAccess),
        mounting: survey.mounting,
        roofOrientation: survey.roofOrientation,
        estDcRunM: numStr(survey.estDcRunM),
        estAcRunM: numStr(survey.estAcRunM),

        meterPhase: str(survey.meterPhase),
        transformerCount: numStr(survey.transformerCount),
        meterKind: str(survey.meterKind),
        meterForm: str(survey.meterForm),
        serviceDisconnect: boolStr(survey.serviceDisconnect),
        serviceDisconnectRating: str(survey.serviceDisconnectRating),

        grounding: boolStr(survey.grounding),
        mainDistributionPanel: str(survey.mainDistributionPanel),
        cbSizeRating: str(survey.cbSizeRating),
        wireSize: str(survey.wireSize),
        connectionType: str(survey.connectionType),
        floorCount: numStr(survey.floorCount),

        systemCapacity: str(survey.systemCapacity),
        packageType: str(survey.packageType),
        batteryOption: str(survey.batteryOption),
        panelOption: str(survey.panelOption),
        reportNotes: str(survey.reportNotes),
    };
}

function toBool(value: string): boolean | undefined {
    if (value === "yes") return true;
    if (value === "no") return false;
    return undefined;
}

export function toPatch(v: FormValues): SurveyReportPatch {
    return {
        inspectionDate: v.inspectionDate || undefined,
        latitude: toNum(v.latitude),
        longitude: toNum(v.longitude),
        usageHabit: (v.usageHabit || undefined) as SurveyReportPatch["usageHabit"],
        monthlyConsumptionKwh: toNum(v.monthlyConsumptionKwh, "Monthly consumption"),
        monthlyBillPhp: toNum(v.monthlyBillPhp, "Monthly bill"),

        applianceAircon: v.applianceAircon,
        applianceAirconNote: v.applianceAirconNote || undefined,
        applianceTv: v.applianceTv,
        applianceTvNote: v.applianceTvNote || undefined,
        applianceRef: v.applianceRef,
        applianceRefNote: v.applianceRefNote || undefined,
        applianceWasher: v.applianceWasher,
        applianceWasherNote: v.applianceWasherNote || undefined,
        applianceOthers: v.applianceOthers || undefined,
        recommendedVehicle: v.recommendedVehicle || undefined,

        roofType: (v.roofType || undefined) as SurveyReportPatch["roofType"],
        roofTypeNote: v.roofTypeNote || undefined,
        supportPurlins: v.supportPurlins as SurveyReportPatch["supportPurlins"],
        roofAreaSqm: toNum(v.roofAreaSqm),
        roofWidthM: toNum(v.roofWidthM),
        roofLengthM: toNum(v.roofLengthM),
        roofAccess: (v.roofAccess || undefined) as SurveyReportPatch["roofAccess"],
        mounting: v.mounting as SurveyReportPatch["mounting"],
        roofOrientation: v.roofOrientation as SurveyReportPatch["roofOrientation"],
        estDcRunM: toNum(v.estDcRunM),
        estAcRunM: toNum(v.estAcRunM),

        meterPhase: (v.meterPhase || undefined) as SurveyReportPatch["meterPhase"],
        transformerCount: toInt(v.transformerCount),
        meterKind: (v.meterKind || undefined) as SurveyReportPatch["meterKind"],
        meterForm: (v.meterForm || undefined) as SurveyReportPatch["meterForm"],
        serviceDisconnect: toBool(v.serviceDisconnect),
        serviceDisconnectRating: v.serviceDisconnectRating || undefined,

        grounding: toBool(v.grounding),
        mainDistributionPanel: v.mainDistributionPanel || undefined,
        cbSizeRating: v.cbSizeRating || undefined,
        wireSize: v.wireSize || undefined,
        connectionType: (v.connectionType || undefined) as SurveyReportPatch["connectionType"],
        floorCount: toInt(v.floorCount),

        systemCapacity: (v.systemCapacity || undefined) as SurveyReportPatch["systemCapacity"],
        packageType: (v.packageType || undefined) as SurveyReportPatch["packageType"],
        batteryOption: (v.batteryOption || undefined) as SurveyReportPatch["batteryOption"],
        panelOption: (v.panelOption || undefined) as SurveyReportPatch["panelOption"],
        reportNotes: v.reportNotes || undefined,
    };
}
