import { useState } from "react";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/components/providers/auth-context.ts";
import { Button } from "@/components/ui/button.tsx";
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
import { COMPANY_NAME } from "@/lib/constants.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Sign out behind a confirmation.
 *
 * The trigger sits next to the theme toggle in the sidebar and, on mobile, next
 * to it again in the top bar — both small icon buttons a thumb can hit by
 * accident. Signing out is cheap to undo but costs a full re-authentication, so
 * it gets a confirm step.
 */
export function SignOutButton({ className }: { className?: string }) {
    const { signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);

    async function handleSignOut() {
        setSigningOut(true);
        try {
            await signOut();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not sign out");
        } finally {
            setSigningOut(false);
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                        "rounded-md shrink-0 cursor-pointer transition-colors",
                        className,
                    )}
                    title="Sign out"
                    aria-label="Sign out"
                >
                    <LogOut className="size-4" />
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sign out of {COMPANY_NAME}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        You'll need to sign in again to get back to your leads and jobs.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {signingOut ? "Signing out…" : "Sign out"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
