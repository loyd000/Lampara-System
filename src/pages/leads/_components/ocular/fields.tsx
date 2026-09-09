import { useId } from "react";

import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx";
import { cn } from "@/lib/utils.ts";

/**
 * Field primitives for the Site Ocular Report.
 *
 * The printed form draws every group as a tick box, but half of them are
 * exclusive (Morning / Evening / Both) and half are not (a roof can be steel
 * *and* concrete). Radios for the exclusive ones and checkboxes for the rest
 * makes that difference visible instead of leaving it to be learned.
 */

// ─── A labelled text / number input ───────────────────────────────────────

export function TextField({
    label,
    suffix,
    className,
    ...props
}: React.ComponentProps<typeof Input> & { label: string; suffix?: string }) {
    const generated = useId();
    const id = props.id ?? generated;
    return (
        <div className={cn("space-y-1.5", className)}>
            <Label htmlFor={id} className="text-xs font-medium text-muted-foreground">
                {label}
            </Label>
            <div className="relative">
                <Input id={id} {...props} className={cn("h-9", suffix && "pr-10")} />
                {suffix && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                        {suffix}
                    </span>
                )}
            </div>
        </div>
    );
}

// ─── Exclusive choice ─────────────────────────────────────────────────────

export function ChoiceField({
    label,
    options,
    value,
    onChange,
    disabled,
    columns = 3,
    className,
}: {
    label: string;
    options: Record<string, string>;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    columns?: number;
    className?: string;
}) {
    const name = useId();
    return (
        <div className={cn("space-y-2", className)}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <RadioGroup
                value={value}
                onValueChange={onChange}
                disabled={disabled}
                className={cn(
                    "grid gap-x-4 gap-y-2",
                    columns === 2 && "grid-cols-2",
                    columns === 3 && "grid-cols-2 sm:grid-cols-3",
                    columns === 4 && "grid-cols-2 sm:grid-cols-4",
                )}
            >
                {Object.entries(options).map(([key, optionLabel]) => {
                    const id = `${name}-${key}`;
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <RadioGroupItem value={key} id={id} />
                            <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                                {optionLabel}
                            </Label>
                        </div>
                    );
                })}
            </RadioGroup>
        </div>
    );
}

// ─── Multiple choice ──────────────────────────────────────────────────────

export function MultiChoiceField({
    label,
    options,
    value,
    onChange,
    disabled,
    columns = 3,
    className,
}: {
    label: string;
    options: Record<string, string>;
    value: string[];
    onChange: (value: string[]) => void;
    disabled?: boolean;
    columns?: number;
    className?: string;
}) {
    const name = useId();
    function toggle(key: string, checked: boolean) {
        onChange(checked ? [...value, key] : value.filter((v) => v !== key));
    }
    return (
        <div className={cn("space-y-2", className)}>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <div
                className={cn(
                    "grid gap-x-4 gap-y-2",
                    columns === 2 && "grid-cols-2",
                    columns === 3 && "grid-cols-2 sm:grid-cols-3",
                    columns === 4 && "grid-cols-2 sm:grid-cols-4",
                )}
            >
                {Object.entries(options).map(([key, optionLabel]) => {
                    const id = `${name}-${key}`;
                    return (
                        <div key={key} className="flex items-center gap-2">
                            <Checkbox
                                id={id}
                                checked={value.includes(key)}
                                onCheckedChange={(c) => toggle(key, c === true)}
                                disabled={disabled}
                            />
                            <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
                                {optionLabel}
                            </Label>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Yes / No ─────────────────────────────────────────────────────────────

export function YesNoField(props: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <ChoiceField
            {...props}
            options={{ yes: "Yes", no: "No" }}
            columns={2}
        />
    );
}

// ─── An appliance: tick plus a free line ──────────────────────────────────

export function ApplianceField({
    label,
    checked,
    onCheckedChange,
    note,
    onNoteChange,
    disabled,
}: {
    label: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    note: string;
    onNoteChange: (note: string) => void;
    disabled?: boolean;
}) {
    const id = useId();
    return (
        // Wraps on a phone: an <input> will not shrink below its intrinsic
        // ~20-character width, so a fixed-width label beside one on a 375px
        // screen pushes the whole page into a horizontal scroll. Below `sm` the
        // note drops onto its own full-width line instead.
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <Checkbox
                id={id}
                checked={checked}
                onCheckedChange={(c) => onCheckedChange(c === true)}
                disabled={disabled}
            />
            <Label
                htmlFor={id}
                className="text-sm font-normal cursor-pointer min-w-0 flex-1 sm:w-32 sm:flex-none"
            >
                {label}
            </Label>
            <Input
                value={note}
                onChange={(e) => onNoteChange(e.target.value)}
                // The blank line next to each tick on the paper form: quantity,
                // horsepower, whatever the technician thinks is worth noting.
                placeholder="qty / notes"
                disabled={disabled || !checked}
                className="h-8 text-sm w-full min-w-0 sm:w-auto sm:flex-1"
            />
        </div>
    );
}

// ─── A headed block, matching a bordered section on the paper form ────────

export function FieldBlock({
    title,
    children,
    className,
}: {
    title: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("space-y-4 rounded-lg border p-4", className)}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {title}
            </p>
            {children}
        </div>
    );
}
