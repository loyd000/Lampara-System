/**
 * "Good morning/afternoon/evening" for the dashboard header.
 *
 * Shared by AdminDashboard and FieldDashboard — they used to each define
 * their own copy with different thresholds (18:00 vs. 17:00 for when
 * "afternoon" ends), which meant a superadmin and a field engineer signing
 * in at the same 5pm minute saw two different greetings for what was meant
 * to be identical logic.
 */
export function getGreeting(): "morning" | "afternoon" | "evening" {
    const h = new Date().getHours();
    if (h < 12) return "morning";
    if (h < 18) return "afternoon";
    return "evening";
}
