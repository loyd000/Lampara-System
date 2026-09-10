import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import type { Lead, Property, SurveyForLead } from "@/lib/supabase/types.ts";
import { Button } from "@/components/ui/button.tsx";
import { leadDocumentName, printPdf } from "@/lib/pdf/print-pdf.ts";

/**
 * Renders one inspection as the printed Site Ocular Report and opens it in the
 * browser's print preview, so whoever saves it picks the filename and folder.
 *
 * `@react-pdf/renderer` is about a megabyte, and most visits to this page never
 * print anything — so it is imported on the click, not with the page. The first
 * print therefore costs a chunk fetch; every later one is instant.
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
            const [{ pdf }, { OcularReport }, { buildReportData }] =
                await Promise.all([
                    import("@react-pdf/renderer"),
                    import("@/lib/pdf/OcularReport.tsx"),
                    import("@/lib/pdf/ocular-data.ts"),
                ]);

            const name = leadDocumentName(
                lead.firstName,
                lead.lastName,
                "Ocular Inspection Report",
            );
            const data = await buildReportData(survey, lead, property);
            const blob = await pdf(
                <OcularReport data={data} docTitle={name} />,
            ).toBlob();

            const how = await printPdf(blob, `${name}.pdf`);
            toast.success(
                how === "printed" ? "Report ready to save" : "Report downloaded",
                { id: toastId },
            );
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
                <Printer className="w-3.5 h-3.5 mr-1.5" />
            )}
            {busy ? "Building…" : "Print / Save"}
        </Button>
    );
}
