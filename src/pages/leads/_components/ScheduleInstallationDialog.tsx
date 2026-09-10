import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateInstallation, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { ROLE_LABELS } from "@/lib/constants.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";

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
};

export default function ScheduleInstallationDialog({ open, onClose, leadId }: Props) {
    const { mutateAsync: createInstallation } = useCreateInstallation();
    const { data: users } = useUsers();
    const crew = users?.filter((u) => ["field", "admin", "superadmin"].includes(u.role)) ?? [];

    // `useWatch` rather than `form.watch()` in render: watch() returns a fresh
    // function-backed value each render, which React Compiler refuses to
    // memoize and warns about.
    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            scheduledDate: "",
            scheduledEndDate: "",
            crewIds: [],
            leadInstallerNote: "",
            notes: "",
        },
    });

    const startDate = useWatch({ control: form.control, name: "scheduledDate" });

    async function onSubmit(values: FormValues) {
        try {
            await createInstallation({
                leadId,
                scheduledDate: values.scheduledDate,
                scheduledEndDate: values.scheduledEndDate,
                assignedCrewIds: values.crewIds as Id<"users">[],
                leadInstallerNote: values.leadInstallerNote || undefined,
                notes: values.notes || undefined,
            });
            toast.success("Installation scheduled");
            form.reset();
            onClose();
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to schedule installation";
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
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Schedule Installation</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        {/* `min-w-0` on the cells: a native date input's intrinsic
                            width is wider than half a phone screen, and grid items
                            default to `min-width: auto`, so without it the row
                            overflows instead of shrinking. */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="min-w-0">
                                <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Date</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="date"
                                                {...field}
                                                onChange={(e) => {
                                                    field.onChange(e);
                                                    // Most installs are one day, and a
                                                    // finish date that trails the start
                                                    // is never what someone meant.
                                                    const end = form.getValues("scheduledEndDate");
                                                    if (!end || end < e.target.value) {
                                                        form.setValue("scheduledEndDate", e.target.value, {
                                                            shouldValidate: true,
                                                        });
                                                    }
                                                }}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                            <div className="min-w-0">
                                <FormField control={form.control} name="scheduledEndDate" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Finish Date</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="date"
                                                min={startDate || undefined}
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </div>
                        </div>

                        <FormField control={form.control} name="crewIds" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Assign Crew</FormLabel>
                                <div className="space-y-2 rounded-md border p-3 max-h-40 overflow-y-auto">
                                    {crew.length === 0 ? (
                                        <p className="text-xs text-muted-foreground">No technicians found</p>
                                    ) : crew.map((u) => (
                                        <div key={u._id} className="flex items-center gap-2">
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
                                            <label htmlFor={u._id} className="text-sm cursor-pointer">
                                                {u.name ?? u.email}
                                                {u.role !== "field" && <span className="text-muted-foreground text-xs ml-1">({ROLE_LABELS[u.role]})</span>}
                                            </label>
                                        </div>
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
                                {form.formState.isSubmitting ? "Scheduling…" : "Schedule Installation"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
