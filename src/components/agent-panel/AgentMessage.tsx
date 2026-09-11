import { Sparkles } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";

import { cn } from "@/lib/utils.ts";
import type { AgentChatMessage } from "@/ai/types.ts";

/**
 * Deliberately not the `@tailwindcss/typography` `prose` classes — those
 * assume an article's worth of width and bring their own color variables.
 * These overrides just render plain elements with tight, chat-sized spacing
 * and no explicit color, so they inherit whatever `text-foreground` the row
 * around them already set — there's no bubble background to inherit from
 * any more, just floating text.
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
    // A floating line of text is not an article — a heading here is just an
    // emphasised line, not a size jump.
    h1: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
    h2: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
    h3: ({ children }) => <p className="mb-1 font-semibold">{children}</p>,
};

/**
 * No bubble, no fill color — a user turn and an AI turn are told apart by
 * alignment and a weight/color shift instead: the user's own words sit
 * right-aligned and slightly muted, the AI's response left-aligned at full
 * strength with the small sparkle mark, so a single line still reads
 * correctly even out of context.
 */
export default function AgentMessage({ message }: { message: AgentChatMessage }) {
    const isUser = message.role === "user";

    if (isUser) {
        return (
            <div className="flex justify-end">
                <p className="max-w-[85%] text-right text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/70">
                    {message.text}
                </p>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2.5">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/8">
                <Sparkles className="size-3 text-muted-foreground" />
            </div>
            <div className="max-w-[85%] pt-0.5 text-[15px] leading-relaxed break-words text-foreground">
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{message.text}</ReactMarkdown>
            </div>
        </div>
    );
}
