import { useState } from "react";
import type { FieldErrors } from "react-hook-form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useUpdateLead, useUpdateProperty, useUsers } from "@/lib/supabase/hooks.ts";
import type { Doc, Id } from "@/lib/supabase/types.ts";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
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
    assignedSalesRepId: z.string().optional(),
    // property
    propertyType: z.enum(["residential", "commercial", "industrial"]).optional(),
    propertyNotes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    lead: Doc<"leads"> & { assignedRepName?: string | null };
    property?: Doc<"properties">;
    open: boolean;
    onClose: () => void;
};

function phAddressFromProperty(property?: Doc<"properties">): PhAddressValue {
    if (!property) return EMPTY_PH_ADDRESS;
    return {
        houseUnitBlockLot: property.houseUnitBlockLot ?? "",
        streetName: property.streetName ?? "",
        subdivision: property.subdivision ?? "",
        barangay: property.barangay ?? "",
        cityMunicipality: property.cityMunicipality ?? "",
        province: property.province ?? "",
        zipCode: property.zipCode ?? "",
    };
}

/** Fields rendered on the Property tab; everything else is on Contact. */
const PROPERTY_TAB_FIELDS = new Set(["propertyType", "propertyNotes"]);

export default function EditLeadDialog({ lead, property, open, onClose }: Props) {
    const { mutateAsync: updateLead } = useUpdateLead();
    const { mutateAsync: updateProperty } = useUpdateProperty();
    const { data: users } = useUsers();
    const assignableReps = users?.filter((u) => ["admin", "superadmin"].includes(u.role)) ?? [];

    const [phAddress, setPhAddress] = useState<PhAddressValue>(() => phAddressFromProperty(property));
    const [addressError, setAddressError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    // Controlled, so a validation failure can bring the offending tab forward.
    const [tab, setTab] = useState<"contact" | "property">("contact");

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            firstName: lead.firstName,
            lastName: lead.lastName,
            phone: lead.phone,
            email: lead.email ?? "",
            referredBy: lead.referredBy ?? "",
            notes: lead.notes ?? "",
            assignedSalesRepId: lead.assignedSalesRepId ?? "",
            propertyType: property?.propertyType ?? "residential",
            propertyNotes: property?.notes ?? "",
        },
    });

    // Sync form when the dialog (re)opens for a lead — guarded by identity so
    // it fires once per open, not on every render, which would clobber
    // whatever the user has typed.
    const [syncedKey, setSyncedKey] = useState<string | null>(null);
    const openKey = open ? `${lead._id}|${property?._id ?? ""}` : null;
    if (openKey !== null && syncedKey !== openKey) {
        setSyncedKey(openKey);
        form.reset({
            firstName: lead.firstName,
            lastName: lead.lastName,
            phone: lead.phone,
            email: lead.email ?? "",
            referredBy: lead.referredBy ?? "",
            notes: lead.notes ?? "",
            assignedSalesRepId: lead.assignedSalesRepId ?? "",
            propertyType: property?.propertyType ?? "residential",
            propertyNotes: property?.notes ?? "",
        });
        setPhAddress(phAddressFromProperty(property));
        setAddressError(null);
    }

    /**
      * Radix unmounts the inactive tab panel, so a `FormMessage` for a field on
      * the other tab renders into nothing: the submit button appears to do
      * nothing at all. Bring the tab holding the first error forward instead.
      */
    function onInvalid(errors: FieldErrors<FormValues>) {
        const firstError = Object.keys(errors)[0];
        if (firstError && PROPERTY_TAB_FIELDS.has(firstError)) setTab("property");
        else if (firstError) setTab("contact");
    }

    async function onSubmit(values: FormValues) {
        if (property) {
            const err = validatePhAddress(phAddress);
            if (err) {
                // The address lives on the Property tab; showing this while the
                // Contact tab is open is the same invisible-error problem.
                setTab("property");
                setAddressError(err);
                return;
            }
            setAddressError(null);
        }

        setSubmitting(true);
        try {
            await updateLead({
                id: lead._id,
                firstName: values.firstName,
                lastName: values.lastName,
                phone: values.phone,
                email: values.email || null,
                referredBy: values.referredBy || null,
                notes: values.notes || null,
                assignedSalesRepId: (values.assignedSalesRepId && values.assignedSalesRepId !== "none")
                    ? values.assignedSalesRepId as Id<"users">
                    : null,
            });

            if (property) {
                await updateProperty({
                    propertyId: property._id,
                    ...composeLegacyAddress(phAddress),
                    propertyType: values.propertyType,
                    notes: values.propertyNotes || null,
                    houseUnitBlockLot: phAddress.houseUnitBlockLot,
                    streetName: phAddress.streetName,
                    subdivision: phAddress.subdivision,
                    barangay: phAddress.barangay,
                    cityMunicipality: phAddress.cityMunicipality,
                    province: phAddress.province,
                    zipCode: phAddress.zipCode,
                });
            }

            toast.success("Project updated");
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update project");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Edit Project — {lead.firstName} {lead.lastName}</DialogTitle>
                    <DialogDescription>
                        Update contact details and property information for this project.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit, onInvalid)} className="space-y-4">
                        <Tabs value={tab} onValueChange={(v) => setTab(v as "contact" | "property")}>
                            <TabsList className="w-full">
                                <TabsTrigger value="contact" className="flex-1">Contact</TabsTrigger>
                                <TabsTrigger value="property" className="flex-1">Property</TabsTrigger>
                            </TabsList>

                            <TabsContent value="contact" className="space-y-3 pt-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField control={form.control} name="firstName" render={({ field }) => (
                                        <FormItem><FormLabel>First Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="lastName" render={({ field }) => (
                                        <FormItem><FormLabel>Last Name</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <FormField control={form.control} name="phone" render={({ field }) => (
                                        <FormItem><FormLabel>Phone</FormLabel><FormControl><Input placeholder="0917 123 4567" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                    <FormField control={form.control} name="email" render={({ field }) => (
                                        <FormItem><FormLabel>Email</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                                    )} />
                                </div>
                                <FormField control={form.control} name="referredBy" render={({ field }) => (
                                    <FormItem><FormLabel>Referred By</FormLabel><FormControl><Input placeholder="Optional" {...field} /></FormControl><FormMessage /></FormItem>
                                )} />
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
                                {property ? (
                                    <>
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
                                                <Select onValueChange={field.onChange} value={field.value}>
                                                    <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="residential">Residential</SelectItem>
                                                        <SelectItem value="commercial">Commercial</SelectItem>
                                                        <SelectItem value="industrial">Industrial</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="propertyNotes" render={({ field }) => (
                                            <FormItem><FormLabel>Property Notes</FormLabel><FormControl><Textarea className="resize-none min-h-[80px]" placeholder="Roof age, access notes, etc." {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground py-6 text-center">
                                        This project has no property on record yet.
                                    </p>
                                )}
                            </TabsContent>
                        </Tabs>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting ? "Saving…" : "Save Changes"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
