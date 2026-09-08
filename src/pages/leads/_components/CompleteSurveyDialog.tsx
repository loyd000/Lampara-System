import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCompleteSurvey } from "@/lib/supabase/hooks.ts";
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
import { Camera, X, Upload } from "lucide-react";

const schema = z.object({
    roofType: z.enum(["asphalt_shingle", "metal", "tile", "flat", "other"]),
    estimatedSystemSizeKw: z.string().min(1, "Required"),
    roofAgeYears: z.string().optional(),
    shadingNotes: z.string().optional(),
    additionalNotes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    surveyId: Id<"surveys">;
};

export default function CompleteSurveyDialog({ open, onClose, surveyId }: Props) {
    const { mutateAsync: completeSurvey } = useCompleteSurvey();
    const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: {
            roofType: "asphalt_shingle",
            estimatedSystemSizeKw: "",
            roofAgeYears: "",
            shadingNotes: "",
            additionalNotes: "",
        },
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const files = Array.from(e.target.files ?? []);
        const newPhotos = files.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
        }));
        setPhotos((prev) => [...prev, ...newPhotos]);
        e.target.value = "";
    }

    function removePhoto(idx: number) {
        setPhotos((prev) => {
            URL.revokeObjectURL(prev[idx].preview);
            return prev.filter((_, i) => i !== idx);
        });
    }

    async function onSubmit(values: FormValues) {
        const kwNum = parseFloat(values.estimatedSystemSizeKw);
        if (isNaN(kwNum) || kwNum <= 0) {
            form.setError("estimatedSystemSizeKw", { message: "Enter a valid number" });
            return;
        }
        const ageNum = values.roofAgeYears ? parseInt(values.roofAgeYears, 10) : undefined;
        setUploading(true);
        try {
            // The data layer uploads to Supabase Storage and records the object
            // paths on the survey row — no separate upload-URL round trip.
            await completeSurvey({
                surveyId,
                roofType: values.roofType,
                estimatedSystemSizeKw: kwNum,
                roofAgeYears: ageNum,
                shadingNotes: values.shadingNotes,
                additionalNotes: values.additionalNotes,
                photos: photos.map((p) => p.file),
            });
            toast.success("Survey completed");
            photos.forEach((p) => URL.revokeObjectURL(p.preview));
            setPhotos([]);
            form.reset();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to complete survey");
        } finally {
            setUploading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Complete Site Survey</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <FormField control={form.control} name="roofType" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Roof Type</FormLabel>
                                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                        <SelectContent>
                                            <SelectItem value="asphalt_shingle">Asphalt Shingle</SelectItem>
                                            <SelectItem value="metal">Metal</SelectItem>
                                            <SelectItem value="tile">Tile</SelectItem>
                                            <SelectItem value="flat">Flat</SelectItem>
                                            <SelectItem value="other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )} />
                            <FormField control={form.control} name="estimatedSystemSizeKw" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>System Size (kW)</FormLabel>
                                    <FormControl><Input type="number" step="0.1" placeholder="e.g. 8.5" {...field} /></FormControl>
                                    <FormMessage />
                                </FormItem>
                            )} />
                        </div>

                        <FormField control={form.control} name="roofAgeYears" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Roof Age (years, optional)</FormLabel>
                                <FormControl><Input type="number" placeholder="e.g. 12" {...field} /></FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="shadingNotes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Shading Notes</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Describe shading from trees, chimneys, neighboring buildings…"
                                        className="resize-none min-h-[70px]"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <FormField control={form.control} name="additionalNotes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Additional Notes</FormLabel>
                                <FormControl>
                                    <Textarea
                                        placeholder="Electrical panel condition, access notes, obstacles…"
                                        className="resize-none min-h-[70px]"
                                        {...field}
                                    />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        {/* Photo upload */}
                        <div>
                            <p className="text-sm font-medium mb-2">Roof Photos</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            <div className="flex flex-wrap gap-2">
                                {photos.map((p, i) => (
                                    <div key={i} className="relative w-20 h-20">
                                        <img
                                            src={p.preview}
                                            alt={`Photo ${i + 1}`}
                                            className="w-20 h-20 object-cover rounded-lg border"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removePhoto(i)}
                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:opacity-80"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-20 h-20 border-2 border-dashed border-border rounded-lg flex flex-col items-center justify-center gap-1 hover:border-primary/50 hover:bg-muted/40 transition-colors cursor-pointer"
                                >
                                    <Camera className="w-5 h-5 text-muted-foreground" />
                                    <span className="text-[10px] text-muted-foreground">Add photo</span>
                                </button>
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting || uploading}>
                                {uploading ? (
                                    <><Upload className="w-3.5 h-3.5 mr-1.5 animate-pulse" />Uploading…</>
                                ) : form.formState.isSubmitting ? "Saving…" : "Mark Complete"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
