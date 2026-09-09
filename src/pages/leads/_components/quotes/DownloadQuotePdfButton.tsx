import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { useSurveysForLead } from "@/lib/supabase/hooks.ts";
import type { Id, Lead, Property, QuoteWithItems } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Downloads the itemised Quote PDF, built with `@react-pdf/renderer`.
 *
 * Lazy-loads the heavy PDF renderer only on click so lead page loads stay instantaneous.
 */
export default function DownloadQuotePdfButton({
    quote,
    lead,
    property,
    size = "sm",
    variant = "outline",
    className,
}: {
    quote: QuoteWithItems;
    lead: Lead;
    property?: Property;
    size?: "sm" | "default" | "icon";
    variant?: "outline" | "default" | "ghost" | "secondary";
    className?: string;
}) {
    const [busy, setBusy] = useState(false);
    const { data: surveys } = useSurveysForLead(lead._id as Id<"leads">);

    async function handleDownload(e: React.MouseEvent) {
        e.stopPropagation();
        setBusy(true);
        const toastId = toast.loading("Generating Quote PDF…");

        try {
            const [{ pdf }, { QuotePdf }, { buildQuotePdfData, quotePdfFileName }] =
                await Promise.all([
                    import("@react-pdf/renderer"),
                    import("@/lib/pdf/QuotePdf.tsx"),
                    import("@/lib/pdf/quote-data.ts"),
                ]);

            const data = await buildQuotePdfData(quote, lead, property, surveys);
            const blob = await pdf(<QuotePdf data={data} />).toBlob();

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = quotePdfFileName(quote, lead);
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            toast.success("Quote PDF downloaded", { id: toastId });
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "Failed to generate Quote PDF",
                { id: toastId },
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <Button
            size={size}
            variant={variant}
            className={className}
            onClick={handleDownload}
            disabled={busy}
        >
            {busy ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
            )}
            {busy ? "Generating…" : "Download PDF"}
        </Button>
    );
}
