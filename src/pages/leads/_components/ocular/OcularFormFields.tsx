import { Controller, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { Crosshair, Loader2 } from "lucide-react";

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
import type { FormValues } from "./formValues.ts";
import {
    ApplianceField,
    ChoiceField,
    FieldBlock,
    MultiChoiceField,
    TextField,
    YesNoField,
} from "./fields.tsx";

/**
 * The Site Ocular Report's field set, field for field — mirrors
 * public/Ocular report sample.pdf so a technician who knows the paper form
 * can fill this without relearning anything. Nothing is required: the report
 * is filled across a visit, and a half-finished report is more useful than
 * one nobody could save.
 *
 * Shared between OcularReportForm.tsx (the online form, bound to a real
 * survey via react-hook-form) and the offline export/import page (bound to a
 * local draft with the exact same shape) — one source of truth for what
 * fields exist, so the two can't silently drift apart.
 */
export function OcularFormFields({
    control,
    register,
    disabled,
    onUseMyLocation,
    locating,
}: {
    control: Control<FormValues>;
    register: UseFormRegister<FormValues>;
    disabled: boolean;
    onUseMyLocation: () => void;
    locating: boolean;
}) {
    const packageType = useWatch({ control, name: "packageType" });

    return (
        <>
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
                        disabled={disabled}
                        {...register("monthlyConsumptionKwh")}
                    />
                    <TextField
                        label="Monthly electric bill"
                        inputMode="decimal"
                        suffix="₱"
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
                                onClick={onUseMyLocation}
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
        </>
    );
}
