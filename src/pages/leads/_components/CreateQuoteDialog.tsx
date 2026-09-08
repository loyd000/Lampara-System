import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateQuote } from "@/lib/supabase/hooks.ts";
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
    panelCount: z.string().min(1, "Required"),
    panelModel: z.string().min(1, "Required"),
    inverterType: z.string().min(1, "Required"),
    systemSizeKw: z.string().min(1, "Required"),
    totalPriceUsd: z.string().min(1, "Required"),
    financingOption: z.enum(["cash", "loan", "lease", "ppa"]),
    validUntil: z.string().optional(),
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
};

export default function CreateQuoteDialog({ open, onClose, leadId }: Props) {
    const { mutateAsync: createQuote } = useCreateQuote();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            panelCount: "",
            panelModel: "",
            inverterType: "",
            systemSizeKw: "",
            totalPriceUsd: "",
            financingOption: "cash",
            validUntil: "",
            notes: "",
        },
    });

    async function onSubmit(values: FormValues) {
        const panelCount = parseInt(values.panelCount, 10);
        const systemSizeKw = parseFloat(values.systemSizeKw);
        const totalPrice = parseFloat(values.totalPriceUsd);

        if (isNaN(panelCount) || panelCount < 1) {
            form.setError("panelCount", { message: "Enter a valid number" }); return;
        }
        if (isNaN(systemSizeKw) || systemSizeKw <= 0) {
            form.setError("systemSizeKw", { message: "Enter a valid number" }); return;
        }
        if (isNaN(totalPrice) || totalPrice <= 0) {
            form.setError("totalPriceUsd", { message: "Enter a valid amount" }); return;
        }

        try {
            await createQuote({
                leadId,
                panelCount,
                panelModel: values.panelModel,
                inverterType: values.inverterType,
                systemSizeKw,
                totalPriceUsd: totalPrice,
                financingOption: values.financingOption,
                validUntil: values.validUntil || undefined,
                notes: values.notes || undefined,
            });
            toast.success("Quote created");
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create quote");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>New Quote</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                        {/* System specs */}
                        <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="panelCount" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Panel Count</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g. 24" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="systemSizeKw" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>System Size (kW)</FormLabel>
                                    <FormControl><Input type="number" step="0.1" placeholder="e.g. 8.5" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <FormField control={form.control} name="panelModel" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Panel Model</FormLabel>
                                <FormControl><Input placeholder="e.g. Canadian Solar HiKu7 400W" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="inverterType" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Inverter</FormLabel>
                                <FormControl><Input placeholder="e.g. SolarEdge SE7600H" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Pricing */}
                        <div className="grid grid-cols-2 gap-3">
                            <FormField control={form.control} name="totalPriceUsd" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Total Price (USD)</FormLabel>
                                    <FormControl><Input type="number" placeholder="e.g. 28500" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="financingOption" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Financing</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="cash">Cash</SelectItem>
                                            <SelectItem value="loan">Loan</SelectItem>
                                            <SelectItem value="lease">Lease</SelectItem>
                                            <SelectItem value="ppa">PPA</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <FormField control={form.control} name="validUntil" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Valid Until (optional)</FormLabel>
                                <FormControl><Input type="date" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Notes (optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Any special terms, discounts, or notes…" className="resize-none min-h-[70px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting}>
                                {form.formState.isSubmitting ? "Creating…" : "Create Quote"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
