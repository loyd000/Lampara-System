import { useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Clock, ImageOff, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { useAddSurveyPhotos, useDeleteSurveyPhoto } from "@/lib/supabase/hooks.ts";
import type { Id, SurveyPhoto, SurveyPhotoCategory } from "@/lib/supabase/types.ts";
import { SURVEY_PHOTO_SLOTS } from "@/lib/constants.ts";
import { Button } from "@/components/ui/button.tsx";
import { useIsOnline } from "@/lib/offline/network.ts";
import { addPhotosOffline } from "@/lib/offline/survey-repository.ts";
import { isNetworkError } from "@/lib/offline/sync-engine.ts";
import { offlineDb, type QueuedPhoto } from "@/lib/offline/db.ts";

/**
 * The photo half of the Site Ocular Report.
 *
 * The printed report gives each photo a heading — a shot of the Meralco meter
 * is not interchangeable with a shot of the roof — so photos are uploaded into
 * named slots rather than into one pile. That is also what lets the PDF in
 * Phase 3 lay the pages out without anyone having to sort the images by hand.
 */
export default function PhotoSlots({
    surveyId,
    photos,
    editable,
}: {
    surveyId: Id<"surveys">;
    photos: SurveyPhoto[];
    editable: boolean;
}) {
    const byCategory = new Map<string, SurveyPhoto[]>();
    for (const photo of photos) {
        const list = byCategory.get(photo.category) ?? [];
        list.push(photo);
        byCategory.set(photo.category, list);
    }

    return (
        <div className="space-y-4">
            {SURVEY_PHOTO_SLOTS.map((slot) => (
                <Slot
                    key={slot.key}
                    surveyId={surveyId}
                    category={slot.key as SurveyPhotoCategory}
                    label={slot.label}
                    hint={slot.hint}
                    max={slot.max}
                    photos={byCategory.get(slot.key) ?? []}
                    editable={editable}
                />
            ))}
        </div>
    );
}

function Slot({
    surveyId,
    category,
    label,
    hint,
    max,
    photos,
    editable,
}: {
    surveyId: Id<"surveys">;
    category: SurveyPhotoCategory;
    label: string;
    hint?: string;
    max: number;
    photos: SurveyPhoto[];
    editable: boolean;
}) {
    const { mutateAsync: addPhotos } = useAddSurveyPhotos();
    const { mutateAsync: deletePhoto } = useDeleteSurveyPhoto();
    const isOnline = useIsOnline();
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const queuedPhotos =
        useLiveQuery(
            () =>
                offlineDb.photoQueue
                    .where("surveyId")
                    .equals(surveyId)
                    .filter((p) => p.category === category)
                    .sortBy("sortOrder"),
            [surveyId, category],
        ) ?? [];

    const full = photos.length + queuedPhotos.length >= max;

    async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const picked = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (!picked.length) return;

        // The slot's cap mirrors the printed layout, so trim rather than
        // uploading photos the report has nowhere to put.
        const room = max - photos.length - queuedPhotos.length;
        const files = picked.slice(0, room);
        if (picked.length > room) {
            toast.warning(`${label} holds ${max} photo${max !== 1 ? "s" : ""} — kept the first ${room}`);
        }
        if (!files.length) return;

        if (!isOnline) {
            setUploading(true);
            try {
                await addPhotosOffline({ surveyId, category, files });
                toast.success(
                    `${files.length} photo${files.length !== 1 ? "s" : ""} saved locally — will sync when back online`,
                );
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not save photo");
            } finally {
                setUploading(false);
            }
            return;
        }

        setUploading(true);
        try {
            const saved = await addPhotos({ surveyId, category, files });
            if (saved < files.length) {
                toast.warning(`Uploaded ${saved} of ${files.length} — try the rest again`);
            } else {
                toast.success(`${saved} photo${saved !== 1 ? "s" : ""} added to ${label}`);
            }
        } catch (err) {
            // `isOnline` (navigator.onLine) is a hint, not a guarantee —
            // Android WebView in particular can report "online" while
            // genuinely unreachable. A network failure here means nothing
            // uploaded yet (addSurveyPhotos only throws when the very first
            // file fails), so it's safe to queue the whole batch offline
            // instead of surfacing a raw fetch error with no recovery.
            if (isNetworkError(err)) {
                try {
                    await addPhotosOffline({ surveyId, category, files });
                    toast.success(
                        `${files.length} photo${files.length !== 1 ? "s" : ""} saved locally — will sync when back online`,
                    );
                } catch (offlineErr) {
                    toast.error(offlineErr instanceof Error ? offlineErr.message : "Could not save photo");
                }
            } else {
                toast.error(err instanceof Error ? err.message : "Upload failed");
            }
        } finally {
            setUploading(false);
        }
    }

    async function handleDelete(photo: SurveyPhoto) {
        try {
            await deletePhoto({ photoId: photo._id, path: photo.path });
            toast.success("Photo removed");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not remove photo");
        }
    }

    return (
        // `bg-card shadow-sm`, not a hard border: these slots sit bare on the
        // page (not nested inside another bordered Card), so a soft shadow —
        // the same weight the Card primitive itself uses — reads as a panel
        // without the harder boxed-in look a border line gives.
        <div className="rounded-lg bg-card shadow-sm p-4">
            <div className="flex items-start justify-between gap-3 mb-2.5">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{label}</p>
                    {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                        {photos.length + queuedPhotos.length}/{max}
                    </span>
                    {editable && (
                        <>
                            <input
                                ref={inputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={handleFiles}
                            />
                            <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 text-xs"
                                onClick={() => inputRef.current?.click()}
                                disabled={uploading || full}
                                title={full ? `This slot already holds ${max}` : undefined}
                            >
                                {uploading ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                    <Camera className="w-3.5 h-3.5 mr-1" />
                                )}
                                {uploading ? "Uploading…" : "Add"}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {photos.length === 0 && queuedPhotos.length === 0 ? (
                // No dashed box nested inside the slot's own panel — the panel
                // already provides the boundary; this is just its empty state.
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                    <ImageOff className="w-3.5 h-3.5 opacity-50" />
                    {editable ? "No photo yet" : "Not provided"}
                </div>
            ) : (
                <div className="flex flex-wrap gap-2">
                    {photos.map((photo) => (
                        <div key={photo._id} className="relative group">
                            {photo.url ? (
                                <a href={photo.url} target="_blank" rel="noopener noreferrer">
                                    <img
                                        src={photo.url}
                                        alt={photo.caption ?? label}
                                        loading="lazy"
                                        className="w-24 h-24 object-cover rounded-md border hover:opacity-80 transition-opacity"
                                    />
                                </a>
                            ) : (
                                <div className="w-24 h-24 rounded-md border grid place-content-center bg-muted/30">
                                    <ImageOff className="w-4 h-4 text-muted-foreground/50" />
                                </div>
                            )}
                            {editable && (
                                <button
                                    type="button"
                                    onClick={() => handleDelete(photo)}
                                    aria-label={`Remove photo from ${label}`}
                                    className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-1 shadow-sm hover:bg-destructive/90 transition-colors"
                                >
                                    <X className="w-3 h-3" />
                                </button>
                            )}
                        </div>
                    ))}
                    {queuedPhotos.map((photo) => (
                        <QueuedPhotoThumb key={photo.id} photo={photo} label={label} />
                    ))}
                </div>
            )}
        </div>
    );
}

/** A locally-queued, not-yet-synced photo — rendered from its Blob via an
 *  object URL, with a small clock badge so it reads as "not synced yet"
 *  rather than a broken/missing image. */
function QueuedPhotoThumb({ photo, label }: { photo: QueuedPhoto; label: string }) {
    const url = useMemo(() => URL.createObjectURL(photo.blob), [photo.blob]);

    useEffect(() => () => URL.revokeObjectURL(url), [url]);

    return (
        <div className="relative">
            <img
                src={url}
                alt={label}
                className="w-24 h-24 object-cover rounded-md border opacity-80"
            />
            <span
                title="Not synced yet — will upload when back online"
                className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-1 shadow-sm"
            >
                <Clock className="w-3 h-3" />
            </span>
        </div>
    );
}
