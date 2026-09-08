import { ShieldOff } from "lucide-react";

import { useAuth } from "@/components/providers/auth-context.ts";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { COMPANY_NAME } from "@/lib/constants.ts";

/**
 * Stands between a valid session and the app shell.
 *
 * Being signed in is not the same as having access. Two states used to fall
 * through to a working-looking app with no data in it and no explanation:
 *
 *   · the profile row does not exist yet — the signup trigger creates it, and a
 *     first OAuth sign-in can beat the first read to it
 *   · the account has been deactivated — auth_role() returns null, so every RLS
 *     policy denies, and every query comes back empty
 *
 * Realtime is subscribed to `users`, so the provisioning case resolves on its
 * own the moment the row lands.
 */
export function AccountGate({ children }: { children: React.ReactNode }) {
    const { data: user, isPending, isError, refetch } = useCurrentUser();
    const { signOut } = useAuth();

    if (isPending) {
        return (
            <div className="flex h-screen items-center justify-center bg-background">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex size-12 animate-pulse items-center justify-center rounded-lg bg-card border border-border p-2.5 shadow-2xs">
                        <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />
                    </div>
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

    if (!user.isActive) {
        return (
            <AccountMessage
                icon={<ShieldOff className="size-7 text-muted-foreground" />}
                title="Your account is deactivated"
                body="An administrator has turned off access for this account. Ask them to reactivate it from the Team page."
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
}: {
    icon?: React.ReactNode;
    title: string;
    body: string;
    action?: React.ReactNode;
    onSignOut: () => Promise<void>;
}) {
    return (
        <div className="flex min-h-svh items-center justify-center bg-background px-4">
            <div className="flex max-w-sm flex-col items-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-lg bg-card border border-border p-2 shadow-2xs">
                    {icon ?? <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />}
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
            </div>
        </div>
    );
}
