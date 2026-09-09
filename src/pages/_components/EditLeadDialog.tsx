import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateLead, useUpdateProperty, useUsers } from "@/lib/supabase/hooks.ts";
import type { Doc, Id } from "@/lib/supabase/types.ts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";

const schema = z.object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    phone: z.string().min(7, "Valid phone required"),
    email: z.string().email().optional().or(z.literal("")),
    source: z.enum(["referral", "facebook_ad", "website_form", "walk_in", "other"]),
    referredBy: z.string().optional(),
    notes: z.string().optional(),
    assignedSalesRepId: z.string().optional(),
    // property
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zip: z.string().optional(),
    propertyType: z.enum(["residential", "commercial", "agricultural"]).optional(),
    propertyNotes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    lead: Doc<"leads"> & { assignedRepName?: string | null };
    property?: Doc<"properties">;
    open: boolean;
    onClose: () => void;
};

export default function EditLeadDialog({ lead, property, open, onClose }: Props) {
    const { mutateAsync: updateLead } = useUpdateLead();
    const { mutateAsync: updateProperty } = useUpdateProperty();
    const { data: users } = useUsers();
    const assignableReps = users?.filter((u) => ["admin", "superadmin"].includes(u.role)) ?? [];

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            phone: lead.phone,
            email: lead.email ?? "",
            source: lead.source,
            referredBy: lead.referredBy ?? "",
            notes: lead.notes ?? "",
            assignedSalesRepId: lead.assignedSalesRepId ?? "",
            address: property?.address ?? "",
            city: property?.city ?? "",
            state: property?.state ?? "",
            zip: property?.zip ?? "",
            propertyType: property?.propertyType ?? "residential",
            propertyNotes: property?.notes ?? "",
        },
    });

    // Sync form when lead changes
    useEffect(() => {
        if (open) {
            form.reset({
                firstName: lead.firstName,
                lastName: lead.lastName,
                phone: lead.phone,
                email: lead.email ?? "",
                source: lead.source,
                referredBy: lead.referredBy ?? "",
                notes: lead.notes ?? "",
                assignedSalesRepId: lead.assignedSalesRepId ?? "",
                address: property?.address ?? "",
                city: property?.city ?? "",
                state: property?.state ?? "",
                zip: property?.zip ?? "",
                propertyType: property?.propertyType ?? "residential",
                propertyNotes: property?.notes ?? "",
            });
        }
        // `form` is stable for the life of the component; re-running this on
        // every render would clobber whatever the user has typed.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, lead, property]);

    async function onSubmit(values: FormValues) {
        try {
            await updateLead({
                id: lead._id,
                firstName: values.firstName,
                lastName: values.lastName,
                phone: values.phone,
                email: values.email || null,
                source: values.source,
                referredBy: values.referredBy || null,
                notes: values.notes || null,
                assignedSalesRepId: (values.assignedSalesRepId && values.assignedSalesRepId !== "none")
                    ? values.assignedSalesRepId as Id<"users">
                    : null,
            });

            if (property) {
                await updateProperty({
                    propertyId: property._id,
                    address: values.address || undefined,
                    city: values.city || undefined,
                    state: values.state || undefined,
                    zip: values.zip || undefined,
                    propertyType: values.propertyType,
                    notes: values.propertyNotes || null,
                });
            }

            toast.success("Lead updated");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update lead");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Lead — {lead.firstName} {lead.lastName}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <Tabs defaultValue="contact">
                            <TabsList className="w-full">
                                <TabsTrigger value="contact" className="flex-1">Contact</TabsTrigger>
                                <TabsTrigger value="property" className="flex-1">Property</TabsTrigger>
                            </TabsList>

                            <TabsContent value="contact" className="space-y-3 pt-2">
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField control={form.control} name="firstName" render={({ field }) => (
                                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="lastName" render={({ field }) => (
                                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField control={form.control} name="phone" render={({ field }) => (
                                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="email" render={({ field }) => (
                                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <FormField control={form.control} name="source" render={({ field }) => (
                                        <FormItem><FormLabel>Source</FormLabel>
                                            <Select onValueChange={field.onChange} value={field.value}>
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
                                    <FormField control={form.control} name="referredBy" render={({ field }) => (
                                        <FormItem><FormLabel>Referred By</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <FormField control={form.control} name="assignedSalesRepId" render={({ field }) => (
                                    <FormItem><FormLabel>Assigned To</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                            <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="none">Unassigned</SelectItem>
                                                {assignableReps.map((u) => (
                                                    <SelectItem key={u._id} value={u._id}>{u.name ?? u.email}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="notes" render={({ field }) => (
                                    <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea className="resize-none min-h-[80px]" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </TabsContent>

                            <TabsContent value="property" className="space-y-3 pt-2">
                                <FormField control={form.control} name="address" render={({ field }) => (
                                    <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                                <div className="grid grid-cols-3 gap-3">
                                    <FormField control={form.control} name="city" render={({ field }) => (
                                        <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="state" render={({ field }) => (
                                        <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="zip" render={({ field }) => (
                                        <FormItem><FormLabel>ZIP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <FormField control={form.control} name="propertyType" render={({ field }) => (
                                    <FormItem><FormLabel>Property Type</FormLabel>
                                        <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="residential">Residential</SelectItem>
                                                <SelectItem value="commercial">Commercial</SelectItem>
                                                <SelectItem value="agricultural">Agricultural</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage /></FormItem>
                                )} />
                                <FormField control={form.control} name="propertyNotes" render={({ field }) => (
                                    <FormItem><FormLabel>Property Notes</FormLabel><FormControl><Textarea className="resize-none min-h-[80px]" placeholder="Roof age, access notes, etc." {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
                            </TabsContent>
                        </Tabs>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Saving…" : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
