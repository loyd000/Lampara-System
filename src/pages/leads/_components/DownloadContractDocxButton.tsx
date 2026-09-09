import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { ContractDocxData } from "@/lib/docx/contract-data.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Generates the contract DOCX from `public/Contract Template.docx` and
 * downloads it. Lazy-loads docxtemplater/pizzip only on click, same reasoning
 * as the quote/ocular PDF download buttons — most lead page visits never
 * generate a document.
 */
export default function DownloadContractDocxButton({
    data,
    fileName,
    size = "sm",
    variant = "outline",
    className,
}: {
    data: ContractDocxData;
    fileName: string;
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
            const { generateContractDocx } = await import("@/lib/docx/generate-contract.ts");
            const blob = await generateContractDocx(data);

            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();

            setTimeout(() => URL.revokeObjectURL(url), 10_000);
            toast.success("Contract document downloaded", { id: toastId });
        } catch (e) {
            toast.error(
                e instanceof Error ? e.message : "Failed to generate the contract document",
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
            {busy ? "Generating…" : "Generate Contract (.docx)"}
        </Button>
    );
}
