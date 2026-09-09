import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { Lead, Property, SurveyForLead } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Renders one inspection as the printed Site Ocular Report and saves it.
 *
 * `@react-pdf/renderer` is about a megabyte, and most visits to this page never
 * print anything — so it is imported on the click, not with the page. The first
 * download therefore costs a chunk fetch; every later one is instant.
 */
export default function DownloadReportButton({
    survey,
    lead,
    property,
}: {
    survey: SurveyForLead;
    lead: Lead;
    property: Property | undefined;
}) {
    const [busy, setBusy] = useState(false);

    async function handleDownload() {
        setBusy(true);
        const toastId = toast.loading("Building the report…");
        try {
            const [{ pdf }, { OcularReport }, { buildReportData, reportFileName }] =
                await Promise.all([
                    import("@react-pdf/renderer"),
                    import("@/lib/pdf/OcularReport.tsx"),
                    import("@/lib/pdf/ocular-data.ts"),
                ]);

            const data = await buildReportData(survey, lead, property);
            const blob = await pdf(<OcularReport data={data} />).toBlob();

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = reportFileName(survey, lead);
            document.body.appendChild(a);
            a.click();
            a.remove();
            // Give the browser a moment to start the save before revoking.
            setTimeout(() => URL.revokeObjectURL(url), 10_000);

            toast.success("Report downloaded", { id: toastId });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not build the report", {
                id: toastId,
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={handleDownload}
            disabled={busy}
        >
            {busy ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
            )}
            {busy ? "Building…" : "Download PDF"}
        </Button>
    );
}
