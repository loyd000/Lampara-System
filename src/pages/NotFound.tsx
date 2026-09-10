import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button.tsx";

export default function NotFound() {
    const location = useLocation();

    useEffect(() => {
        console.error(
            "404 Error: User attempted to access non-existent route:",
            location.pathname,
        );
    }, [location.pathname]);

    return (
        // The house page container. This renders inside AppLayout now, so the
        // sidebar and mobile nav are already there — a full-height centred
        // splash would fight them.
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div>
                <h1 className="text-[28px] font-bold tracking-[-0.02em] text-foreground leading-tight">
                    Page not found
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                    Nothing lives at <code className="font-mono">{location.pathname}</code>.
                </p>
            </div>
            <Button asChild>
                <Link to="/">Back to dashboard</Link>
            </Button>
        </div>
    );
}
