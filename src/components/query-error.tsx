import { Button } from "@/components/ui/button.tsx";

export function QueryError({ title, onRetry }: { title: string; onRetry: () => void }) {
    return (
        <div role="alert" className="p-6 space-y-3 max-w-7xl mx-auto">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">Check your connection and try again.</p>
            <Button onClick={onRetry}>Try again</Button>
        </div>
    );
}
