import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateLead, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
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
import { Label } from "@/components/ui/label.tsx";
import { Separator } from "@/components/ui/separator.tsx";
import PhilippineAddressFields from "@/components/ph-address-fields.tsx";
import {
    composeLegacyAddress,
    EMPTY_PH_ADDRESS,
    validatePhAddress,
    type PhAddressValue,
} from "@/lib/ph-address.ts";

const schema = z.object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    phone: z.string().min(7, "Valid phone required"),
    email: z.string().email().optional().or(z.literal("")),
    referredBy: z.string().optional(),
    notes: z.string().optional(),
    propertyType: z.enum(["residential", "commercial", "industrial"]),
    assignedSalesRepId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = { open: boolean; onClose: () => void };

export default function CreateLeadDialog({ open, onClose }: Props) {
    const { mutateAsync: createLead } = useCreateLead();
    const { data: users } = useUsers();
    // Everyone who can create a lead is admin/superadmin now — no self-hiding
    // rule like the old "sales reps only assign to themselves" behaviour.
    const assignableReps = users?.filter(u => ["admin", "superadmin"].includes(u.role)) ?? [];

    const [phAddress, setPhAddress] = useState<PhAddressValue>(EMPTY_PH_ADDRESS);
    const [addressError, setAddressError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName: "", lastName: "", phone: "", email: "",
            propertyType: "residential",
        },
    });

    function resetAll() {
        form.reset();
        setPhAddress(EMPTY_PH_ADDRESS);
        setAddressError(null);
    }

    async function onSubmit(values: FormValues) {
        const err = validatePhAddress(phAddress);
        if (err) {
            setAddressError(err);
            return;
        }
        setAddressError(null);

        setSubmitting(true);
        try {
            await createLead({
                ...values,
                email: values.email || undefined,
                assignedSalesRepId: values.assignedSalesRepId
                    ? (values.assignedSalesRepId as Id<"users">)
                    : undefined,
                ...composeLegacyAddress(phAddress),
                houseUnitBlockLot: phAddress.houseUnitBlockLot,
                streetName: phAddress.streetName,
                subdivision: phAddress.subdivision || undefined,
                barangay: phAddress.barangay,
                cityMunicipality: phAddress.cityMunicipality,
                province: phAddress.province,
                zipCode: phAddress.zipCode,
            });
            toast.success("Project created successfully");
            resetAll();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create project");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    resetAll();
                    onClose();
                }
            }}
        >
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Project</DialogTitle>
                    <DialogDescription>
                        Add a new project and their property to the system.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField control={form.control} name="firstName" render={({ field }) => (
                                <FormItem><FormLabel>First Name</FormLabel><FormControl><Input placeholder="Jane" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="lastName" render={({ field }) => (
                                <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input placeholder="Smith" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <FormField control={form.control} name="phone" render={({ field }) => (
                                <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="0917 123 4567" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                            <FormField control={form.control} name="email" render={({ field }) => (
                                <FormItem><FormLabel>Email (optional)</FormLabel><FormControl><Input placeholder="jane@example.com" {...field} /></FormControl><FormMessage /></FormItem>
                            )} />
                        </div>
                        <FormField control={form.control} name="assignedSalesRepId" render={({ field }) => (
                            <FormItem><FormLabel>Assign To</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        {assignableReps.map(u => (
                                            <SelectItem key={u._id} value={u._id}>{u.name ?? u.email}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage /></FormItem>
                        )} />

                        <Separator />
                        <Label className="text-sm font-semibold">Property / Site</Label>
                        <PhilippineAddressFields
                            value={phAddress}
                            onChange={(v) => {
                                setPhAddress(v);
                                setAddressError(null);
                            }}
                            error={addressError}
                        />

                        <FormField control={form.control} name="propertyType" render={({ field }) => (
                            <FormItem><FormLabel>Property Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="residential">Residential</SelectItem>
                                        <SelectItem value="commercial">Commercial</SelectItem>
                                        <SelectItem value="industrial">Industrial</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage /></FormItem>
                        )} />
                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem><FormLabel>Notes</FormLabel><FormControl><Textarea placeholder="Any initial notes…" {...field} /></FormControl><FormMessage /></FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => { resetAll(); onClose(); }}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Creating…" : "Create Project"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
