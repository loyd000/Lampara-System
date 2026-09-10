import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCreateContract } from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { toast } from "sonner";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";

type Props = {
    open: boolean;
    onClose: () => void;
    leadId: Id<"leads">;
    quoteId: Id<"quotes">;
};

/**
 * Confirms creating the lead's contract from an approved quote.
 *
 * Deliberately just a confirmation: the contract document is generated from
 * the Contract tab's own details form, and a signed copy is attached there, so
 * asking for an upload or notes at creation time only offered two ways to do
 * the same thing a step too early.
 */
export default function CreateContractDialog({ open, onClose, leadId, quoteId }: Props) {
    const { mutateAsync: createContract } = useCreateContract();
    const [creating, setCreating] = useState(false);
    const [, setSearchParams] = useSearchParams();

    async function handleCreate() {
        setCreating(true);
        try {
            await createContract({ leadId, quoteId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to create contract");
            setCreating(false);
            return;
        }

        toast.success("Contract created — lead advanced to Contract Signed");
        setCreating(false);
        onClose();

        // Switch to the Contracts tab so the user sees the new contract immediately.
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "contracts");
            next.delete("quote");
            return next;
        });
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Create Contract</DialogTitle>
                </DialogHeader>

                <p className="text-sm text-muted-foreground">
                    This creates a contract based on the approved quote and advances this
                    lead to <strong>Contract Signed</strong>. You can fill in the contract
                    details and generate the PDF from the Contracts tab.
                </p>

                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button type="button" onClick={handleCreate} disabled={creating}>
                        {creating ? "Creating…" : "Create Contract"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
