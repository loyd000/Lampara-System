import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreatePermit, useUsers } from "@/lib/supabase/hooks.ts";
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
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";

const schema = z.object({
    type: z.enum(["building_permit", "electrical_permit", "hoa_approval", "utility_interconnection", "other"]),
    dueDate: z.string().optional(),
    assignedToId: z.string().optional(),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
};

export default function AddPermitDialog({ open, onClose, leadId }: Props) {
    const { mutateAsync: createPermit } = useCreatePermit();
    const { data: users } = useUsers();
    const officeUsers = users?.filter((u) => ["admin", "superadmin"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            type: "building_permit",
            dueDate: "",
            assignedToId: "",
            notes: "",
        },
    });

    async function onSubmit(values: FormValues) {
        try {
            await createPermit({
                leadId,
                type: values.type,
                dueDate: values.dueDate || undefined,
                // "none" is the Unassigned sentinel in the Select, not a user id.
                assignedToId:
                    values.assignedToId && values.assignedToId !== "none"
                        ? (values.assignedToId as Id<"users">)
                        : undefined,
                notes: values.notes || undefined,
            });
            toast.success("Permit added");
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to add permit");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Add Permit</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="type" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Permit Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="building_permit">Building Permit</SelectItem>
                                        <SelectItem value="electrical_permit">Electrical Permit</SelectItem>
                                        <SelectItem value="hoa_approval">HOA Approval</SelectItem>
                                        <SelectItem value="utility_interconnection">Utility Interconnection</SelectItem>
                                        <SelectItem value="other">Other</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="dueDate" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Due Date (optional)</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="assignedToId" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Assigned To (optional)</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Select staff…" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">Unassigned</SelectItem>
                                        {officeUsers.map((u) => (
                                            <SelectItem key={u._id} value={u._id}>{u.name ?? u.email}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notes (optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Reference numbers, contacts, requirements…" className="resize-none min-h-[60px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Adding…" : "Add Permit"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
