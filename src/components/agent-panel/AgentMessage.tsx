import { Sparkles } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";

import { cn } from "@/lib/utils.ts";
import type { AgentChatMessage } from "@/ai/types.ts";

/**
 * Deliberately not the `@tailwindcss/typography` `prose` classes — those
 * assume an article's worth of width and bring their own color variables
 * that would fight the bubble's `text-primary-foreground` /
 * `text-secondary-foreground`. These overrides just render plain elements
 * with tight, chat-sized spacing and no explicit color, so they inherit
 * whatever the bubble around them already set.
 */
const MARKDOWN_COMPONENTS: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>,
    li: ({ children }) => <li className="pl-0.5 marker:text-current/60">{children}</li>,
    code: ({ children }) => (
        <code className="rounded bg-current/10 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
    ),
    a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {children}
        </a>
    ),
    // A chat bubble is not an article — a heading here is just an emphasised
    // line, not a size jump.
    h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
    h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
    h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
};

export default function AgentMessage({ message }: { message: AgentChatMessage }) {
    const isUser = message.role === "user";

    return (
        <div className={cn("flex gap-2", isUser && "justify-end")}>
            {!isUser && (
                <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary">
                    <Sparkles className="size-3 text-muted-foreground" />
                </div>
            )}
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm break-words",
                    isUser
                        ? "rounded-br-sm bg-primary text-primary-foreground whitespace-pre-wrap"
                        : "rounded-bl-sm bg-secondary text-secondary-foreground",
                )}
            >
                {isUser ? message.text : <ReactMarkdown components={MARKDOWN_COMPONENTS}>{message.text}</ReactMarkdown>}
            </div>
        </div>
    );
}
