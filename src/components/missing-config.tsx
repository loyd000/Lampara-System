import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { COMPANY_NAME } from "@/lib/constants.ts";

export function MissingConfigScreen() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
            <div className="w-full max-w-lg space-y-6 rounded-lg border border-border bg-card p-6 md:p-8 shadow-xs">
                <div className="flex items-center gap-3">
                    <div className="size-10 rounded-md bg-card border border-border flex items-center justify-center p-2 shadow-2xs">
                        <img src="/lampara-icon.png" alt="Lampara" className="size-full object-contain dark:invert" />
                    </div>
                    <div>
                        <h1 className="text-lg font-semibold text-foreground tracking-tight">{COMPANY_NAME} CRM</h1>
                        <p className="text-xs text-muted-foreground">Setup Required</p>
                    </div>
                </div>

                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-foreground">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-medium text-foreground">Missing Supabase Environment Variables</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                The application was built and deployed, but cannot connect to Supabase because the environment variables are not configured in your hosting environment (e.g. Vercel).
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <h2 className="text-sm font-medium text-foreground">How to fix this in Vercel:</h2>
                    <ol className="list-decimal list-inside space-y-2 text-xs text-muted-foreground leading-relaxed">
                        <li>
                            Go to your <strong className="text-foreground">Vercel Dashboard</strong> and open this project.
                        </li>
                        <li>
                            Navigate to <strong className="text-foreground">Settings → Environment Variables</strong>.
                        </li>
                        <li>
                            Add the following two variables (found in your Supabase project under <strong className="text-foreground">Project Settings → API</strong>):
                            <div className="my-2 space-y-1.5 font-mono text-[11px]">
                                <div className="rounded border border-border bg-secondary/60 px-2.5 py-1.5 text-foreground select-all">
                                    VITE_SUPABASE_URL = &lt;your-project-url&gt;
                                </div>
                                <div className="rounded border border-border bg-secondary/60 px-2.5 py-1.5 text-foreground select-all">
                                    VITE_SUPABASE_ANON_KEY = &lt;your-anon-or-publishable-key&gt;
                                </div>
                            </div>
                        </li>
                        <li>
                            Go to the <strong className="text-foreground">Deployments</strong> tab in Vercel, click the three dots (···) on your latest deployment, and click <strong className="text-foreground">Redeploy</strong>.
                        </li>
                    </ol>
                </div>

                <div className="flex items-center gap-3 pt-2">
                    <Button
                        variant="default"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => window.location.reload()}
                    >
                        <RefreshCw className="size-3.5" />
                        Reload Page
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        asChild
                    >
                        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer">
                            Open Vercel Dashboard
                            <ExternalLink className="size-3" />
                        </a>
                    </Button>
                </div>
            </div>
        </div>
    );
}
