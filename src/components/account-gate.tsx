import { Hourglass, ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/components/providers/auth-context.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { COMPANY_NAME } from "@/lib/constants.ts";

/**
 * Stands between a valid session and the app shell.
 *
 * Being signed in is not the same as having access. Three states used to fall
 * through to a working-looking app with no data in it and no explanation:
 *
 *   · the profile row does not exist yet — the signup trigger creates it, and a
 *     first OAuth sign-in can beat the first read to it
 *   · the account has never been approved — every new sign-up now lands
 *     inactive (0013_roles_and_approval.sql), waiting on a superadmin
 *   · the account was approved once and has since been deactivated
 *
 * `is_active` alone can't tell the second case from the third; `approvedAt`
 * is what distinguishes "never let in" from "let in, then turned off".
 *
 * Realtime is subscribed to `users`, so all three resolve on their own the
 * moment the row changes — nobody has to reload after being approved.
 */
export function AccountGate({ children }: { children: React.ReactNode }) {
    const { data: user, isPending, isError, refetch } = useCurrentUser();
    const { signOut } = useAuth();

    if (isPending && !user) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <img
                        src="/lampara-icon.png"
                        alt="Lampara"
                        className="size-12 object-contain animate-pulse drop-shadow-lg dark:invert"
                    />
                    <Skeleton className="h-4 w-32 rounded-md" />
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <AccountMessage
                title="Couldn't load your account"
                body="Something went wrong reaching the server. Check your connection and try again."
                action={<Button onClick={() => void refetch()}>Try again</Button>}
                onSignOut={signOut}
                // No signal on site? This is exactly the screen a technician
                // hits on a cold start with no connection — the offline
                // report page doesn't need a session at all, so it stays
                // reachable even from here. See
                // docs/plans/Offline_Export_Import_plan.md.
                footer={
                    <Link
                        to="/offline-report"
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
                    >
                        No signal? Fill a report offline instead
                    </Link>
                }
            />
        );
    }

    if (!user) {
        return (
            <AccountMessage
                title={`Setting up your ${COMPANY_NAME} account`}
                body="This takes a moment on first sign-in. The page will continue on its own once your profile is ready."
                action={
                    <Button variant="secondary" onClick={() => void refetch()}>
                        Check again
                    </Button>
                }
                onSignOut={signOut}
            />
        );
    }

    if (!user.isActive && !user.approvedAt) {
        return (
            <AccountMessage
                icon={<Hourglass className="size-7 text-muted-foreground" />}
                title="Waiting for approval"
                body="A superadmin needs to let your account in before you can sign in. This page will continue on its own once that happens — no need to reload."
                action={
                    <Button variant="secondary" onClick={() => void refetch()}>
                        Check again
                    </Button>
                }
                onSignOut={signOut}
            />
        );
    }

    if (!user.isActive) {
        return (
            <AccountMessage
                icon={<ShieldOff className="size-7 text-muted-foreground" />}
                title="Your account is deactivated"
                body="A superadmin has turned off access for this account. Ask them to reactivate it from the Team page."
                onSignOut={signOut}
            />
        );
    }

    return <>{children}</>;
}

function AccountMessage({
    icon,
    title,
    body,
    action,
    onSignOut,
    footer,
}: {
    icon?: React.ReactNode;
    title: string;
    body: string;
    action?: React.ReactNode;
    onSignOut: () => Promise<void>;
    footer?: React.ReactNode;
}) {
    return (
        <div className="flex min-h-svh items-center justify-center bg-background px-4">
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center">
                    {icon ?? <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain drop-shadow-lg dark:invert" />}
                </div>
                <div>
                    <h1 className="text-lg font-semibold text-foreground">{title}</h1>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
                <div className="flex items-center gap-3 pt-1">
                    {action}
                    <Button variant="ghost" size="sm" onClick={() => void onSignOut()}>
                        Sign out
                    </Button>
                </div>
                {footer && <div className="pt-1">{footer}</div>}
            </div>
        </div>
    );
}
