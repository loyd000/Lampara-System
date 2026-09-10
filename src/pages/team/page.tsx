import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Hammer, Hourglass, Shield, ShieldOff, UserCheck } from "lucide-react";

import {
    useCurrentUser,
    useDeleteUser,
    useUpdateUserRole,
    useUpdateUserStatus,
    useUsers,
} from "@/lib/supabase/hooks.ts";
import type { Id, User, UserRole } from "@/lib/supabase/types.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ROLE_LABELS } from "@/lib/constants.ts";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog.tsx";
import { QueryError } from "@/components/query-error.tsx";

const ROLE_ICONS: Record<string, React.ReactNode> = {
    superadmin: <Shield className="w-3.5 h-3.5" />,
    admin: <ClipboardList className="w-3.5 h-3.5" />,
    field: <Hammer className="w-3.5 h-3.5" />,
};

const ROLE_COLORS: Record<string, string> = {
    superadmin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    admin: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
    field: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

/**
 * Every sign-up now lands inactive with `approved_at` unset
 * (0013_roles_and_approval.sql) — this is what tells "waiting to be let in"
 * apart from "was active, got turned off", which also has `is_active = false`
 * but keeps its approval stamp.
 */
function isPending(user: User): boolean {
    return !user.isActive && !user.approvedAt;
}

export default function TeamPage() {
    const { data: users, isError, refetch } = useUsers();
    const { data: currentUser } = useCurrentUser();
    const { mutateAsync: updateRole } = useUpdateUserRole();
    const { mutateAsync: updateStatus } = useUpdateUserStatus();
    const { mutateAsync: deleteUser } = useDeleteUser();

    // The role a pending row's picker is set to, keyed by user id — kept here
    // rather than per-card local state so a re-render from the list refetch
    // (another admin approving someone else) doesn't reset an in-progress pick.
    const [pendingRole, setPendingRole] = useState<Record<string, UserRole>>({});
    const [busyId, setBusyId] = useState<string | null>(null);

    const isSuperadmin = currentUser?.role === "superadmin";

    if (isError) {
        return <QueryError title="Couldn't load your team" onRetry={() => void refetch()} />;
    }

    const pending = (users ?? []).filter(isPending);
    const roster = (users ?? []).filter((u) => !isPending(u));

    async function handleApprove(user: User) {
        setBusyId(user._id);
        try {
            const role = pendingRole[user._id] ?? "field";
            if (role !== user.role) {
                await updateRole({ userId: user._id as Id<"users">, role });
            }
            await updateStatus({ userId: user._id as Id<"users">, isActive: true });
            toast.success(`${user.name ?? user.email ?? "Account"} approved as ${ROLE_LABELS[role]}`);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to approve account");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDecline(user: User) {
        setBusyId(user._id);
        try {
            // There is no re-signup path back in — the auth.users record survives,
            // so this closes the door for good, not just for now.
            await deleteUser({ userId: user._id as Id<"users"> });
            toast.success("Account declined");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to decline account");
        } finally {
            setBusyId(null);
        }
    }

    async function handleRoleChange(userId: string, role: string) {
        try {
            await updateRole({ userId: userId as Id<"users">, role: role as UserRole });
            toast.success("Role updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update role");
        }
    }

    async function handleToggleActive(user: User) {
        setBusyId(user._id);
        try {
            await updateStatus({ userId: user._id as Id<"users">, isActive: !user.isActive });
            toast.success(user.isActive ? "Account deactivated" : "Account reactivated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update status");
        } finally {
            setBusyId(null);
        }
    }

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div>
                <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">Team</h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                    {isSuperadmin
                        ? "Approve new accounts and manage everyone's role"
                        : "Your team at a glance — only a superadmin can change roles or approve accounts"}
                </p>
            </div>

            {users === undefined ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : (
                <>
                    {/* Pending approval — visible to everyone so the team can see who is
                        waiting, but only a superadmin gets the actions to do anything
                        about it. */}
                    {pending.length > 0 && (
                        <section className="space-y-3">
                            <div className="flex items-center gap-2">
                                <Hourglass className="w-4 h-4 text-amber-500" />
                                <h2 className="text-sm font-semibold text-foreground">
                                    Waiting for approval
                                </h2>
                                <Badge variant="secondary" className="text-xs">{pending.length}</Badge>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {pending.map((user) => (
                                    <Card key={user._id} className="border-amber-200/60 dark:border-amber-800/40">
                                        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="size-10 rounded-md bg-secondary text-foreground flex items-center justify-center font-bold text-sm flex-shrink-0 border border-border">
                                                    {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm truncate">{user.name ?? "No name"}</p>
                                                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                                                </div>
                                            </div>
                                            {isSuperadmin ? (
                                                <div
                                                    // `flex-shrink-0` pinned this cluster wider
                                                    // than the card, so `flex-wrap` never
                                                    // engaged and it overflowed instead.
                                                    className="flex items-center flex-wrap gap-1.5 min-w-0 w-full sm:w-auto"
                                                >
                                                    <Select
                                                        value={pendingRole[user._id] ?? "field"}
                                                        onValueChange={(v) =>
                                                            setPendingRole((prev) => ({ ...prev, [user._id]: v as UserRole }))
                                                        }
                                                    >
                                                        <SelectTrigger className="w-28 h-8 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                                <SelectItem key={val} value={val}>{label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        size="sm"
                                                        className="h-8"
                                                        disabled={busyId === user._id}
                                                        onClick={() => void handleApprove(user)}
                                                    >
                                                        <UserCheck className="w-3.5 h-3.5 mr-1" />Approve
                                                    </Button>
                                                    <AlertDialog>
                                                        <AlertDialogTrigger asChild>
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-8 text-destructive hover:text-destructive"
                                                                disabled={busyId === user._id}
                                                            >
                                                                Decline
                                                            </Button>
                                                        </AlertDialogTrigger>
                                                        <AlertDialogContent>
                                                            <AlertDialogHeader>
                                                                <AlertDialogTitle>Decline this account?</AlertDialogTitle>
                                                                <AlertDialogDescription>
                                                                    {user.name ?? user.email} will not be able to sign up
                                                                    again with this address. This cannot be undone from here.
                                                                </AlertDialogDescription>
                                                            </AlertDialogHeader>
                                                            <AlertDialogFooter>
                                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                                <AlertDialogAction
                                                                    onClick={() => void handleDecline(user)}
                                                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                                >
                                                                    Decline
                                                                </AlertDialogAction>
                                                            </AlertDialogFooter>
                                                        </AlertDialogContent>
                                                    </AlertDialog>
                                                </div>
                                            ) : (
                                                <Badge variant="secondary" className="text-xs flex-shrink-0">
                                                    Pending
                                                </Badge>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Everyone who has been let in at least once. */}
                    <section className="space-y-3">
                        {pending.length > 0 && (
                            <h2 className="text-sm font-semibold text-foreground">Team</h2>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {roster.map((user) => {
                                const isSelf = user._id === currentUser?._id;
                                return (
                                    <Card key={user._id} className={!user.isActive ? "opacity-60" : undefined}>
                                        <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="size-10 rounded-md bg-secondary text-foreground flex items-center justify-center font-bold text-sm flex-shrink-0 border border-border">
                                                    {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-semibold text-sm truncate">{user.name ?? "No name"}</p>
                                                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                                                    {!user.isActive && (
                                                        <p className="text-[11px] text-muted-foreground mt-0.5">Deactivated</p>
                                                    )}
                                                </div>
                                            </div>
                                            {isSuperadmin && !isSelf ? (
                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    <Select value={user.role} onValueChange={(v) => handleRoleChange(user._id, v)}>
                                                        <SelectTrigger className="w-32 h-9 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                                <SelectItem key={val} value={val}>{label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                    <Button
                                                        size="icon"
                                                        variant="ghost"
                                                        className="size-9 text-muted-foreground hover:text-destructive"
                                                        disabled={busyId === user._id}
                                                        onClick={() => void handleToggleActive(user)}
                                                        title={user.isActive ? "Deactivate" : "Reactivate"}
                                                        aria-label={user.isActive ? "Deactivate account" : "Reactivate account"}
                                                    >
                                                        {user.isActive ? <ShieldOff className="size-4" /> : <UserCheck className="size-4" />}
                                                    </Button>
                                                </div>
                                            ) : (
                                                <Badge className={`${ROLE_COLORS[user.role]} flex items-center gap-1 text-xs flex-shrink-0`}>
                                                    {ROLE_ICONS[user.role]}{ROLE_LABELS[user.role]}
                                                </Badge>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    </section>
                </>
            )}

            {!isSuperadmin && (
                <p className="text-sm text-muted-foreground">
                    Only a superadmin can approve accounts or change roles.
                </p>
            )}
        </div>
    );
}
