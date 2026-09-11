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
 * A full-screen floating overlay, not a drawer — the app behind it blurs
 * (see `DialogPrimitive.Overlay` below), and the conversation itself has no
 * card, panel or bubble background: it's just text and a floating input
 * pill sitting on that blur. One layout for mobile and desktop, unlike the
 * old edge-anchored bottom-sheet/side-panel split.
 *
 * Still a real Radix Dialog underneath — losing the visible box is a visual
 * choice, not a structural one. Focus trapping and Escape-to-close keep
 * working exactly as before. Click-outside-to-close needs its own handler
 * here (see `handleBackdropClick`) because Content now spans the full
 * viewport, so Radix's own "outside Content" detection has nothing to
 * detect — every click technically lands inside Content's bounding box.
 */
export default function AgentPanel({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const { messages, send, clear, isThinking, error, briefingReady } = useAgent();
    const [input, setInput] = useState("");
    const listRef = useRef<HTMLDivElement>(null);
    // True once the opening briefing message is showing but the user hasn't
    // actually asked anything yet — the suggestion buttons stay useful in
    // that state, not just on a completely blank panel.
    const hasUserMessage = messages.some((message) => message.role === "user");

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
    }, [messages, isThinking]);

    function submit(text?: string) {
        const value = (text ?? input).trim();
        if (!value || isThinking) return;
        setInput("");
        void send(value);
    }

    function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget) onOpenChange(false);
    }

    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay
                    className="fixed inset-0 z-50 bg-background/55 backdrop-blur-xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
                />
                <DialogPrimitive.Content
                    className={cn(
                        "fixed inset-0 z-50 outline-none duration-200",
                        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    )}
                >
                    <DialogPrimitive.Title className="sr-only">Lampara AI</DialogPrimitive.Title>
                    <DialogPrimitive.Description className="sr-only">
                        Ask the Lampara AI assistant about projects, schedules and pipeline
                        stages, or have it create and schedule things for you — it always
                        describes what it's about to do and waits for confirmation first.
                    </DialogPrimitive.Description>

                    {/* Floating chrome — bare icon buttons, no enclosing header bar. */}
                    <div className="absolute top-5 right-5 z-10 flex items-center gap-1">
                        {messages.length > 0 && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="rounded-full"
                                onClick={clear}
                                aria-label="Clear conversation"
                            >
                                <Trash2 className="size-4" />
                            </Button>
                        )}
                        <DialogPrimitive.Close asChild>
                            <Button type="button" variant="ghost" size="icon-sm" className="rounded-full" aria-label="Close">
                                <X className="size-4" />
                            </Button>
                        </DialogPrimitive.Close>
                    </div>

                    <div
                        className="relative flex h-full flex-col items-center justify-end px-4 pt-16 pb-28"
                        onClick={handleBackdropClick}
                    >
                        <div
                            ref={listRef}
                            className="mask-fade-y w-full max-w-lg space-y-5 overflow-y-auto"
                            style={{ maxHeight: "65vh" }}
                        >
                            {messages.length === 0 ? (
                                briefingReady ? (
                                    // The daily briefing failed to load (or came back
                                    // empty) — fall back to the static welcome state
                                    // rather than leave the panel looking stuck.
                                    <div className="flex flex-col items-center gap-4 py-10 text-center">
                                        <div className="flex size-10 items-center justify-center rounded-full bg-foreground/8">
                                            <Sparkles className="size-5 text-muted-foreground" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm font-medium text-foreground">Ask about your projects</p>
                                            <p className="text-xs text-muted-foreground">
                                                It can look things up and take action — always asking first.
                                            </p>
                                        </div>
                                        <SuggestionList onPick={submit} />
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-center py-10">
                                        <ThinkingDots />
                                    </div>
                                )
                            ) : (
                                <>
                                    {messages.map((message) => (
                                        <AgentMessage key={message.id} message={message} />
                                    ))}
                                    {/* Only the opening briefing is showing so far —
                                        the suggestions are still a useful shortcut. */}
                                    {!hasUserMessage && <SuggestionList onPick={submit} />}
                                </>
                            )}
                            {isThinking && (
                                <div className="pl-8">
                                    <ThinkingDots />
                                </div>
                            )}
                            {error && (
                                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                    {error}
                                </div>
                            )}
                        </div>

                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                submit();
                            }}
                            className="glass-modal mt-5 flex w-full max-w-lg items-end gap-2 rounded-full border border-border/60 p-2 shadow-lg"
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
                                className="min-h-9 max-h-32 resize-none border-none bg-transparent px-3 py-1.5 shadow-none focus-visible:ring-0"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                className="shrink-0 rounded-full"
                                disabled={isThinking || !input.trim()}
                                aria-label="Send message"
                            >
                                <Send className="size-4" />
                            </Button>
                        </form>
                    </div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}

function ThinkingDots() {
    return (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="flex gap-1">
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
            </span>
        </span>
    );
}

function SuggestionList({ onPick }: { onPick: (text: string) => void }) {
    return (
        <div className="flex w-full flex-col gap-1.5">
            {SUGGESTIONS.map((suggestion) => (
                <button
                    key={suggestion}
                    type="button"
                    onClick={() => onPick(suggestion)}
                    className="rounded-full border border-border/60 px-3 py-2 text-left text-xs text-muted-foreground backdrop-blur-sm transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                    {suggestion}
                </button>
            ))}
        </div>
    );
}
