import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useScheduleSurvey, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { toast } from "sonner";
import { INSPECTION_LABEL } from "@/lib/constants.ts";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";

const schema = z.object({
    assignedSurveyorId: z.string().min(1, "Please select a surveyor"),
    scheduledAt: z.string().min(1, "Please select a date and time"),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
    propertyId: Id<"properties">;
};

export default function ScheduleSurveyDialog({ open, onClose, leadId, propertyId }: Props) {
    const { mutateAsync: scheduleSurvey } = useScheduleSurvey();
    const { data: users } = useUsers();
    const technicians = users?.filter((u) => ["field", "admin"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { assignedSurveyorId: "", scheduledAt: "" },
    });

    async function onSubmit(values: FormValues) {
        try {
            await scheduleSurvey({
                leadId,
                propertyId,
                assignedSurveyorId: values.assignedSurveyorId as Id<"users">,
                scheduledAt: new Date(values.scheduledAt).toISOString(),
            });
            toast.success("Inspection scheduled");
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to schedule inspection");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Schedule {INSPECTION_LABEL}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="assignedSurveyorId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Assign Technician</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select technician…" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {technicians.map((u) => (
                                            <SelectItem key={u._id} value={u._id}>
                                                {u.name ?? u.email} {u.role === "admin" ? "(Admin)" : ""}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <FormField control={form.control} name="scheduledAt" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Date & Time</FormLabel>
                                <FormControl>
                                    <Input type="datetime-local" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Scheduling…" : "Schedule Inspection"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
