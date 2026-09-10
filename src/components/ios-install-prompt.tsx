import { useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Card } from "@/components/ui/card.tsx";

const DISMISSED_KEY = "ios-install-prompt-dismissed";

/** iPadOS 13+ drops "iPad" from the UA string and reports as a Mac, so it's
 *  told apart from a real Mac by touch support — a Mac has none. */
function isIOS(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    if (/iPad|iPhone|iPod/.test(ua) && !("MSStream" in window)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    return (
        (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
        window.matchMedia("(display-mode: standalone)").matches
    );
}

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

/**
 * iOS has no `beforeinstallprompt` event — Android/Chrome can offer a native
 * "Install app?" banner, Safari never will. This is the only way anyone
 * finds out Add to Home Screen exists at all, short of someone telling them.
 *
 * Shown only to signed-in users on an iOS device, in the browser (not
 * already installed), who haven't dismissed it before. Dismissal is
 * permanent — this is a one-time pointer, not a recurring nag.
 */
export default function IosInstallPrompt() {
    const [dismissed, setDismissed] = useState(wasDismissed);

    if (dismissed || !isIOS() || isStandalone()) return null;

    function dismiss() {
        try {
            localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            // Private browsing can throw on write — the prompt just reappears
            // next visit, which is a fine fallback, not worth surfacing.
        }
        setDismissed(true);
    }

    return (
        <Card className="fixed bottom-20 md:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-80 z-40 p-3.5 shadow-lg border-primary/20">
            <div className="flex items-start gap-3">
                <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <SquarePlus className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">Install Lampara</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                        Tap <Share className="inline size-3.5 -mt-0.5 mx-0.5" /> Share, then{" "}
                        <span className="font-medium text-foreground">Add to Home Screen</span> for
                        one-tap access, full screen, no browser bar.
                    </p>
                </div>
                <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 -mt-1 -mr-1 shrink-0 text-muted-foreground"
                    onClick={dismiss}
                    aria-label="Dismiss"
                >
                    <X className="size-4" />
                </Button>
            </div>
        </Card>
    );
}
