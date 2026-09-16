import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { useSaveSurveyReport } from "@/lib/supabase/hooks.ts";
import type { Id, SurveyForLead } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";
import UnsavedChangesBar from "@/components/unsaved-changes-bar.tsx";
import { OcularFormFields } from "./OcularFormFields.tsx";
import { toForm, toPatch, type FormValues } from "./formValues.ts";

/**
 * The Site Ocular Report, bound to a real survey and saved online.
 *
 * Nothing is required: the report is filled across a visit, and a
 * half-finished report is more useful than one nobody could save.
 */

export type OcularReportFormHandle = {
    /** Sets every field from an imported offline draft and marks them all
     *  dirty (not just changed) — so the existing dirty-fields patch on save
     *  writes the imported values for real, the same as if a person had
     *  typed them in. Used by OcularInspectionTab's "Import Offline Report"
     *  button; see docs/plans/Offline_Export_Import_plan.md. */
    importValues: (values: FormValues) => void;
};

const OcularReportForm = forwardRef<
    OcularReportFormHandle,
    { survey: SurveyForLead; editable: boolean; disabled?: boolean }
>(function OcularReportForm({ survey, editable, disabled: externallyDisabled = false }, ref) {
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

    useImperativeHandle(ref, () => ({
        importValues: (values) => {
            (Object.keys(values) as (keyof FormValues)[]).forEach((key) => {
                setValue(key, values[key] as never, { shouldDirty: true });
            });
        },
    }));

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
            ) as ReturnType<typeof toPatch>;
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
            <OcularFormFields
                control={control}
                register={register}
                disabled={disabled}
                onUseMyLocation={useMyLocation}
                locating={locating}
            />

            {/* ── Sticky save bar ──────────────────────────────────────── */}
            {editable && formState.isDirty && (
                <UnsavedChangesBar>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => reset(toForm(survey))}
                        disabled={disabled}
                    >
                        Discard
                    </Button>
                    <Button type="submit" size="sm" className="h-8 text-xs" disabled={disabled}>
                        {saving ? (
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                            <Save className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        {saving ? "Saving…" : "Save report"}
                    </Button>
                </UnsavedChangesBar>
            )}
        </form>
    );
});

export default OcularReportForm;
