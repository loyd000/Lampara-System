import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronRight, KeyRound, Package, Settings, User as UserIcon, UserCog } from "lucide-react";

import { useAuth } from "@/components/providers/auth-context.ts";
import { useCurrentUser, useUpdateOwnProfile } from "@/lib/supabase/hooks.ts";
import { ROLE_LABELS } from "@/lib/constants.ts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { SignOutButton } from "@/components/sign-out-button.tsx";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form.tsx";


const passwordSchema = z
    .object({
        password: z.string().min(8, "Use at least 8 characters"),
        confirm: z.string(),
    })
    .refine((values) => values.password === values.confirm, {
        message: "Passwords do not match",
        path: ["confirm"],
    });

type PasswordValues = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
    const { data: currentUser, isLoading } = useCurrentUser();
    const { mutateAsync: updateProfile, isPending: savingName } = useUpdateOwnProfile();
    const { updatePassword } = useAuth();

    const [name, setName] = useState(currentUser?.name ?? "");
    const [syncedUserId, setSyncedUserId] = useState<string | null>(null);
    if (currentUser && currentUser._id !== syncedUserId) {
        setSyncedUserId(currentUser._id);
        setName(currentUser.name ?? "");
    }

    const passwordForm = useForm<PasswordValues>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { password: "", confirm: "" },
    });

    async function handleSaveName() {
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Name can't be empty");
            return;
        }
        try {
            await updateProfile({ name: trimmed });
            toast.success("Profile updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update profile");
        }
    }

    async function handleChangePassword(values: PasswordValues) {
        try {
            await updatePassword(values.password);
            toast.success("Password updated");
            passwordForm.reset();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update password");
        }
    }

    if (isLoading || !currentUser) {
        return (
            <div className="p-6 space-y-6 max-w-2xl mx-auto">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-48 w-full rounded-lg" />
                <Skeleton className="h-32 w-full rounded-lg" />
            </div>
        );
    }

    const memberSince = new Date(currentUser._creationTime).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    return (
        <div className="p-6 space-y-6 max-w-2xl mx-auto">
            <div>
                <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">My Profile</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                    Your account details and personal preferences
                </p>
            </div>

            {/* Identity */}
            <Card>
                <CardHeader className="pb-3 border-b">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <UserIcon className="w-4 h-4 text-muted-foreground" />
                        Account
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                    <div className="flex items-center gap-3">
                        <div className="size-14 rounded-xl bg-secondary text-foreground flex items-center justify-center font-bold text-lg border border-border shrink-0">
                            {(currentUser.name ?? currentUser.email ?? "U").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate">
                                {currentUser.name ?? "No name set"}
                            </p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <Badge variant="secondary">
                                    {ROLE_LABELS[currentUser.role] ?? currentUser.role}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                    Member since {memberSince}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="profile-name">Display Name</Label>
                            <Input
                                id="profile-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="profile-email">Email</Label>
                            <Input id="profile-email" value={currentUser.email ?? ""} disabled />
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <Button
                            size="sm"
                            onClick={handleSaveName}
                            disabled={savingName || name.trim() === (currentUser.name ?? "")}
                        >
                            {savingName ? "Saving…" : "Save Changes"}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Password */}
            <Card>
                <CardHeader className="pb-3 border-b">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <KeyRound className="w-4 h-4 text-muted-foreground" />
                        Change Password
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Form {...passwordForm}>
                        <form
                            onSubmit={passwordForm.handleSubmit(handleChangePassword)}
                            className="space-y-4"
                        >
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <FormField
                                    control={passwordForm.control}
                                    name="password"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>New Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={passwordForm.control}
                                    name="confirm"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Confirm Password</FormLabel>
                                            <FormControl>
                                                <Input type="password" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={passwordForm.formState.isSubmitting}
                                >
                                    {passwordForm.formState.isSubmitting
                                        ? "Updating…"
                                        : "Update Password"}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            {/* Preferences — theme + sign out live here now instead of the
                mobile top bar, which only has room for the essentials
                (alerts, account). Desktop keeps its own copies in the
                sidebar too; this page is reachable from both. */}
            <Card>
                <CardHeader className="pb-3 border-b">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Settings className="w-4 h-4 text-muted-foreground" />
                        Preferences
                    </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div>
                            <p className="text-sm font-medium">Appearance</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Light, dark, or match your device</p>
                        </div>
                        <ThemeToggle variant="outline" size="sm" align="end" />
                    </div>
                    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                        <div>
                            <p className="text-sm font-medium">Sign out</p>
                            <p className="text-xs text-muted-foreground mt-0.5">End your session on this device</p>
                        </div>
                        <SignOutButton className="size-9" />
                    </div>
                </CardContent>
            </Card>

            {/* Administration — Packages and Team moved here from the mobile
                nav bar, which now only has room for the four everyday tabs.
                Same role gates as the desktop sidebar and each route's own
                RequireRole: Packages is superadmin-only, Team is admin and
                superadmin. */}
            {(currentUser.role === "superadmin" || currentUser.role === "admin") && (
                <Card>
                    <CardHeader className="pb-3 border-b">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <UserCog className="w-4 h-4 text-muted-foreground" />
                            Administration
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="divide-y">
                        {currentUser.role === "superadmin" && (
                            <Link
                                to="/packages"
                                className="flex items-center justify-between py-3 first:pt-0 last:pb-0 -mx-1 px-1 rounded-md hover:bg-muted/40 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Package className="w-4 h-4 text-muted-foreground" />
                                    <div>
                                        <p className="text-sm font-medium">Packages</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">Solar system bundles quotes are built from</p>
                                    </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            </Link>
                        )}
                        <Link
                            to="/team"
                            className="flex items-center justify-between py-3 first:pt-0 last:pb-0 -mx-1 px-1 rounded-md hover:bg-muted/40 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <UserCog className="w-4 h-4 text-muted-foreground" />
                                <div>
                                    <p className="text-sm font-medium">Team</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">Approve new accounts and manage roles</p>
                                </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                        </Link>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
