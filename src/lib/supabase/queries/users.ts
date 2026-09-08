/** Replaces convex/users.ts. */

import { supabase, toAppError, unwrap } from "../client.ts";
import type { UserRow, UserRole } from "../database.types.ts";
import { toUser, type Id, type User } from "../types.ts";

/**
 * The signed-in user's profile row.
 *
 * The row itself is created by the `on_auth_user_created` trigger, so unlike the
 * old `updateCurrentUser` mutation there is nothing to upsert from the client.
 * Returns null when signed out — or, briefly, if this races the trigger.
 */
export async function getCurrentUser(): Promise<User | null> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;

    const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();

    if (error) throw toAppError(error, "Failed to load your profile");
    return data ? toUser(data as UserRow) : null;
}

export async function listUsers(): Promise<User[]> {
    const rows = unwrap(
        await supabase.from("users").select("*").order("name", { nullsFirst: false }),
        "Failed to load the team",
    );
    return (rows as UserRow[]).map(toUser);
}

export async function updateUserRole(args: {
    userId: Id<"users">;
    role: UserRole;
}): Promise<void> {
    const { error } = await supabase
        .from("users")
        .update({ role: args.role })
        .eq("id", args.userId);
    if (error) throw toAppError(error, "Failed to update role");
}

export async function updateUserStatus(args: {
    userId: Id<"users">;
    isActive: boolean;
}): Promise<void> {
    const { error } = await supabase
        .from("users")
        .update({ is_active: args.isActive })
        .eq("id", args.userId);
    if (error) throw toAppError(error, "Failed to update status");
}

/**
 * Removes the profile row. The matching auth.users record can only be deleted
 * with the service role, so the account still exists in Supabase Auth — but with
 * no profile row `auth_role()` returns null and every RLS policy denies it.
 */
export async function deleteUser(args: { userId: Id<"users"> }): Promise<void> {
    const { error } = await supabase.from("users").delete().eq("id", args.userId);
    if (error) throw toAppError(error, "Failed to remove user");
}

/** Lets a user edit their own display name / avatar. */
export async function updateOwnProfile(args: {
    name?: string;
    avatarUrl?: string;
}): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Not signed in");

    const { error } = await supabase
        .from("users")
        .update({ name: args.name, avatar_url: args.avatarUrl })
        .eq("id", auth.user.id);
    if (error) throw toAppError(error, "Failed to update your profile");
}
