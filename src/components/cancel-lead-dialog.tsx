import { useState } from "react";

import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";

/**
 * The prompt that stands between a lead and the `cancelled` stage.
 *
 * Shared because cancelling has to mean the same thing wherever it is done.
 * It used to live inline on the lead detail page, which meant dragging a card
 * to Cancelled on the Pipeline board — the same business event — wrote a null
 * reason and nobody noticed: `cancelled_reason` ended up populated or not
 * based on which screen someone happened to be looking at.
 *
 * Owns the reason text itself and clears it on close, so a caller only has to
 * decide *when* to ask and what to do with the answer.
 */
export default function CancelLeadDialog({
    open,
    onOpenChange,
    onConfirm,
    leadName,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Reason is optional — the prompt asks, it does not insist. */
    onConfirm: (reason: string | undefined) => void;
    /** Named in the copy when known; the Pipeline board cancels in bulk context. */
    leadName?: string;
}) {
    const [reason, setReason] = useState("");

    function close(next: boolean) {
        onOpenChange(next);
        // Clear a beat after the close animation, not during it.
        if (!next) setTimeout(() => setReason(""), 200);
    }

    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cancel this lead?</DialogTitle>
                    <DialogDescription>
                        {leadName ? `${leadName} moves` : "This lead moves"} to Completed as
                        Cancelled. Say why — this is the only place that reason lives.
                    </DialogDescription>
                </DialogHeader>
                <Textarea
                    autoFocus
                    placeholder="Reason (optional, but worth leaving one)"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="min-h-[88px] text-sm"
                />
                <DialogFooter>
                    <Button variant="ghost" onClick={() => close(false)}>
                        Back
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={() => {
                            onConfirm(reason.trim() || undefined);
                            close(false);
                        }}
                    >
                        Cancel Lead
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
