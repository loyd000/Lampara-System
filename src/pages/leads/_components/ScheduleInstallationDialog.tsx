import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    useCreateInstallation,
    useRescheduleInstallation,
    useUsers,
} from "@/lib/supabase/hooks.ts";
import type { Id, Installation } from "@/lib/supabase/types.ts";
import { ROLE_LABELS } from "@/lib/constants.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { DateRangePicker } from "@/components/date-range-picker.tsx";
import { describeRange } from "@/components/date-range.ts";

const schema = z
    .object({
        scheduledDate: z.string().min(1, "Please select a start date"),
        scheduledEndDate: z.string().min(1, "Please select a finish date"),
        crewIds: z.array(z.string()).min(1, "Assign at least one crew member"),
        leadInstallerNote: z.string().optional(),
        notes: z.string().optional(),
    })
    // yyyy-mm-dd sorts correctly as a string, so no Date parsing is needed to
    // compare them — and none is wanted, since these are plain dates.
    .refine((v) => v.scheduledEndDate >= v.scheduledDate, {
        message: "The finish date can't be before the start date",
        path: ["scheduledEndDate"],
    });

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
    /**
     * Present when rescheduling. The form is the same either way — the dates
     * and crew of a job — so it takes the existing one rather than being
     * duplicated into a near-identical "edit" dialog that would drift.
     */
    installation?: Installation;
};

export default function ScheduleInstallationDialog({
    open,
    onClose,
    leadId,
    installation,
}: Props) {
    const { mutateAsync: createInstallation } = useCreateInstallation();
    const { mutateAsync: rescheduleInstallation } = useRescheduleInstallation();
    const { data: users } = useUsers();
    const crew = users?.filter((u) => ["field", "admin", "superadmin"].includes(u.role)) ?? [];

    const editing = Boolean(installation);

    const defaults: FormValues = {
        scheduledDate: installation?.scheduledDate ?? "",
        scheduledEndDate: installation?.scheduledEndDate ?? "",
        crewIds: installation?.assignedCrewIds ?? [],
        leadInstallerNote: installation?.leadInstallerNote ?? "",
        notes: installation?.notes ?? "",
    };

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: defaults,
    });

    // Refill from the current props every time the dialog opens.
    //
    // `form.reset()` on close restores the defaults captured when useForm first
    // ran, not the latest ones — so after saving a reschedule, reopening would
    // show the dates as they were before the edit. Re-syncing on the closed ->
    // open transition (rather than on the installation's identity) fixes that,
    // and never fires while someone is part-way through typing.
    const [wasOpen, setWasOpen] = useState(false);
    if (open !== wasOpen) {
        setWasOpen(open);
        if (open) form.reset(defaults);
    }

    // `useWatch`, not `form.watch()` in render — watch() returns a fresh
    // function-backed value every render, which React Compiler refuses to
    // memoize and warns about. Watched rather than read through getValues() so
    // the picker and the summary line both redraw as the drag moves.
    const startDate = useWatch({ control: form.control, name: "scheduledDate" });
    const endDate = useWatch({ control: form.control, name: "scheduledEndDate" });
    const range = { start: startDate ?? "", end: endDate ?? "" };

    async function onSubmit(values: FormValues) {
        const payload = {
            scheduledDate: values.scheduledDate,
            scheduledEndDate: values.scheduledEndDate,
            assignedCrewIds: values.crewIds as Id<"users">[],
            leadInstallerNote: values.leadInstallerNote || undefined,
            notes: values.notes || undefined,
        };
        try {
            if (installation) {
                await rescheduleInstallation({
                    installationId: installation._id as Id<"installations">,
                    ...payload,
                });
                toast.success("Installation rescheduled — the crew has been notified");
            } else {
                await createInstallation({ leadId, ...payload });
                toast.success("Installation scheduled");
            }
            form.reset();
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to save the installation";
            toast.error(msg);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    form.reset();
                    onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>
                        {editing ? "Reschedule Installation" : "Schedule Installation"}
                    </DialogTitle>
                    <DialogDescription>
                        Set the installation dates and assign the crew.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="scheduledDate" render={() => (
                            <FormItem>
                                <FormLabel>Installation Dates</FormLabel>
                                <FormControl>
                                    <DateRangePicker
                                        value={range}
                                        onChange={(next) => {
                                            form.setValue("scheduledDate", next.start, {
                                                shouldValidate: true,
                                            });
                                            form.setValue("scheduledEndDate", next.end, {
                                                shouldValidate: true,
                                            });
                                        }}
                                    />
                                </FormControl>
                                <p className="text-xs text-muted-foreground">
                                    {range.start
                                        ? describeRange(range)
                                        : "Drag across the days, or click the first and last."}
                                </p>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="crewIds" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Assign Crew</FormLabel>
                                {/* No inner scroller: the dialog itself already
                                    scrolls (max-h-[90vh] overflow-y-auto), and a
                                    scroller nested inside a scroller traps the
                                    touch drag gesture on a phone. */}
                                <div className="space-y-1 rounded-md border p-2">
                                    {crew.length === 0 ? (
                                        <p className="text-xs text-muted-foreground p-1">No technicians found</p>
                                    ) : crew.map((u) => (
                                        // The whole row is the label, not just the
                                        // text beside a 16px checkbox — py-2 takes
                                        // the hit area to a real thumb-sized target.
                                        <label
                                            key={u._id}
                                            htmlFor={u._id}
                                            className="flex items-center gap-2 py-2 px-1 rounded-sm cursor-pointer hover:bg-muted/40"
                                        >
                                            <Checkbox
                                                id={u._id}
                                                checked={field.value.includes(u._id)}
                                                onCheckedChange={(checked) => {
                                                    if (checked) {
                                                        field.onChange([...field.value, u._id]);
                                                    } else {
                                                        field.onChange(field.value.filter((id) => id !== u._id));
                                                    }
                                                }}
                                            />
                                            <span className="text-sm">
                                                {u.name ?? u.email}
                                                {u.role !== "field" && <span className="text-muted-foreground text-xs ml-1">({ROLE_LABELS[u.role]})</span>}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="leadInstallerNote" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Note for Crew (optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Special access instructions, equipment notes…" className="resize-none min-h-[60px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Internal Notes (optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Scheduling context, logistics…" className="resize-none min-h-[60px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => { form.reset(); onClose(); }}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting
                                    ? "Saving…"
                                    : editing
                                      ? "Save Changes"
                                      : "Schedule Installation"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
