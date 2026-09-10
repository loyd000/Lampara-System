import { useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { toast } from "sonner";

import type { ContractDetailsInput } from "@/lib/pdf/contract-data.ts";
import { Button } from "@/components/ui/button.tsx";
import { leadDocumentName, printPdf } from "@/lib/pdf/print-pdf.ts";

/**
 * Generates the Photovoltaic Installation Contract PDF and opens it in the
 * browser's print preview, so whoever saves it chooses the filename and folder.
 *
 * Lazy-loads the renderer and the document only on click, same reasoning as the
 * quote and ocular PDF buttons — most lead page visits never generate one.
 */
export default function DownloadContractPdfButton({
    details,
    firstName,
    lastName,
    size = "sm",
    variant = "outline",
    className,
}: {
    details: ContractDetailsInput;
    firstName: string;
    lastName: string;
    size?: "sm" | "default" | "icon";
    variant?: "outline" | "default" | "ghost" | "secondary";
    className?: string;
}) {
    const [busy, setBusy] = useState(false);

    async function handleDownload(e: React.MouseEvent) {
        e.stopPropagation();
        setBusy(true);
        const toastId = toast.loading("Generating Contract…");

        try {
            const [{ pdf }, { ContractPdf }, { buildContractPdfData }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("@/lib/pdf/ContractPdf.tsx"),
                import("@/lib/pdf/contract-data.ts"),
            ]);

            const name = leadDocumentName(firstName, lastName, "Contract");
            const blob = await pdf(
                <ContractPdf data={buildContractPdfData(details)} docTitle={name} />,
            ).toBlob();

            const how = await printPdf(blob, `${name}.pdf`);
            toast.success(
                how === "printed" ? "Contract ready to save" : "Contract PDF downloaded",
                { id: toastId },
            );
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "Failed to generate the contract",
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
                <Printer className="w-3.5 h-3.5 mr-1.5" />
            )}
            {busy ? "Generating…" : "Print / Save Contract"}
        </Button>
    );
}
