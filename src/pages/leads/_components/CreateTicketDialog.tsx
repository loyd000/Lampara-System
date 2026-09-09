import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateTicket, useUsers } from "@/lib/supabase/hooks.ts";
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
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";

const schema = z.object({
    title: z.string().min(1, "Required"),
    description: z.string().min(1, "Required"),
    priority: z.enum(["low", "medium", "high"]),
    assignedToId: z.string().optional(),
    scheduledVisitAt: z.string().optional(),
    warrantyRelated: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
    installationId: Id<"installations">;
};

export default function CreateTicketDialog({ open, onClose, leadId, installationId }: Props) {
    const { mutateAsync: createTicket } = useCreateTicket();
    const { data: users } = useUsers();
    const assignableUsers = users?.filter((u) => ["admin", "office", "field"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            title: "",
            description: "",
            priority: "medium",
            assignedToId: "",
            scheduledVisitAt: "",
            warrantyRelated: false,
        },
    });

    async function onSubmit(values: FormValues) {
        try {
            await createTicket({
                leadId,
                installationId,
                title: values.title,
                description: values.description,
                priority: values.priority,
                // "none" is the Unassigned sentinel in the Select, not a user id.
                assignedToId:
                    values.assignedToId && values.assignedToId !== "none"
                        ? (values.assignedToId as Id<"users">)
                        : undefined,
                scheduledVisitAt: values.scheduledVisitAt
                    ? new Date(values.scheduledVisitAt).toISOString()
                    : undefined,
                warrantyRelated: values.warrantyRelated,
            });
            toast.success("Service ticket created");
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create ticket");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Service Ticket</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField control={form.control} name="title" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Title</FormLabel>
                                <FormControl><Input placeholder="e.g. Panel output below expected" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="description" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Describe the issue in detail…" className="resize-none min-h-[80px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="priority" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Priority</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="low">Low</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />

                            <FormField control={form.control} name="assignedToId" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Assign To</FormLabel>
                                    <Select onValueChange={field.onChange} value={field.value}>
                                        <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="none">Unassigned</SelectItem>
                                            {assignableUsers.map((u) => (
                                                <SelectItem key={u._id} value={u._id}>{u.name ?? u.email}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <FormField control={form.control} name="scheduledVisitAt" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Scheduled Visit (optional)</FormLabel>
                                <FormControl><Input type="datetime-local" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="warrantyRelated" render={({ field }) => (
                            <FormItem>
                                <div className="flex items-center gap-2">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <FormLabel className="!mt-0 cursor-pointer">Warranty-related issue</FormLabel>
                                </div>
                            </FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Creating…" : "Create Ticket"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
