import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";

import { useCurrentUser } from "@/lib/supabase/hooks.ts";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";

const isMac = typeof navigator !== "undefined" && /mac/i.test(navigator.userAgent);

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
    const eligible = !!user && ["superadmin", "admin"].includes(user.role);

    // A fixed-position FAB sits at the same screen coordinate through the
    // whole page scroll, so on a long list (e.g. the dashboard's Recent
    // Projects) it inevitably lands on top of a row while scrolling. Step
    // out of the way while the page is actively moving; come back the moment
    // it stops or reverses — that's when someone's actually looking to tap
    // it, not mid-scroll past a row it would otherwise cover.
    const [scrollingDown, setScrollingDown] = useState(false);
    const lastY = useRef(0);
    useEffect(() => {
        if (!eligible) return;
        lastY.current = window.scrollY;
        let ticking = false;
        function onScroll() {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                const y = window.scrollY;
                const delta = y - lastY.current;
                if (Math.abs(delta) > 4) {
                    setScrollingDown(delta > 0 && y > 80);
                    lastY.current = y;
                }
                ticking = false;
            });
        }
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [eligible]);

    // Ctrl+/ (⌘+/ on Mac) toggles the panel from anywhere, same idea as
    // GlobalSearch's Ctrl+K. Registered here rather than in AppLayout since
    // this is the component that already owns `open` — nobody outside needs
    // to reach it via a DOM event the way the sidebar's search button does.
    useEffect(() => {
        if (!eligible) return;
        function onKeyDown(e: KeyboardEvent) {
            if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setEverOpened(true);
                setOpen((prev) => !prev);
            }
        }
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [eligible]);

    if (!eligible) return null;

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
                title={`Ask Lampara AI (${isMac ? "⌘" : "Ctrl"}+/)`}
                className={cn(
                    "fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 size-12 rounded-full shadow-lg transition-[transform,opacity] duration-200 md:bottom-6",
                    scrollingDown && !open && "translate-y-20 opacity-0 pointer-events-none md:translate-y-0 md:opacity-100 md:pointer-events-auto",
                )}
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
