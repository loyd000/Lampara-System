import { useState, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
    useAttachContractDocument,
    useContractsForLead,
    useDeleteContract,
    useMarkContractSigned,
    useUpdateContractDetails,
} from "@/lib/supabase/hooks.ts";
import type { Contract, ContractDetail as ContractDetailData, Id, Lead } from "@/lib/supabase/types.ts";
import type { ContractDetailsInput } from "@/lib/pdf/contract-data.ts";
import DownloadContractPdfButton from "./DownloadContractPdfButton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { QueryError } from "@/components/query-error.tsx";
import {
    Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription,
} from "@/components/ui/empty.tsx";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import {
    FileBadge2,
    CheckCircle2,
    XCircle,
    Upload,
    ExternalLink,
    ArrowLeft,
    ArrowRight,
    Clock,
    FileCheck,
    Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";

type Props = {
    leadId: Id<"leads">;
    lead: Lead;
    stage: string;
    canEdit: boolean;
};

function toFormState(contract: Contract): ContractDetailsInput {
    return {
        homeownerName: contract.homeownerName || "",
        siteAddress: contract.siteAddress || "",
        phoneNumber: contract.phoneNumber || "",
        systemSizeKw: contract.systemSizeKw ?? null,
        panelLine: contract.panelLine || "",
        inverterLine: contract.inverterLine || "",
        batteryLine: contract.batteryLine || "",
        pricePhp: contract.pricePhp ?? null,
        preparedByName: contract.preparedByName || "",
        contractDate: contract.contractDate || "",
    };
}

const STATUS_BADGE: Record<string, string> = {
    pending_signature:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-300 dark:border-amber-700",
    signed:
        "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700",
    cancelled:
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700",
};

const STATUS_LABEL: Record<string, string> = {
    pending_signature: "Pending Signature",
    signed: "Signed",
    cancelled: "Cancelled",
};

/**
 * The Contract tab.
 *
 * A lead can carry more than one contract now — one per quote version it was
 * ever generated from (see 0038_multiple_contracts_per_lead.sql). So the tab
 * opens on the list of them and a contract is something you deliberately
 * open, same as the Ocular Inspection tab already does for its reports.
 *
 * The open contract lives in the URL (`?contract=<id>`), so a link can point
 * at one specific agreement the same way `?tab=` points at this tab.
 */
export default function ContractSection({ leadId, lead, canEdit }: Props) {
    const contractsQuery = useContractsForLead(leadId);
    const { data: contracts } = contractsQuery;
    const [searchParams, setSearchParams] = useSearchParams();

    function openContract(id: string | null) {
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (id) next.set("contract", id);
                else next.delete("contract");
                return next;
            },
            { replace: true },
        );
    }

    function goToQuotes() {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set("tab", "quotes");
            next.delete("contract");
            return next;
        });
    }

    if (contractsQuery.isError) {
        return (
            <QueryError
                title="Couldn't load contracts"
                onRetry={() => void contractsQuery.refetch()}
            />
        );
    }

    if (contracts === undefined) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-9 w-48 rounded-md" />
                <Skeleton className="h-40 w-full rounded-lg" />
            </div>
        );
    }

    // A stale `?contract=` — deleted, or belonging to another lead — falls
    // back to the list rather than an error.
    const openId = searchParams.get("contract");
    const active = openId ? (contracts.find((c) => c._id === openId) ?? null) : null;

    if (active) {
        return (
            <div className="space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => openContract(null)}
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    All contracts
                </Button>

                <ContractDetailView
                    contract={active}
                    lead={lead}
                    canEdit={canEdit}
                    onDeleted={() => openContract(null)}
                />
            </div>
        );
    }

    // ── Nothing yet ───────────────────────────────────────────────────────
    if (contracts.length === 0) {
        return (
            <Empty className="py-8">
                <EmptyHeader>
                    <EmptyMedia variant="icon">
                        <FileBadge2 className="size-6" />
                    </EmptyMedia>
                    <EmptyTitle>No Contract Created Yet</EmptyTitle>
                    <EmptyDescription>
                        Contracts are created from approved solar proposals. Go to
                        the Quotes tab, approve a quote, and click{" "}
                        <strong>"Create Contract"</strong> to initiate this lead's
                        legal agreement.
                    </EmptyDescription>
                </EmptyHeader>
                <Button
                    size="sm"
                    variant="outline"
                    onClick={goToQuotes}
                    className="text-xs h-8"
                >
                    Go to Quotes
                    <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
            </Empty>
        );
    }

    // ── The list ──────────────────────────────────────────────────────────
    // Same shape as the quotes and ocular-report lists: one panel,
    // hairline-separated rows, the row itself opens the contract.
    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="pb-3 border-b">
                    <div className="flex items-center gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <FileBadge2 className="w-4 h-4 text-primary" />
                            Contracts
                        </CardTitle>
                        <Badge variant="secondary" className="text-xs">
                            {contracts.length}
                        </Badge>
                    </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                    {contracts.map((contract, idx) => (
                        <div
                            key={contract._id}
                            role="button"
                            tabIndex={0}
                            onClick={() => openContract(contract._id)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    openContract(contract._id);
                                }
                            }}
                            className={cn(
                                "group -mx-4 px-4 py-3.5 transition-colors cursor-pointer",
                                "hover:bg-muted/40",
                                "md:flex md:items-center md:justify-between md:gap-4",
                                idx > 0 && "border-t border-border",
                            )}
                        >
                            <div className="min-w-0 space-y-1 md:flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                                        {contract.quoteVersion
                                            ? `Quotation v${contract.quoteVersion}`
                                            : "Contract"}
                                    </span>
                                    <Badge
                                        variant="outline"
                                        className={cn(
                                            STATUS_BADGE[contract.status],
                                            "text-xs font-semibold px-2 py-0",
                                        )}
                                    >
                                        {contract.status === "signed" ? (
                                            <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                                        ) : contract.status === "pending_signature" ? (
                                            <Clock className="w-3 h-3 mr-1 inline" />
                                        ) : (
                                            <XCircle className="w-3 h-3 mr-1 inline" />
                                        )}
                                        {STATUS_LABEL[contract.status] || contract.status}
                                    </Badge>
                                </div>

                                <p className="text-xs text-muted-foreground truncate">
                                    Created{" "}
                                    {new Date(contract._creationTime).toLocaleDateString(undefined, {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                    {contract.signedAt && (
                                        <>
                                            {" "}· Signed{" "}
                                            {new Date(contract.signedAt).toLocaleDateString(undefined, {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </>
                                    )}
                                </p>
                            </div>
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    );
}

/** One contract's full detail/edit view — everything the old single-contract tab showed. */
function ContractDetailView({
    contract,
    lead,
    canEdit,
    onDeleted,
}: {
    contract: ContractDetailData;
    lead: Lead;
    canEdit: boolean;
    /** Deleting removes the contract entirely, so the view goes back to the list. */
    onDeleted: () => void;
}) {
    const { mutateAsync: markSigned, isPending: isSigning } = useMarkContractSigned();
    const { mutateAsync: deleteContract, isPending: isDeleting } = useDeleteContract();
    const { mutateAsync: attachDocument } = useAttachContractDocument();
    const { mutateAsync: saveDetails, isPending: isSavingDetails } = useUpdateContractDetails();

    const [uploading, setUploading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [details, setDetails] = useState<ContractDetailsInput>(() => toFormState(contract));
    const [syncedContractId, setSyncedContractId] = useState(contract._id);
    if (contract._id !== syncedContractId) {
        setSyncedContractId(contract._id);
        setDetails(toFormState(contract));
    }

    // 0 counts as missing here: create_contract leaves the column null and the
    // number input shows a null as an empty box, but a stray 0 is just as wrong
    // in "a 0 kW-DC rated system" as no value at all.
    const needsSystemSize = !details.systemSizeKw;
    // Same reasoning, for the number the customer is actually signing to pay —
    // the PDF prints "____" instead of "ZERO PESOS" when this is missing (see
    // contract-data.ts), but that's a last line of defense, not the first
    // place someone should notice.
    const needsPrice = !details.pricePhp;

    function updateField<K extends keyof ContractDetailsInput>(
        field: K,
        value: ContractDetailsInput[K],
    ) {
        setDetails((prev) => ({ ...prev, [field]: value }));
    }

    async function handleSaveDetails() {
        try {
            await saveDetails({ contractId: contract._id, ...details });
            toast.success("Contract details saved");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save contract details");
        }
    }

    async function handleSign() {
        try {
            await markSigned({ contractId: contract._id });
            toast.success("Contract marked as signed — lead converted");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update contract");
        }
    }

    async function handleDelete() {
        try {
            await deleteContract({ contractId: contract._id });
            toast.success("Contract deleted");
            setDeleteDialogOpen(false);
            onDeleted();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete contract");
        }
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        setUploading(true);
        try {
            await attachDocument({ contractId: contract._id, file });
            toast.success("Contract document uploaded");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to upload document");
        } finally {
            setUploading(false);
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3 border-b">
                <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <FileBadge2 className="w-4 h-4 text-primary" />
                        {contract.quoteVersion ? `Quotation v${contract.quoteVersion}` : "Customer Contract"}
                    </CardTitle>
                    <Badge
                        variant="outline"
                        className={cn(
                            STATUS_BADGE[contract.status],
                            "text-xs font-semibold px-2.5 py-0.5",
                        )}
                    >
                        {contract.status === "signed" ? (
                            <CheckCircle2 className="w-3 h-3 mr-1 inline" />
                        ) : contract.status === "pending_signature" ? (
                            <Clock className="w-3 h-3 mr-1 inline" />
                        ) : (
                            <XCircle className="w-3 h-3 mr-1 inline" />
                        )}
                        {STATUS_LABEL[contract.status] || contract.status}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent className="p-4">
                {/* Active contract details */}
                <div className="space-y-5 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-6 lg:space-y-0">
                    {/* The details form is the work; everything else is reference
                        and one-off actions. On a wide screen they sit beside it
                        instead of stacking below and leaving half the row empty. */}
                    <div className="space-y-5 min-w-0">
                        {/* Contract Details — feeds the generated contract PDF.
                            Alone in this column, so no border here — one
                            would double up against the outer Card's own edge.
                            Padding only, no box. */}
                        <div className="space-y-3 p-4">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-foreground block">
                                    Contract Details
                                </label>
                                <span className="text-[11px] text-muted-foreground">
                                    Fills the generated contract document
                                </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <Label className="text-[11px]">Homeowner Name</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        value={details.homeownerName}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("homeownerName", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px]">Phone Number</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        value={details.phoneNumber}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("phoneNumber", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-[11px]">Site Address</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        value={details.siteAddress}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("siteAddress", e.target.value)
                                        }
                                    />
                                </div>
                                {/* Every other field on this form arrives filled
                                    in from the quote. The system size does not —
                                    create_contract has no line item to read it
                                    from — so it is the one box someone has to
                                    notice, and it prints in clause 1 of the
                                    contract. Highlighted until it has a value. */}
                                <div className="space-y-1">
                                    <Label
                                        className={cn(
                                            "text-[11px]",
                                            needsSystemSize && "text-amber-700 dark:text-amber-400 font-semibold",
                                        )}
                                    >
                                        System Size (kW-DC)
                                        {needsSystemSize && (
                                            <span className="ml-1 font-normal">— required</span>
                                        )}
                                    </Label>
                                    <Input
                                        className={cn(
                                            "h-9 text-xs",
                                            needsSystemSize &&
                                                "border-amber-400 bg-amber-50 focus-visible:ring-amber-400/40 dark:border-amber-600 dark:bg-amber-950/30",
                                        )}
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        placeholder="e.g. 7.32"
                                        value={details.systemSizeKw ?? ""}
                                        disabled={!canEdit}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) =>
                                            updateField(
                                                "systemSizeKw",
                                                e.target.value === ""
                                                    ? null
                                                    : Number(e.target.value),
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label
                                        className={cn(
                                            "text-[11px]",
                                            needsPrice && "text-amber-700 dark:text-amber-400 font-semibold",
                                        )}
                                    >
                                        Contract Price (₱)
                                        {needsPrice && (
                                            <span className="ml-1 font-normal">— required</span>
                                        )}
                                    </Label>
                                    <Input
                                        className={cn(
                                            "h-9 text-xs",
                                            needsPrice &&
                                                "border-amber-400 bg-amber-50 focus-visible:ring-amber-400/40 dark:border-amber-600 dark:bg-amber-950/30",
                                        )}
                                        type="number"
                                        inputMode="decimal"
                                        step="0.01"
                                        value={details.pricePhp ?? ""}
                                        disabled={!canEdit}
                                        onWheel={(e) => e.currentTarget.blur()}
                                        onChange={(e) =>
                                            updateField(
                                                "pricePhp",
                                                e.target.value === ""
                                                    ? null
                                                    : Number(e.target.value),
                                            )
                                        }
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-[11px]">Panel Line</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        placeholder="( 12 PCS )  TIER 1 610-630 WATTS"
                                        value={details.panelLine}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("panelLine", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-[11px]">Inverter Line</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        placeholder="( 1 PC/S )  SOLIS S6-EH1P6K L-PRO/PLUS"
                                        value={details.inverterLine}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("inverterLine", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-[11px]">Battery Line</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        placeholder="( 1 PC/S )  PYLONTECH 51.2V 314AH"
                                        value={details.batteryLine}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("batteryLine", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px]">Prepared By</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        value={details.preparedByName}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("preparedByName", e.target.value)
                                        }
                                    />
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[11px]">Contract Date</Label>
                                    <Input
                                        className="h-9 text-xs"
                                        type="date"
                                        value={details.contractDate}
                                        disabled={!canEdit}
                                        onChange={(e) =>
                                            updateField("contractDate", e.target.value)
                                        }
                                    />
                                </div>
                            </div>

                            {canEdit && (
                                // `justify-between` split two related
                                // save actions to opposite edges; both
                                // now sit together on the left.
                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={handleSaveDetails}
                                        disabled={isSavingDetails}
                                    >
                                        {isSavingDetails ? "Saving…" : "Save Details"}
                                    </Button>
                                    <DownloadContractPdfButton
                                        details={details}
                                        firstName={lead.firstName}
                                        lastName={lead.lastName}
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                    />
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="space-y-5 min-w-0">
                        {/* Meta Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4 p-4 rounded-lg bg-muted/20 text-xs">
                            <div>
                                <span className="text-muted-foreground font-medium block">
                                    Associated Proposal
                                </span>
                                <span className="font-semibold text-foreground text-sm mt-0.5 block">
                                    {contract.quoteVersion
                                        ? `Quotation v${contract.quoteVersion}`
                                        : "Quotation Reference"}
                                </span>
                            </div>

                            <div>
                                <span className="text-muted-foreground font-medium block">
                                    Created On
                                </span>
                                <span className="text-foreground text-sm mt-0.5 block">
                                    {new Date(contract._creationTime).toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </span>
                            </div>

                            {contract.signedAt && (
                                <div className="sm:col-span-2 lg:col-span-1 pt-2 border-t">
                                    <span className="text-muted-foreground font-medium block">
                                        Signed Date
                                    </span>
                                    <span className="text-emerald-700 dark:text-emerald-400 font-semibold text-sm mt-0.5 block">
                                        {new Date(contract.signedAt).toLocaleString(undefined, {
                                            year: "numeric",
                                            month: "short",
                                            day: "numeric",
                                            hour: "2-digit",
                                            minute: "2-digit",
                                        })}
                                    </span>
                                </div>
                            )}

                            {contract.notes && (
                                <div className="sm:col-span-2 lg:col-span-1 pt-2 border-t">
                                    <span className="text-muted-foreground font-medium block">
                                        Contract Notes
                                    </span>
                                    <p className="text-foreground text-xs mt-1 whitespace-pre-wrap">
                                        {contract.notes}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Document Section */}
                        <div className="space-y-2 border-t border-border pt-4">
                            <label className="text-xs font-semibold text-foreground block">
                                Contract Document
                            </label>

                            {contract.documentUrl ? (
                                <div className="flex items-center justify-between p-3.5 rounded-lg hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="size-8 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                            <FileCheck className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0">
                                            <span className="font-medium text-xs text-foreground block truncate">
                                                Signed Contract Attachment
                                            </span>
                                            <span className="text-[11px] text-muted-foreground">
                                                Stored securely in Lampara CRM documents
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <a
                                            href={contract.documentUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                                        >
                                            View Document
                                            <ExternalLink className="w-3 h-3" />
                                        </a>

                                        {canEdit && contract.status === "pending_signature" && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-7 text-xs text-muted-foreground"
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={uploading}
                                            >
                                                {uploading ? "Uploading…" : "Replace"}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ) : canEdit ? (
                                <div>
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
                                        className="w-full border-2 border-dashed border-border rounded-lg p-5 flex flex-col items-center justify-center gap-1.5 hover:border-primary/50 hover:bg-muted/20 transition-all cursor-pointer text-muted-foreground disabled:opacity-50"
                                    >
                                        <div className="size-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground mb-1">
                                            <Upload className="w-4 h-4" />
                                        </div>
                                        <span className="text-xs font-medium text-foreground">
                                            {uploading
                                                ? "Uploading signed document…"
                                                : "Upload Signed Contract Document"}
                                        </span>
                                        <span className="text-[11px] text-muted-foreground">
                                            PDF, DOC, or DOCX (max 10 MB)
                                        </span>
                                    </button>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">
                                    No document attached.
                                </p>
                            )}
                        </div>

                        {/* Actions Bar — stacked and centered on mobile,
                            where the sign/delete buttons otherwise
                            crowd onto one too-narrow row; side by side
                            once there's room. */}
                        {canEdit && (
                            <div className="flex flex-col sm:flex-row items-center gap-2 border-t border-border pt-4">
                                {contract.status === "pending_signature" && (
                                    <Button
                                        size="sm"
                                        onClick={handleSign}
                                        disabled={isSigning}
                                        className="h-8 text-xs font-medium"
                                    >
                                        <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                                        {isSigning ? "Updating…" : "Mark Contract as Signed"}
                                    </Button>
                                )}

                                <div className="sm:ml-auto flex items-center gap-2">
                                    <AlertDialog
                                        open={deleteDialogOpen}
                                        onOpenChange={setDeleteDialogOpen}
                                    >
                                        <AlertDialogTrigger asChild>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                                                Delete Contract
                                            </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                            <AlertDialogHeader>
                                                <AlertDialogTitle>Delete this contract?</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                    This will permanently delete the contract record and attached document. You will be able to generate a new one from this quote afterwards.
                                                </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                                <AlertDialogCancel>Keep Contract</AlertDialogCancel>
                                                <AlertDialogAction
                                                    onClick={handleDelete}
                                                    className="bg-destructive hover:bg-destructive/90 text-white"
                                                    disabled={isDeleting}
                                                >
                                                    {isDeleting ? "Deleting…" : "Yes, Delete Contract"}
                                                </AlertDialogAction>
                                            </AlertDialogFooter>
                                        </AlertDialogContent>
                                    </AlertDialog>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
