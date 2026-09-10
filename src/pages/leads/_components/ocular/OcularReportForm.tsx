import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Crosshair, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { parseReportNumber as toNum, parseReportInteger as toInt } from "@/lib/report-number.ts";

import { useSaveSurveyReport } from "@/lib/supabase/hooks.ts";
import type { SurveyReportPatch } from "@/lib/supabase/queries/surveys.ts";
import type { Id, SurveyForLead } from "@/lib/supabase/types.ts";
import {
    BATTERY_OPTION_LABELS,
    CONNECTION_TYPE_LABELS,
    METER_FORM_LABELS,
    METER_KIND_LABELS,
    METER_PHASE_LABELS,
    MOUNTING_LABELS,
    ORIENTATION_LABELS,
    PACKAGE_TYPE_LABELS,
    PANEL_OPTION_LABELS,
    ROOF_ACCESS_LABELS,
    ROOF_TYPE_LABELS,
    SUPPORT_PURLIN_LABELS,
    SYSTEM_CAPACITY_LABELS,
    USAGE_HABIT_LABELS,
} from "@/lib/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
    ApplianceField,
    ChoiceField,
    FieldBlock,
    MultiChoiceField,
    TextField,
    YesNoField,
} from "./fields.tsx";

/**
 * The Site Ocular Report, field for field.
 *
 * Mirrors public/Ocular report sample.pdf so a technician who knows the paper
 * form can fill this without relearning anything. Nothing is required: the
 * report is filled across a visit, and a half-finished report is more useful
 * than one nobody could save.
 *
 * Values are held as strings and coerced on save. Number inputs that bind
 * straight to numbers fight the person typing — "1." and "" both become NaN
 * mid-keystroke — so the conversion happens once, at the edge.
 */

type FormValues = {
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

const str = (v: string | undefined | null) => v ?? "";
const numStr = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v));
const boolStr = (v: boolean | undefined | null) =>
    v === undefined || v === null ? "" : v ? "yes" : "no";

function toForm(survey: SurveyForLead): FormValues {
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

function toPatch(v: FormValues): SurveyReportPatch {
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

export default function OcularReportForm({
    survey,
    editable,
    disabled: externallyDisabled = false,
}: {
    survey: SurveyForLead;
    editable: boolean;
    disabled?: boolean;
}) {
    const { mutateAsync: saveReport } = useSaveSurveyReport();
    const [saving, setSaving] = useState(false);
    const [locating, setLocating] = useState(false);
    const savingRef = useRef(false);

    const form = useForm<FormValues>({ defaultValues: toForm(survey) });
    const { control, register, handleSubmit, reset, setValue, getValues, trigger, formState } = form;

    // Re-sync when the inspection being viewed changes. Not on
    // every refetch: Realtime hands back a new object on any write to the lead,
    // and resetting under someone's cursor loses what they were typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => reset(toForm(survey)), [survey._id, survey.status]);

    const packageType = useWatch({ control, name: "packageType" });

    async function saveDraft() {
        if (!editable || !formState.isDirty) return;
        if (savingRef.current) throw new Error("Wait for the report to finish saving.");
        savingRef.current = true;
        setSaving(true);
        try {
            if (!(await trigger())) throw new Error("Check the report fields before saving.");
            const values = getValues();
            const allFields = toPatch(values);
            // Preserve unrelated edits made by another person since this form opened.
            const patch = Object.fromEntries(
                Object.entries(allFields).filter(([key]) => key in formState.dirtyFields),
            ) as SurveyReportPatch;
            await saveReport({ surveyId: survey._id as Id<"surveys">, patch });
            reset(values);
        } finally {
            savingRef.current = false;
            setSaving(false);
        }
    }

    async function onSubmit() {
        try {
            await saveDraft();
            toast.success("Report saved");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not save the report");
        }
    }

    /** The "Coordinates:" line, read off the device the technician is holding. */
    function useMyLocation() {
        if (!navigator.geolocation) {
            toast.error("This device cannot report a location");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setValue("latitude", String(pos.coords.latitude), { shouldDirty: true });
                setValue("longitude", String(pos.coords.longitude), { shouldDirty: true });
                setLocating(false);
                toast.success("Coordinates captured");
            },
            (err) => {
                setLocating(false);
                toast.error(
                    err.code === err.PERMISSION_DENIED
                        ? "Location permission denied"
                        : "Could not read this device's location",
                );
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    const disabled = !editable || saving || externallyDisabled;

    return (
        <form onSubmit={(event) => { void handleSubmit(onSubmit)(event); }} className="space-y-4">
            {/* ── Client details ───────────────────────────────────────── */}
            <FieldBlock title="Client Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <TextField
                        label="Date of inspection"
                        type="date"
                        disabled={disabled}
                        {...register("inspectionDate")}
                    />
                    <TextField
                        label="Monthly consumption"
                        inputMode="decimal"
                        suffix="kWh"
                        placeholder="666"
                        disabled={disabled}
                        {...register("monthlyConsumptionKwh")}
                    />
                    <TextField
                        label="Monthly electric bill"
                        inputMode="decimal"
                        suffix="₱"
                        placeholder="10,000"
                        disabled={disabled}
                        {...register("monthlyBillPhp")}
                    />
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Coordinates
                        </Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <div className="flex gap-2">
                                <input
                                    {...register("latitude")}
                                    placeholder="Latitude"
                                    inputMode="decimal"
                                    disabled={disabled}
                                    className="flex-1 min-w-0 h-10 sm:h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                />
                                <input
                                    {...register("longitude")}
                                    placeholder="Longitude"
                                    inputMode="decimal"
                                    disabled={disabled}
                                    className="flex-1 min-w-0 h-10 sm:h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                                />
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="size-10 sm:size-9 shrink-0 w-full sm:w-auto"
                                onClick={useMyLocation}
                                disabled={disabled || locating}
                                title="Use this device's location"
                                aria-label="Use this device's location"
                            >
                                {locating ? (
                                    <Loader2 className="size-4 animate-spin" />
                                ) : (
                                    <Crosshair className="size-4" />
                                )}
                                <span className="sm:hidden ml-1.5 text-sm">Use my location</span>
                            </Button>
                        </div>
                    </div>
                </div>

                <Controller
                    control={control}
                    name="usageHabit"
                    render={({ field }) => (
                        <ChoiceField
                            label="Consumption / usage habits"
                            options={USAGE_HABIT_LABELS}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />

                <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Appliances</p>
                    <div className="space-y-2">
                        <Controller
                            control={control}
                            name="applianceAircon"
                            render={({ field }) => (
                                <Controller
                                    control={control}
                                    name="applianceAirconNote"
                                    render={({ field: note }) => (
                                        <ApplianceField
                                            label="Air condition unit"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            note={note.value}
                                            onNoteChange={note.onChange}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                            )}
                        />
                        <Controller
                            control={control}
                            name="applianceTv"
                            render={({ field }) => (
                                <Controller
                                    control={control}
                                    name="applianceTvNote"
                                    render={({ field: note }) => (
                                        <ApplianceField
                                            label="Television"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            note={note.value}
                                            onNoteChange={note.onChange}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                            )}
                        />
                        <Controller
                            control={control}
                            name="applianceRef"
                            render={({ field }) => (
                                <Controller
                                    control={control}
                                    name="applianceRefNote"
                                    render={({ field: note }) => (
                                        <ApplianceField
                                            label="Refrigerator"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            note={note.value}
                                            onNoteChange={note.onChange}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                            )}
                        />
                        <Controller
                            control={control}
                            name="applianceWasher"
                            render={({ field }) => (
                                <Controller
                                    control={control}
                                    name="applianceWasherNote"
                                    render={({ field: note }) => (
                                        <ApplianceField
                                            label="Washing machine"
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                            note={note.value}
                                            onNoteChange={note.onChange}
                                            disabled={disabled}
                                        />
                                    )}
                                />
                            )}
                        />
                        <TextField
                            label="Others"
                            placeholder="Anything else worth sizing for"
                            disabled={disabled}
                            {...register("applianceOthers")}
                        />
                    </div>
                </div>

                <TextField
                    label="Recommended vehicle"
                    // The paper form names two by way of example; the road decides.
                    placeholder="Carabao, Tamaraw…"
                    disabled={disabled}
                    {...register("recommendedVehicle")}
                />
            </FieldBlock>

            {/* ── Roof ─────────────────────────────────────────────────── */}
            <FieldBlock title="Roof">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Controller
                        control={control}
                        name="roofType"
                        render={({ field }) => (
                            <ChoiceField
                                label="Roof type"
                                options={ROOF_TYPE_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={3}
                                className="sm:col-span-2"
                            />
                        )}
                    />
                    <TextField
                        label="Roof type note"
                        placeholder="e.g. N/A (structural support)"
                        disabled={disabled}
                        className="sm:col-span-2"
                        {...register("roofTypeNote")}
                    />
                </div>

                <Controller
                    control={control}
                    name="supportPurlins"
                    render={({ field }) => (
                        <MultiChoiceField
                            label="Support / purlins"
                            options={SUPPORT_PURLIN_LABELS}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                        />
                    )}
                />

                {/* Three number fields with unit suffixes leave ~85px each on a
                    phone. Area takes its own line there; width and length pair. */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <TextField
                        label="Roof area"
                        inputMode="decimal"
                        suffix="m²"
                        disabled={disabled}
                        className="col-span-2 sm:col-span-1"
                        {...register("roofAreaSqm")}
                    />
                    <TextField
                        label="Width"
                        inputMode="decimal"
                        suffix="m"
                        disabled={disabled}
                        {...register("roofWidthM")}
                    />
                    <TextField
                        label="Length"
                        inputMode="decimal"
                        suffix="m"
                        disabled={disabled}
                        {...register("roofLengthM")}
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                        control={control}
                        name="roofAccess"
                        render={({ field }) => (
                            <ChoiceField
                                label="Roof access"
                                options={ROOF_ACCESS_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={3}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="mounting"
                        render={({ field }) => (
                            <MultiChoiceField
                                label="Mounting"
                                options={MOUNTING_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={2}
                            />
                        )}
                    />
                </div>

                <Controller
                    control={control}
                    name="roofOrientation"
                    render={({ field }) => (
                        <MultiChoiceField
                            label="Roof facing / orientation"
                            options={ORIENTATION_LABELS}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                            columns={4}
                        />
                    )}
                />

                <div className="grid grid-cols-2 gap-3">
                    <TextField
                        label="Est. DC run"
                        inputMode="decimal"
                        suffix="m"
                        disabled={disabled}
                        {...register("estDcRunM")}
                    />
                    <TextField
                        label="Est. AC run"
                        inputMode="decimal"
                        suffix="m"
                        disabled={disabled}
                        {...register("estAcRunM")}
                    />
                </div>
            </FieldBlock>

            {/* ── Electric meter ───────────────────────────────────────── */}
            <FieldBlock title="Electric Meter">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                        control={control}
                        name="meterPhase"
                        render={({ field }) => (
                            <ChoiceField
                                label="Phase"
                                options={METER_PHASE_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={2}
                            />
                        )}
                    />
                    <TextField
                        label="No. of transformers"
                        inputMode="numeric"
                        disabled={disabled}
                        {...register("transformerCount")}
                    />
                    <Controller
                        control={control}
                        name="meterKind"
                        render={({ field }) => (
                            <ChoiceField
                                label="Meter"
                                options={METER_KIND_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={2}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="meterForm"
                        render={({ field }) => (
                            <ChoiceField
                                label="Meter form"
                                options={METER_FORM_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={3}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="serviceDisconnect"
                        render={({ field }) => (
                            <YesNoField
                                label="Service disconnect"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                            />
                        )}
                    />
                    <TextField
                        label="Service disconnect rating"
                        disabled={disabled}
                        {...register("serviceDisconnectRating")}
                    />
                </div>
            </FieldBlock>

            {/* ── Panel & network ──────────────────────────────────────── */}
            <FieldBlock title="Panel & Network">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                        control={control}
                        name="grounding"
                        render={({ field }) => (
                            <YesNoField
                                label="Grounding"
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                            />
                        )}
                    />
                    <TextField
                        label="No. of floors"
                        inputMode="numeric"
                        disabled={disabled}
                        {...register("floorCount")}
                    />
                    <TextField
                        label="Main distribution panel"
                        disabled={disabled}
                        {...register("mainDistributionPanel")}
                    />
                    <TextField
                        label="CB size or rating"
                        disabled={disabled}
                        {...register("cbSizeRating")}
                    />
                    <TextField label="Wire size" disabled={disabled} {...register("wireSize")} />
                    <Controller
                        control={control}
                        name="connectionType"
                        render={({ field }) => (
                            <ChoiceField
                                label="Network / connection type"
                                options={CONNECTION_TYPE_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={2}
                            />
                        )}
                    />
                </div>
            </FieldBlock>

            {/* ── System package ───────────────────────────────────────── */}
            <FieldBlock title="System Package / Details">
                <Controller
                    control={control}
                    name="systemCapacity"
                    render={({ field }) => (
                        <ChoiceField
                            label="System capacity / size"
                            options={SYSTEM_CAPACITY_LABELS}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                            columns={4}
                        />
                    )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Controller
                        control={control}
                        name="packageType"
                        render={({ field }) => (
                            <ChoiceField
                                label="Package"
                                options={PACKAGE_TYPE_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                disabled={disabled}
                                columns={2}
                            />
                        )}
                    />
                    <Controller
                        control={control}
                        name="batteryOption"
                        render={({ field }) => (
                            <ChoiceField
                                label="Battery"
                                options={BATTERY_OPTION_LABELS}
                                value={field.value}
                                onChange={field.onChange}
                                // A "No battery" package has no battery to pick.
                                disabled={disabled || packageType === "no_battery"}
                                columns={2}
                            />
                        )}
                    />
                </div>
                <Controller
                    control={control}
                    name="panelOption"
                    render={({ field }) => (
                        <ChoiceField
                            label="Panels"
                            options={PANEL_OPTION_LABELS}
                            value={field.value}
                            onChange={field.onChange}
                            disabled={disabled}
                            columns={2}
                        />
                    )}
                />
                <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Notes</Label>
                    <Textarea
                        {...register("reportNotes")}
                        disabled={disabled}
                        rows={4}
                        placeholder={"6kw inverter\n12pcs panels\n314AH battery\nUse EMT conduit for outdoor"}
                        className="text-sm"
                    />
                </div>
            </FieldBlock>

            {/* ── Sticky save bar ──────────────────────────────────────── */}
            {editable && formState.isDirty && (
                <div className="glass-nav sticky bottom-20 md:bottom-0 -mx-1 px-3 py-3 rounded-xl md:rounded-none border border-sidebar-border md:border-x-0 md:border-b-0 flex items-center justify-between gap-3 shadow-lg md:shadow-none">
                    <p className="text-xs text-muted-foreground">Unsaved changes</p>
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => reset(toForm(survey))}
                            disabled={disabled}
                        >
                            Discard
                        </Button>
                        <Button type="submit" size="sm" disabled={disabled}>
                            {saving ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                                <Save className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            {saving ? "Saving…" : "Save report"}
                        </Button>
                    </div>
                </div>
            )}
        </form>
    );
}
