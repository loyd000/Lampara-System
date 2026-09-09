// TEMPORARY — Ocular report list preview. Delete before committing.
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ChevronRight, ClipboardCheck, Plus } from "lucide-react";
import { SURVEY_STATUS_COLORS, SURVEY_STATUS_LABELS } from "@/lib/constants.ts";
import { cn } from "@/lib/utils.ts";

const rows = [
    { id: "1", at: "2026-09-04T10:00:00", status: "scheduled", who: "Carlo Abanilla", sub: "Not started" },
    { id: "2", at: "2026-08-21T14:30:00", status: "submitted", who: "Carlo Abanilla", sub: "9 photos" },
    { id: "3", at: "2026-08-08T09:00:00", status: "approved", who: "Mark Villanueva", sub: "14 photos" },
    { id: "4", at: "2026-07-30T08:00:00", status: "cancelled", who: "Mark Villanueva", sub: "Cancelled" },
];

export default function Preview() {
    return (
        <div className="p-6 max-w-7xl mx-auto space-y-10">
            <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted-foreground">{rows.length} reports</p>
                    <Button size="sm">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Make ocular report
                    </Button>
                </div>
                <ul className="border-y divide-y divide-border">
                    {rows.map((r) => (
                        <li key={r.id}>
                            <button
                                type="button"
                                className="group w-full flex items-start gap-3 px-2 py-4 text-left rounded-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                            >
                                <div className="flex-1 min-w-0 space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-sm font-medium text-foreground">
                                            {new Date(r.at).toLocaleString(undefined, {
                                                weekday: "short",
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                        <Badge
                                            className={cn(
                                                SURVEY_STATUS_COLORS[r.status],
                                                "text-[10px] font-semibold",
                                            )}
                                        >
                                            {SURVEY_STATUS_LABELS[r.status]}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {r.who} · {r.sub}
                                    </p>
                                </div>
                                <ChevronRight className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground/50 group-hover:text-foreground transition-colors" />
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <div className="rounded-lg border border-dashed px-6 py-14 flex flex-col items-center gap-2 text-center">
                    <ClipboardCheck className="w-8 h-8 text-muted-foreground/30" />
                    <p className="font-medium text-foreground">No reports yet</p>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        A site ocular inspection records the roof, the electrical setup and the
                        photos the quote is built from.
                    </p>
                    <Button size="sm" className="mt-3">
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Make ocular report
                    </Button>
                </div>
            </section>
        </div>
    );
}
