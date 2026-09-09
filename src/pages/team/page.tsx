import { useCurrentUser, useUpdateUserRole, useUsers } from "@/lib/supabase/hooks.ts";
import type { Id, UserRole } from "@/lib/supabase/types.ts";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { ROLE_LABELS } from "@/lib/constants.ts";
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { UserCog, Shield, Hammer, ClipboardList, Users } from "lucide-react";

const ROLE_ICONS: Record<string, React.ReactNode> = {
    admin: <Shield className="w-3.5 h-3.5" />,
    sales: <Users className="w-3.5 h-3.5" />,
    field: <Hammer className="w-3.5 h-3.5" />,
    office: <ClipboardList className="w-3.5 h-3.5" />,
};

const ROLE_COLORS: Record<string, string> = {
    admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    sales: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    field: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
    office: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
};

export default function TeamPage() {
    const { data: users } = useUsers();
    const { data: currentUser } = useCurrentUser();
    const { mutateAsync: updateRole } = useUpdateUserRole();

    async function handleRoleChange(userId: string, role: string) {
        try {
            await updateRole({ userId: userId as Id<"users">, role: role as UserRole });
            toast.success("Role updated");
        } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update role");
        }
    }

    const isAdmin = currentUser?.role === "admin";

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Team</h1>
                <p className="text-sm text-muted-foreground mt-1">Manage your team members and their roles</p>
            </div>

            {users === undefined ? (
                <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {users.map(user => (
                        <Card key={user._id}>
                            <CardContent className="flex items-center gap-3">
                                <div className="size-10 rounded-md bg-secondary text-foreground flex items-center justify-center font-bold text-sm flex-shrink-0 border border-border">
                                    {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-sm truncate">{user.name ?? "No name"}</p>
                                    {user.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                                </div>
                                {isAdmin && user._id !== currentUser?._id ? (
                                    <Select value={user.role} onValueChange={(v) => handleRoleChange(user._id, v)}>
                                        <SelectTrigger className="w-36 h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {Object.entries(ROLE_LABELS).map(([val, label]) => (
                                                <SelectItem key={val} value={val}>{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                ) : (
                                    <Badge className={`${ROLE_COLORS[user.role]} flex items-center gap-1 text-xs`}>
                                        {ROLE_ICONS[user.role]}{ROLE_LABELS[user.role]}
                                    </Badge>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {!isAdmin && (
                <p className="text-sm text-muted-foreground">Only admins can change team member roles.</p>
            )}
        </div>
    );
}
