import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, Download, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
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
import { OcularFormFields } from "@/pages/leads/_components/ocular/OcularFormFields.tsx";
import { emptyFormValues, type FormValues } from "@/pages/leads/_components/ocular/formValues.ts";
import { deleteDraft, getDraft, listDrafts, saveDraft, type OfflineDraft } from "@/lib/offlineForm/drafts.ts";
import { exportDraft } from "@/lib/offlineForm/export.ts";
import { COMPANY_NAME } from "@/lib/constants.ts";

/**
 * A deliberately disconnected page: no Supabase calls, no React Query, no
 * login check, no dependency on `navigator.onLine`. Everything here reads
 * and writes plain `localStorage`. Imported eagerly in App.tsx (not
 * React.lazy) and routed outside the authenticated app shell, so it's
 * reachable the instant the app's JS has loaded at all — online, offline, or
 * from a cold start with a device that's never had signal today.
 *
 * See docs/plans/Offline_Export_Import_plan.md for why this exists.
 */
export default function OfflineReportPage() {
    const [drafts, setDrafts] = useState<OfflineDraft[]>(() => listDrafts());
    const [openId, setOpenId] = useState<string | null | "new">(null);

    function refresh() {
        setDrafts(listDrafts());
    }

    if (openId !== null) {
        return (
            <DraftEditor
                draftId={openId === "new" ? null : openId}
                onBack={() => {
                    setOpenId(null);
                    refresh();
                }}
            />
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-6">
                <header className="space-y-1.5">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ArrowLeft className="size-3.5" />
                        {COMPANY_NAME}
                    </Link>
                    <h1 className="text-2xl font-bold tracking-[-0.02em] text-foreground">
                        Offline Ocular Reports
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Fill out a report with no signal. Save it here, export it, and once
                        you're back online, import it into the real project from its Ocular
                        Inspection tab.
                    </p>
                </header>

                <Button onClick={() => setOpenId("new")} className="w-full sm:w-auto">
                    <Plus className="size-4 mr-1.5" />
                    New Report
                </Button>

                <div className="space-y-2">
                    {drafts.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            No offline reports saved on this device yet.
                        </div>
                    ) : (
                        drafts.map((draft) => (
                            <DraftRow
                                key={draft.id}
                                draft={draft}
                                onOpen={() => setOpenId(draft.id)}
                                onDeleted={refresh}
                            />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function DraftRow({
    draft,
    onOpen,
    onDeleted,
}: {
    draft: OfflineDraft;
    onOpen: () => void;
    onDeleted: () => void;
}) {
    const [exporting, setExporting] = useState(false);

    async function handleExport(e: React.MouseEvent) {
        e.stopPropagation();
        setExporting(true);
        try {
            await exportDraft(draft);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not export this report");
        } finally {
            setExporting(false);
        }
    }

    return (
        <div
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onOpen();
                }
            }}
            className="flex items-center justify-between gap-3 rounded-lg bg-card border border-border p-4 cursor-pointer hover:border-foreground/25 transition-colors"
        >
            <div className="min-w-0 flex items-start gap-3">
                <div className="mt-0.5 flex items-center justify-center rounded-md size-8 shrink-0 bg-muted text-muted-foreground">
                    <ClipboardCheck className="size-4" />
                </div>
                <div className="min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                        {draft.customerName || "Untitled report"}
                    </p>
                    {draft.address && (
                        <p className="text-xs text-muted-foreground truncate">{draft.address}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                        Saved {new Date(draft.savedAt).toLocaleString()}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    title="Export"
                    onClick={(e) => void handleExport(e)}
                    disabled={exporting}
                >
                    {exporting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                        <Download className="size-3.5" />
                    )}
                </Button>
                <AlertDialog>
                    <AlertDialogTrigger asChild>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Delete"
                        >
                            <Trash2 className="size-3.5" />
                        </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete this offline report?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This only removes it from this device — export it first if you
                                haven't yet. This cannot be undone.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-destructive hover:bg-destructive/90 text-white"
                                onClick={() => {
                                    deleteDraft(draft.id);
                                    onDeleted();
                                }}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    );
}

function DraftEditor({ draftId, onBack }: { draftId: string | null; onBack: () => void }) {
    const existing = draftId ? getDraft(draftId) : undefined;
    const idRef = useRef(existing?.id ?? crypto.randomUUID());
    const [customerName, setCustomerName] = useState(existing?.customerName ?? "");
    const [address, setAddress] = useState(existing?.address ?? "");
    const [note, setNote] = useState(existing?.note ?? "");
    const [locating, setLocating] = useState(false);
    const [exporting, setExporting] = useState(false);

    const form = useForm<FormValues>({ defaultValues: existing?.values ?? emptyFormValues() });
    const { control, register, getValues, setValue } = form;

    function currentDraft(): OfflineDraft {
        return {
            id: idRef.current,
            customerName,
            address,
            note,
            values: getValues(),
            savedAt: new Date().toISOString(),
        };
    }

    function handleSave() {
        saveDraft(currentDraft());
        toast.success("Saved on this device");
    }

    async function handleExport() {
        setExporting(true);
        try {
            const draft = currentDraft();
            saveDraft(draft); // export always saves first, so what's on disk matches what's exported
            await exportDraft(draft);
            toast.success("Exported — find it in Files, or wherever you shared it to");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not export this report");
        } finally {
            setExporting(false);
        }
    }

    function useMyLocation() {
        if (!navigator.geolocation) {
            toast.error("This device cannot report a location");
            return;
        }
        setLocating(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setValue("latitude", String(pos.coords.latitude));
                setValue("longitude", String(pos.coords.longitude));
                setLocating(false);
                toast.success("Coordinates captured");
            },
            (err) => {
                setLocating(false);
                toast.error(
                    err.code === err.PERMISSION_DENIED
                        ? "Location permission denied"
                        : "Could not read this device's location",
                );
            },
            { enableHighAccuracy: true, timeout: 10000 },
        );
    }

    return (
        <div className="min-h-screen bg-background pb-24">
            <div className="mx-auto max-w-2xl p-4 sm:p-6 space-y-4">
                <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={onBack}
                >
                    <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
                    All offline reports
                </Button>

                <div className="rounded-lg bg-card border border-border p-4 space-y-3">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Customer name
                        </Label>
                        <Input
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Who this report is for"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Site address (optional)
                        </Label>
                        <Input value={address} onChange={(e) => setAddress(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">
                            Note (optional)
                        </Label>
                        <Textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            placeholder="Anything to help match this to the right project later"
                            className="text-sm"
                        />
                    </div>
                </div>

                <OcularFormFields
                    control={control}
                    register={register}
                    disabled={false}
                    onUseMyLocation={useMyLocation}
                    locating={locating}
                />
            </div>

            {/* Fixed, not the app's UnsavedChangesBar — this page has no
                sticky-footer layout convention of its own to hook into (it
                sits outside AppLayout entirely). */}
            <div className="fixed bottom-0 inset-x-0 border-t border-border bg-background/95 backdrop-blur-sm p-3">
                <div className="mx-auto max-w-2xl flex gap-2">
                    <Button variant="outline" className="flex-1" onClick={handleSave}>
                        <Save className="size-4 mr-1.5" />
                        Save Draft
                    </Button>
                    <Button className="flex-1" onClick={() => void handleExport()} disabled={exporting}>
                        {exporting ? (
                            <Loader2 className="size-4 mr-1.5 animate-spin" />
                        ) : (
                            <Download className="size-4 mr-1.5" />
                        )}
                        {exporting ? "Exporting…" : "Save & Export"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
