import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAttachContractDocument, useCreateContract } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import {
    Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Upload, FileText, X } from "lucide-react";

const schema = z.object({
    notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
    quoteId: Id<"quotes">;
};

export default function CreateContractDialog({ open, onClose, leadId, quoteId }: Props) {
    const { mutateAsync: createContract } = useCreateContract();
    const { mutateAsync: attachDocument } = useAttachContractDocument();
    const [docFile, setDocFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [, setSearchParams] = useSearchParams();

    const form = useForm<FormValues>({
        resolver: zodResolver(schema),
        defaultValues: { notes: "" },
    });

    function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (file) setDocFile(file);
        e.target.value = "";
    }

    async function onSubmit(values: FormValues) {
        setUploading(true);
        let contractId: string | undefined;
        try {
            contractId = await createContract({
                leadId,
                quoteId,
                notes: values.notes || undefined,
            });
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Failed to create contract";
            toast.error(msg);
            setUploading(false);
            return;
        }

        // The contract now exists — a document-upload failure from here on is a
        // separate, recoverable problem (the Contract tab's own dropzone can
        // retry it), not a reason to tell the user contract creation failed or
        // to leave this dialog open inviting a duplicate contract.
        if (docFile) {
            try {
                await attachDocument({ contractId, file: docFile });
                toast.success("Contract created and document attached — lead advanced to Contract Signed");
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to attach the document";
                toast.error(`Contract created, but the document didn't upload: ${msg}`);
            }
        } else {
            toast.success("Contract created — lead advanced to Contract Signed");
        }

        setUploading(false);
        form.reset();
        setDocFile(null);
        onClose();

        // Switch to the Contracts tab so the user sees the new contract immediately!
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "contracts");
            next.delete("quote");
            return next;
        });
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(v) => {
                if (!v) {
                    form.reset();
                    setDocFile(null);
                    onClose();
                }
            }}
        >
            <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Create Contract</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            This will create a contract based on the accepted quote and advance this lead to <strong>Contract Signed</strong>.
                        </p>

                        {/* Document upload */}
                        <div>
                            <p className="text-sm font-medium mb-2">Contract Document (optional)</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.doc,.docx"
                                className="hidden"
                                onChange={handleFileChange}
                            />
                            {docFile ? (
                                <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/30">
                                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                    <span className="text-sm truncate flex-1">{docFile.name}</span>
                                    <button type="button" onClick={() => setDocFile(null)} className="text-muted-foreground hover:text-destructive">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-full border-2 border-dashed border-border rounded-lg py-5 flex flex-col items-center gap-1.5 hover:border-primary/40 hover:bg-muted/30 transition-colors cursor-pointer"
                                >
                                    <Upload className="w-5 h-5 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">Upload PDF or Word document</span>
                                </button>
                            )}
                        </div>

                        <FormField control={form.control} name="notes" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Internal Notes (optional)</FormLabel>
                                <FormControl>
                                    <Textarea placeholder="Special terms, conditions, or notes…" className="resize-none min-h-[70px]" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )} />

                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => { form.reset(); setDocFile(null); onClose(); }}>Cancel</Button>
                            <Button type="submit" disabled={form.formState.isSubmitting || uploading}>
                                {uploading ? (
                                    <><Upload className="w-3.5 h-3.5 mr-1.5 animate-pulse" />Uploading…</>
                                ) : "Create Contract"}
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
