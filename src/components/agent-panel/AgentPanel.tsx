import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Send, Sparkles, Trash2, X } from "lucide-react";

import { useAgent } from "@/hooks/use-agent.ts";
import { Button } from "@/components/ui/button.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { cn } from "@/lib/utils.ts";
import AgentMessage from "./AgentMessage.tsx";

const SUGGESTIONS = [
    "What's scheduled this week?",
    "List projects in Contract Signed",
    "Find a project by name",
];

/**
 * Desktop: right-side drawer, pinned to the viewport edge. Mobile: a bottom
 * sheet instead — a right-edge drawer at 400px would eat most of a phone
 * screen sideways, where a sheet only has to give up height.
 *
 * Built on the raw Radix Dialog primitive (not `ui/dialog.tsx`'s
 * `DialogContent`) because that component hard-codes a centered, capped-width
 * layout — this panel is edge-anchored and full-height instead.
 */
export default function AgentPanel({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { messages, send, clear, isThinking, error } = useAgent();
    const [input, setInput] = useState("");
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isThinking]);

    function submit(text?: string) {
        const value = (text ?? input).trim();
        if (!value || isThinking) return;
        setInput("");
        void send(value);
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-50 bg-black/40 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
                />
                <DialogPrimitive.Content
                    className={cn(
                        "glass-modal fixed inset-x-0 bottom-0 z-50 flex h-[80vh] flex-col rounded-t-2xl border-t border-border shadow-lg outline-none duration-200",
                        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
                        "md:inset-x-auto md:inset-y-0 md:right-0 md:bottom-auto md:h-full md:w-[400px] md:rounded-t-none md:rounded-l-2xl md:border-t-0 md:border-l",
                    )}
                >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3">
                        <DialogPrimitive.Title className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            <Sparkles className="size-4 text-muted-foreground" />
                            Lampara AI
                        </DialogPrimitive.Title>
                        <div className="flex items-center gap-1">
                            {messages.length > 0 && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    onClick={clear}
                                    aria-label="Clear conversation"
                                >
                                    <Trash2 className="size-4" />
                                </Button>
                            )}
                            <DialogPrimitive.Close asChild>
                                <Button type="button" variant="ghost" size="icon-sm" aria-label="Close">
                                    <X className="size-4" />
                                </Button>
                            </DialogPrimitive.Close>
                        </div>
                    </div>
                    <DialogPrimitive.Description className="sr-only">
                        Ask the Lampara AI assistant about projects, schedules and pipeline
                        stages. Read-only for now — it cannot create or change anything.
                    </DialogPrimitive.Description>

                    <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                        {messages.length === 0 ? (
                            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                                <div className="flex size-10 items-center justify-center rounded-full bg-secondary">
                                    <Sparkles className="size-5 text-muted-foreground" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium text-foreground">Ask about your projects</p>
                                    <p className="text-xs text-muted-foreground">
                                        Answers only for now — nothing gets created or changed.
                                    </p>
                                </div>
                                <div className="flex w-full flex-col gap-1.5">
                                    {SUGGESTIONS.map((suggestion) => (
                                        <button
                                            key={suggestion}
                                            type="button"
                                            onClick={() => submit(suggestion)}
                                            className="rounded-md border border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((message) => <AgentMessage key={message.id} message={message} />)
                        )}
                        {isThinking && (
                            <div className="flex items-center gap-2 pl-8 text-xs text-muted-foreground">
                                <span className="flex gap-1">
                                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                                    <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                                </span>
                                Thinking…
                            </div>
                        )}
                        {error && (
                            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                {error}
                            </div>
                        )}
                    </div>

                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            submit();
                        }}
                        className="flex shrink-0 items-end gap-2 border-t border-border p-3"
                    >
                        <Textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                            placeholder="Ask about a project or schedule…"
                            rows={1}
                            className="min-h-9 max-h-32 resize-none py-2"
                        />
                        <Button type="submit" size="icon" disabled={isThinking || !input.trim()} aria-label="Send message">
                            <Send className="size-4" />
                        </Button>
                    </form>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
