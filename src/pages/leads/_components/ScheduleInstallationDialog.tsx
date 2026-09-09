import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateInstallation, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
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

const schema = z.object({
    scheduledDate: z.string().min(1, "Please select a date"),
    crewIds: z.array(z.string()).min(1, "Assign at least one crew member"),
    leadInstallerNote: z.string().optional(),
    notes: z.string().optional(),
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
    const crew = users?.filter((u) => ["field", "admin"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            scheduledDate: "",
            crewIds: [],
            leadInstallerNote: "",
            notes: "",
        },
    });

    async function onSubmit(values: FormValues) {
        try {
            await createInstallation({
                leadId,
                scheduledDate: values.scheduledDate,
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
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Schedule Installation</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="scheduledDate" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Installation Date</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

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
                                                {u.role === "admin" && <span className="text-muted-foreground text-xs ml-1">(Admin)</span>}
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
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
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
