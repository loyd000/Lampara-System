import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ContractDetailsInput } from "@/lib/pdf/contract-data.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Generates the Photovoltaic Installation Contract PDF and downloads it.
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
            const [{ pdf }, { ContractPdf }, { buildContractPdfData, contractPdfFileName }] =
                await Promise.all([
                    import("@react-pdf/renderer"),
                    import("@/lib/pdf/ContractPdf.tsx"),
                    import("@/lib/pdf/contract-data.ts"),
                ]);

            const blob = await pdf(
                <ContractPdf data={buildContractPdfData(details)} />,
            ).toBlob();

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = contractPdfFileName(firstName, lastName);
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            toast.success("Contract PDF downloaded", { id: toastId });
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
                <FileDown className="w-3.5 h-3.5 mr-1.5" />
            )}
            {busy ? "Generating…" : "Generate Contract PDF"}
        </Button>
    );
}
