import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils.ts";
import type { AgentChatMessage } from "@/ai/types.ts";

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
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                    isUser
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-secondary text-secondary-foreground",
                )}
            >
                {message.text}
            </div>
        </div>
    );
}
