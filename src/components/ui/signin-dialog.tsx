import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";

import { useAuth } from "@/components/providers/auth-context.ts";
import { Button } from "@/components/ui/button.tsx";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog.tsx";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { COMPANY_NAME } from "@/lib/constants.ts";

const signInSchema = z.object({
    email: z.string().email("Enter a valid email"),
    password: z.string().min(1, "Enter your password"),
});

const signUpSchema = z.object({
    name: z.string().min(1, "Enter your name"),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(8, "Use at least 8 characters"),
});

type SignInValues = z.infer<typeof signInSchema>;
type SignUpValues = z.infer<typeof signUpSchema>;

/**
 * Email/password + Google sign-in.
 *
 * The old Hercules flow redirected straight to an OIDC provider; Supabase
 * supports both, so the button opens this dialog and Google stays one click
 * away at the top.
 */
export function SignInDialog({
    open,
    onClose,
}: {
    open: boolean;
    onClose: () => void;
}) {
    const { signInWithPassword, signUpWithPassword, signInWithGoogle, sendPasswordReset } =
        useAuth();
    const [tab, setTab] = useState<"signin" | "signup">("signin");
    const [googleLoading, setGoogleLoading] = useState(false);

    const signInForm = useForm<SignInValues>({
        resolver: zodResolver(signInSchema),
        defaultValues: { email: "", password: "" },
    });

    const signUpForm = useForm<SignUpValues>({
        resolver: zodResolver(signUpSchema),
        defaultValues: { name: "", email: "", password: "" },
    });

    /**
     * Clears both forms on the way out, so reopening the dialog never shows a
     * stale password or the tab the last visit ended on. Every close path
     * (escape, overlay click, a successful submit) goes through here.
     */
    function handleClose() {
        signInForm.reset();
        signUpForm.reset();
        setTab("signin");
        onClose();
    }

    async function handleGoogle() {
        setGoogleLoading(true);
        try {
            // Redirects away from the page; the dialog never gets to close.
            await signInWithGoogle();
        } catch (error) {
            setGoogleLoading(false);
            toast.error(error instanceof Error ? error.message : "Google sign-in failed");
        }
    }

    async function onSignIn(values: SignInValues) {
        try {
            await signInWithPassword(values.email, values.password);
            handleClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not sign in");
        }
    }

    async function onSignUp(values: SignUpValues) {
        try {
            const { needsConfirmation } = await signUpWithPassword(
                values.email,
                values.password,
                values.name,
            );
            if (needsConfirmation) {
                toast.success("Check your email to confirm your account.");
            } else {
                toast.success(`Welcome to ${COMPANY_NAME}`);
            }
            handleClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not create account");
        }
    }

    async function handleForgotPassword() {
        const email = signInForm.getValues("email");
        if (!email) {
            signInForm.setError("email", { message: "Enter your email first" });
            return;
        }
        try {
            await sendPasswordReset(email);
            toast.success("Password reset link sent - check your email.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not send reset email");
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Sign in to {COMPANY_NAME}</DialogTitle>
                    <DialogDescription>
                        Use your work email or continue with Google.
                    </DialogDescription>
                </DialogHeader>

                <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogle}
                    disabled={googleLoading}
                >
                    {googleLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                    ) : (
                        <GoogleMark />
                    )}
                    Continue with Google
                </Button>

                <div className="flex items-center gap-3">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <span className="h-px flex-1 bg-border" />
                </div>

                <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
                    <TabsList className="w-full">
                        <TabsTrigger value="signin" className="flex-1">
                            Sign in
                        </TabsTrigger>
                        <TabsTrigger value="signup" className="flex-1">
                            Create account
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="signin" className="pt-3">
                        <Form {...signInForm}>
                            <form
                                onSubmit={signInForm.handleSubmit(onSignIn)}
                                className="space-y-3"
                            >
                                <FormField
                                    control={signInForm.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="email"
                                                    autoComplete="email"
                                                    placeholder="you@company.com"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={signInForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    autoComplete="current-password"
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
                                    disabled={signInForm.formState.isSubmitting}
                                >
                                    {signInForm.formState.isSubmitting ? (
                                        <>
                                            <Loader2 className="size-4 animate-spin" />
                                            Signing in...
                                        </>
                                    ) : (
                                        <>
                                            <Mail className="size-4" />
                                            Sign in
                                        </>
                                    )}
                                </Button>
                                <button
                                    type="button"
                                    onClick={handleForgotPassword}
                                    className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    Forgot your password?
                                </button>
                            </form>
                        </Form>
                    </TabsContent>

                    <TabsContent value="signup" className="pt-3">
                        <Form {...signUpForm}>
                            <form
                                onSubmit={signUpForm.handleSubmit(onSignUp)}
                                className="space-y-3"
                            >
                                <FormField
                                    control={signUpForm.control}
                                    name="name"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Full name</FormLabel>
                                            <FormControl>
                                                <Input
                                                    autoComplete="name"
                                                    placeholder="Jane Smith"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={signUpForm.control}
                                    name="email"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Email</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="email"
                                                    autoComplete="email"
                                                    placeholder="you@company.com"
                                                    {...field}
                                                />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={signUpForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Password</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="password"
                                                    autoComplete="new-password"
                                                    placeholder="At least 8 characters"
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
                                    disabled={signUpForm.formState.isSubmitting}
                                >
                                    {signUpForm.formState.isSubmitting
                                        ? "Creating account..."
                                        : "Create account"}
                                </Button>
                                <p className="text-[11px] text-muted-foreground text-center">
                                    The first account created becomes the admin. Everyone after
                                    joins as a sales rep &mdash; an admin can change roles on the
                                    Team page.
                                </p>
                            </form>
                        </Form>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

function GoogleMark() {
    return (
        <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
            />
            <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
            />
            <path
                fill="#FBBC05"
                d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
            />
            <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1a11 11 0 0 0-9.82 6.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38Z"
            />
        </svg>
    );
}
