import { Bell } from "lucide-react";
import { toast } from "sonner";

import {
    useMyNotificationPreferences,
    useUpdateMyNotificationPreferences,
} from "@/lib/supabase/hooks.ts";
import type { NotificationPreferences } from "@/lib/supabase/queries/notifications.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

const ROWS: Array<{ key: keyof NotificationPreferences; label: string; hint: string }> = [
    {
        key: "leadAssigned",
        label: "Lead assigned to me",
        hint: "A new lead is created or reassigned to you",
    },
    {
        key: "inspectionScheduled",
        label: "Inspection scheduled",
        hint: "You're assigned to a site ocular inspection",
    },
    {
        key: "installationScheduled",
        label: "Installation scheduled",
        hint: "You're on the crew for an installation",
    },
    {
        key: "quoteAccepted",
        label: "Quote approved",
        hint: "A quote on one of your leads is approved",
    },
    {
        key: "contractSigned",
        label: "Contract signed",
        hint: "A contract on one of your leads is signed",
    },
];

/**
 * Your own email-notification switches — every event defaults to on, so a row
 * missing from the database (never opened this card before) reads the same
 * as every switch here starting checked.
 */
export default function NotificationPreferencesCard() {
    const { data: prefs, isLoading } = useMyNotificationPreferences();
    const { mutateAsync: update } = useUpdateMyNotificationPreferences();

    async function handleToggle(key: keyof NotificationPreferences, value: boolean) {
        try {
            await update({ [key]: value });
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to save preference");
        }
    }

    return (
        <Card>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="w-4 h-4 text-muted-foreground" />
                    Email Notifications
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
                {isLoading || !prefs ? (
                    <div className="space-y-3">
                        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                ) : (
                    ROWS.map((row) => (
                        <div
                            key={row.key}
                            className="flex items-center justify-between gap-3 py-2 border-b last:border-0"
                        >
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{row.label}</p>
                                <p className="text-xs text-muted-foreground">{row.hint}</p>
                            </div>
                            <Switch
                                checked={prefs[row.key]}
                                onCheckedChange={(checked) => void handleToggle(row.key, checked)}
                                aria-label={row.label}
                            />
                        </div>
                    ))
                )}
            </CardContent>
        </Card>
    );
}
