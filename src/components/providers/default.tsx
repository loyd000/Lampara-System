import { SupabaseAuthProvider } from "./auth.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";

/**
 * QueryClientProvider is outermost so SupabaseAuthProvider can clear the cache
 * when the signed-in user changes. There is no data provider any more — the
 * Supabase client is a module singleton, not React state.
 */
export function DefaultProviders({ children }: { children: React.ReactNode }) {
    return (
        <QueryClientProvider>
            <SupabaseAuthProvider>
                <TooltipProvider>
                    <ThemeProvider>
                        <Toaster />
                        {children}
                    </ThemeProvider>
                </TooltipProvider>
            </SupabaseAuthProvider>
        </QueryClientProvider>
    );
}
