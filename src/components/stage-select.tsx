import {
    STAGE_GROUPS,
    STAGE_GROUP_LABELS,
    STAGE_LABELS,
    groupOf,
    type Stage,
    type StageGroup,
} from "@/lib/constants.ts";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { cn } from "@/lib/utils.ts";

const GROUPS = Object.keys(STAGE_GROUPS) as StageGroup[];

/**
 * Two-step stage control: Main Status (New / In Progress / Completed), then
 * the Substatus within it. A single flat dropdown of all ten stages made the
 * main status invisible — pick "Contract Signed" from a long list and you'd
 * never notice it also meant "In Progress" until you knew to look.
 *
 * Fully controlled off `value` alone (no internal state): changing the Main
 * Status jumps straight to that group's first substage, which the caller
 * sees on the next render as `value` changing — same as picking a substatus
 * directly. A group with one member (today, just "New Lead" → "lead") still
 * shows its own Substatus select for a consistent shape, just with nothing
 * else to pick.
 */
export default function StageSelect({
    value,
    onChange,
    size = "default",
    className,
}: {
    value: Stage;
    onChange: (stage: Stage) => void;
    size?: "default" | "sm";
    className?: string;
}) {
    const currentGroup = groupOf(value);

    return (
        <div className={cn("flex items-center gap-1.5", className)}>
            <Select
                value={currentGroup}
                onValueChange={(group) => onChange(STAGE_GROUPS[group as StageGroup][0])}
            >
                <SelectTrigger
                    className={cn("shrink-0", size === "sm" ? "h-8 text-[11px] w-32" : "w-40")}
                    aria-label="Main status"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {GROUPS.map((group) => (
                        <SelectItem key={group} value={group} className={size === "sm" ? "text-xs" : undefined}>
                            {STAGE_GROUP_LABELS[group]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select value={value} onValueChange={(stage) => onChange(stage as Stage)}>
                <SelectTrigger
                    className={cn("min-w-0 flex-1", size === "sm" ? "h-8 text-[11px]" : "")}
                    aria-label="Substatus"
                >
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {STAGE_GROUPS[currentGroup].map((s) => (
                        <SelectItem key={s} value={s} className={size === "sm" ? "text-xs" : undefined}>
                            {STAGE_LABELS[s]}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
