import { lazy, Suspense, useState } from "react";
import { Sparkles } from "lucide-react";

import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { Button } from "@/components/ui/button.tsx";

// Pulls in the panel UI and the whole tool layer (which itself imports a
// good chunk of src/lib/supabase/queries/), so it is loaded on demand rather
// than eagerly from AppLayout — the same reason @react-pdf/renderer is
// lazy-loaded elsewhere. Every signed-in admin mounts this FAB; most page
// loads should not pay for code nobody opened the panel to use.
const AgentPanel = lazy(() => import("./AgentPanel.tsx"));

/**
 * Mounted once in AppLayout, next to GlobalSearch. Gated here rather than at
 * the layout level — field technicians simply never get a FAB, same as they
 * never get a Packages or Team link.
 *
 * Sits above the mobile bottom nav (`bottom-3`, ~60px tall) on small screens;
 * the nav itself is hidden at `md:`, where this drops to a plain corner FAB.
 */
export default function AgentFab() {
    const { data: user } = useCurrentUser();
    const [open, setOpen] = useState(false);
    // Once true, stays true — closing the panel shouldn't drop its chunk (or
    // the conversation state inside it) and force a re-fetch on reopen.
    const [everOpened, setEverOpened] = useState(false);

    if (!user || !["superadmin", "admin"].includes(user.role)) return null;

    return (
        <>
            <Button
                type="button"
                size="icon-lg"
                onClick={() => {
                    setEverOpened(true);
                    setOpen(true);
                }}
                aria-label="Open Lampara AI assistant"
                className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 size-12 rounded-full shadow-lg md:bottom-6"
            >
                <Sparkles className="size-5" />
            </Button>
            {everOpened && (
                <Suspense fallback={null}>
                    <AgentPanel open={open} onOpenChange={setOpen} />
                </Suspense>
            )}
        </>
    );
}
