import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { useAuth } from "@/components/providers/auth-context.ts";
import { Button } from "@/components/ui/button.tsx";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { COMPANY_NAME } from "@/lib/constants.ts";

const schema = z
    .object({
        password: z.string().min(8, "Use at least 8 characters"),
        confirm: z.string(),
    })
    .refine((values) => values.password === values.confirm, {
        message: "Passwords do not match",
        path: ["confirm"],
    });

type Values = z.infer<typeof schema>;

/**
 * Takes over the entire app while a password recovery is in progress.
 *
 * A Supabase recovery link signs the user in as a side effect of being clicked,
 * so without this they would land on the dashboard with no way to change the
 * password they could not remember. Gating at the router level rather than on
 * /auth/callback means it works no matter which route the link resolves to, and
 * removes the race between the redirect and the PASSWORD_RECOVERY event.
 */
export function PasswordRecoveryGate({ children }: { children: React.ReactNode }) {
    const { isPasswordRecovery } = useAuth();
    if (!isPasswordRecovery) return <>{children}</>;
    return <SetNewPassword />;
}

function SetNewPassword() {
    const { updatePassword, dismissPasswordRecovery, signOut } = useAuth();

    const form = useForm<Values>({
        resolver: zodResolver(schema),
        defaultValues: { password: "", confirm: "" },
    });

    async function onSubmit(values: Values) {
        try {
            // On success this clears isPasswordRecovery, so the gate swaps back
            // to the app and this component unmounts.
            await updatePassword(values.password);
            toast.success("Password updated");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not update password");
        }
    }

    return (
        <div className="flex min-h-svh items-center justify-center px-4">
            <div className="w-full max-w-sm space-y-6">
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
                        <KeyRound className="size-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold">Choose a new password</h1>
                        <p className="mt-1 text-sm text-muted-foreground">
                            Set a password for your {COMPANY_NAME} account to finish signing in.
                        </p>
                    </div>
                </div>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            autoComplete="new-password"
                                            placeholder="At least 8 characters"
                                            autoFocus
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="confirm"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm password</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            autoComplete="new-password"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={form.formState.isSubmitting}
                        >
                            {form.formState.isSubmitting ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Set password and continue"
                            )}
                        </Button>
                    </form>
                </Form>

                {/* An escape hatch for someone who opened the link by accident —
                    they stay signed in, or can drop the session entirely. */}
                <div className="flex justify-center gap-4 text-xs text-muted-foreground">
                    <button
                        type="button"
                        onClick={dismissPasswordRecovery}
                        className="transition-colors hover:text-foreground"
                    >
                        Skip for now
                    </button>
                    <button
                        type="button"
                        onClick={() => void signOut()}
                        className="transition-colors hover:text-foreground"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
