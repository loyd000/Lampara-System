import { useState, useRef } from "react";
import {
    useAttachContractDocument,
    useContractForLead,
    useMarkContractCancelled,
    useMarkContractSigned,
} from "@/lib/supabase/hooks.ts";
import type { Id } from "@/lib/supabase/types.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
    FileBadge2, CheckCircle2, XCircle, Upload, FileText, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

type Props = {
    leadId: Id<"leads">;
    stage: string;
    canEdit: boolean;
};

const STATUS_BADGE: Record<string, string> = {
    pending_signature: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    signed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const STATUS_LABEL: Record<string, string> = {
    pending_signature: "Pending Signature",
    signed: "Signed",
    cancelled: "Cancelled",
};

export default function ContractSection({ leadId, stage, canEdit }: Props) {
    const { data: contract } = useContractForLead(leadId);
    const { mutateAsync: markSigned } = useMarkContractSigned();
    const { mutateAsync: markCancelled } = useMarkContractCancelled();
    const { mutateAsync: attachDocument } = useAttachContractDocument();
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Contract section is unlocked once a contract is created (contract_signed stage +)
    const isUnlocked = !["lead", "survey_scheduled", "survey_completed", "proposal_sent"].includes(stage);

    async function handleSign() {
        if (!contract) return;
        try {
            await markSigned({ contractId: contract._id });
            toast.success("Contract marked as signed");
        } catch { toast.error("Failed to update contract"); }
    }

    async function handleCancel() {
        if (!contract) return;
        try {
            await markCancelled({ contractId: contract._id });
            toast.success("Contract cancelled");
        } catch { toast.error("Failed to cancel contract"); }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        if (!contract) return;
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        setUploading(true);
        try {
            await attachDocument({ contractId: contract._id, file });
            toast.success("Document uploaded");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to upload document");
        } finally { setUploading(false); }
    }

    return (
        <Card className={cn(!isUnlocked && "opacity-60")}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                    <FileBadge2 className="w-4 h-4 text-muted-foreground" />Contract
                </CardTitle>
            </CardHeader>
            <CardContent>
                {!isUnlocked ? (
                    <p className="text-xs text-muted-foreground">Contract is created after a quote is accepted.</p>
                ) : contract === undefined ? (
                    <Skeleton className="h-16 w-full" />
                ) : contract === null ? (
                    <p className="text-xs text-muted-foreground">No contract yet. Accept a quote above to create one.</p>
                ) : (
                    <div className="space-y-3">
                        {/* Status row */}
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <Badge className={cn(STATUS_BADGE[contract.status], "text-[10px]")}>
                                    {STATUS_LABEL[contract.status]}
                                </Badge>
                                {contract.quoteVersion && (
                                    <span className="text-xs text-muted-foreground">Quote v{contract.quoteVersion}</span>
                                )}
                            </div>
                            {contract.signedAt && (
                                <span className="text-xs text-muted-foreground">
                                    Signed {new Date(contract.signedAt).toLocaleDateString()}
                                </span>
                            )}
                        </div>

                        {/* Document */}
                        {contract.documentUrl ? (
                            <a
                                href={contract.documentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2.5 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors text-sm"
                            >
                                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-xs">View Contract Document</span>
                                <ExternalLink className="w-3 h-3 text-muted-foreground" />
                            </a>
                        ) : canEdit && (
                            <>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={uploading}
                                    className="w-full border-2 border-dashed border-border rounded-lg py-3 flex items-center justify-center gap-1.5 hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer text-xs text-muted-foreground disabled:opacity-50"
                                >
                                    <Upload className="w-3.5 h-3.5" />
                                    {uploading ? "Uploading…" : "Upload signed document"}
                                </button>
                            </>
                        )}

                        {/* Notes */}
                        {contract.notes && (
                            <p className="text-xs text-muted-foreground">{contract.notes}</p>
                        )}

                        {/* Actions */}
                        {canEdit && contract.status === "pending_signature" && (
                            <div className="flex gap-2 pt-1">
                                <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20"
                                    onClick={handleSign}>
                                    <CheckCircle2 className="w-3 h-3 mr-1" />Mark Signed
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive"
                                    onClick={handleCancel}>
                                    <XCircle className="w-3 h-3 mr-1" />Cancel
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
