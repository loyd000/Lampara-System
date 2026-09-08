import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateLead, useCurrentUser, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

const schema = z.object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    phone: z.string().min(7, "Valid phone required"),
    email: z.string().email().optional().or(z.literal("")),
    source: z.enum(["referral", "facebook_ad", "website_form", "walk_in", "other"]),
    referredBy: z.string().optional(),
    notes: z.string().optional(),
    address: z.string().min(1, "Required"),
    city: z.string().min(1, "Required"),
    state: z.string().min(2, "Required"),
    zip: z.string().min(4, "Required"),
    propertyType: z.enum(["residential", "commercial", "agricultural"]),
    assignedSalesRepId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = { open: boolean; onClose: () => void };

export default function CreateLeadDialog({ open, onClose }: Props) {
    const { mutateAsync: createLead } = useCreateLead();
    const { data: users } = useUsers();
    const { data: currentUser } = useCurrentUser();
    const salesReps = users?.filter(u => ["sales", "admin"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName: "", lastName: "", phone: "", email: "", source: "website_form",
            address: "", city: "", state: "", zip: "", propertyType: "residential",
        },
    });

    async function onSubmit(values: FormValues) {
        try {
            await createLead({
                ...values,
                email: values.email || undefined,
                assignedSalesRepId: values.assignedSalesRepId
                    ? (values.assignedSalesRepId as Id<"users">)
                    : undefined,
            });
            toast.success("Lead created successfully");
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create lead");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Lead</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="firstName" render={({ field }) => (
                                <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="Jane" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="lastName" render={({ field }) => (
                                <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Smith" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="phone" render={({ field }) => (
                                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="+1 555 000 0000" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input placeholder="jane@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="source" render={({ field }) => (
                                <FormItem><FormLabel>Lead Source</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="website_form">Website Form</SelectItem>
                                            <SelectItem value="referral">Referral</SelectItem>
                                            <SelectItem value="facebook_ad">Facebook Ad</SelectItem>
                                            <SelectItem value="walk_in">Walk-in</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage /></FormItem>
                            )} />
                            {currentUser?.role !== "sales" && (
                                <FormField control={form.control} name="assignedSalesRepId" render={({ field }) => (
                                    <FormItem><FormLabel>Assign to Sales Rep</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                {salesReps.map(u => (
                                                    <SelectItem key={u._id} value={u._id}>{u.name ?? u.email}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage /></FormItem>
                                )} />
                            )}
                        </div>

                        <p className="text-sm font-semibold text-muted-foreground pt-1">Property / Site</p>
                        <FormField control={form.control} name="address" render={({ field }) => (
                            <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input placeholder="123 Solar Way" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />
                        <div className="grid grid-cols-3 gap-4">
                            <FormField control={form.control} name="city" render={({ field }) => (
                                <FormItem><FormLabel>City</FormLabel><FormControl><Input placeholder="Sunnyvale" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="state" render={({ field }) => (
                                <FormItem><FormLabel>State</FormLabel><FormControl><Input placeholder="CA" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="zip" render={({ field }) => (
                                <FormItem><FormLabel>ZIP</FormLabel><FormControl><Input placeholder="94086" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <FormField control={form.control} name="propertyType" render={({ field }) => (
                            <FormItem><FormLabel>Property Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="residential">Residential</SelectItem>
                                        <SelectItem value="commercial">Commercial</SelectItem>
                                        <SelectItem value="agricultural">Agricultural</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="Any initial notes…" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Creating…" : "Create Lead"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
