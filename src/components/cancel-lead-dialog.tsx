import { useState } from "react";

import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Label } from "@/components/ui/label.tsx";
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
    // A guard against a double-tap firing onConfirm twice before the close
    // animation has a chance to make the button unclickable for real.
    const [confirming, setConfirming] = useState(false);

    function close(next: boolean) {
        onOpenChange(next);
        if (!next) {
            setConfirming(false);
            // Clear a beat after the close animation, not during it.
            setTimeout(() => setReason(""), 200);
        }
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
                <div className="space-y-1.5">
                    <Label htmlFor="cancel-reason">Reason</Label>
                    <Textarea
                        id="cancel-reason"
                        autoFocus
                        placeholder="Optional, but worth leaving one"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="min-h-[88px] text-sm"
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => close(false)}>
                        Back
                    </Button>
                    <Button
                        variant="destructive"
                        disabled={confirming}
                        onClick={() => {
                            setConfirming(true);
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
