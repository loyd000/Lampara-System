import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

import { AgentApiError, AgentConfigError, runAgentTurn, type AgentMessage } from "@/ai/agent.ts";
import type { AgentChatMessage } from "@/ai/types.ts";
import { useCurrentUser } from "@/lib/supabase/hooks.ts";

let lastMessageId = 0;
function nextMessageId(): string {
    lastMessageId += 1;
    return `agent-msg-${lastMessageId}`;
}

/**
 * Conversation state + the Claude multi-turn loop for the AI assistant panel.
 *
 * The Anthropic message history (tool calls and all) lives in a ref, not
 * state — the panel only ever needs to render the human-readable
 * `messages` list, and the raw history would otherwise force a re-render on
 * every internal tool round.
 */
export function useAgent() {
    const { data: user } = useCurrentUser();
    const navigate = useNavigate();
    const [messages, setMessages] = useState<AgentChatMessage[]>([]);
    const [isThinking, setIsThinking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const historyRef = useRef<AgentMessage[]>([]);

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || isThinking) return;
            if (!user) {
                setError("Still loading your account — try again in a moment.");
                return;
            }

            setError(null);
            setMessages((prev) => [...prev, { id: nextMessageId(), role: "user", text: trimmed }]);
            setIsThinking(true);

            try {
                const result = await runAgentTurn(historyRef.current, trimmed, {
                    userId: user._id,
                    userName: user.name ?? user.email ?? "there",
                    userRole: user.role,
                    today: format(new Date(), "yyyy-MM-dd"),
                    navigate,
                });
                historyRef.current = result.history;
                setMessages((prev) => [
                    ...prev,
                    {
                        id: nextMessageId(),
                        role: "assistant",
                        text: result.text || "I don't have anything to add to that.",
                    },
                ]);
            } catch (err) {
                // The raw error (status code, the proxy's own message) is worth
                // having in devtools even though the chat bubble stays generic
                // — "something went wrong" alone isn't enough to tell a rate
                // limit apart from a bad API key from a network blip.
                console.error("Lampara AI turn failed:", err);
                setError(errorMessageFor(err));
            } finally {
                setIsThinking(false);
            }
        },
        [isThinking, user, navigate],
    );

    const clear = useCallback(() => {
        historyRef.current = [];
        setMessages([]);
        setError(null);
    }, []);

    return { messages, send, clear, isThinking, error };
}

function errorMessageFor(err: unknown): string {
    if (err instanceof AgentConfigError) return err.message;
    if (err instanceof AgentApiError) {
        if (err.status === 429) {
            return "Hit the Claude API's rate limit — wait a moment and try again.";
        }
        if (err.status === 401) {
            return "Your session expired — sign in again to use the AI assistant.";
        }
        if (err.message) return err.message;
    }
    return "Something went wrong talking to the AI assistant. Please try again.";
}
