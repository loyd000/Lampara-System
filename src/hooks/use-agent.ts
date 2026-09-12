import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

import { AgentApiError, AgentConfigError, runAgentTurn, type AgentMessage } from "@/ai/agent.ts";
import { buildDailyBriefing } from "@/ai/briefing.ts";
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
    // Ticks up on every `clear()` so the briefing effect below re-fires for a
    // fresh conversation — `user` alone doesn't change on clear.
    const [briefingAttempt, setBriefingAttempt] = useState(0);
    // False until the briefing fetch has settled (success or failure), so
    // the panel knows whether "no messages yet" means "still loading" or
    // "the briefing failed, fall back to the static empty state".
    const [briefingReady, setBriefingReady] = useState(false);
    const historyRef = useRef<AgentMessage[]>([]);
    // `isThinking` (state) is what the panel renders, but state updates are
    // batched/async — a fast double-submit (Enter plus a stray click before
    // repaint) could see the stale `false` twice and start two concurrent
    // turns sharing one `historyRef` snapshot. This ref is set synchronously,
    // before either `await`, so the second call's guard actually sees the
    // first call's claim.
    const isThinkingRef = useRef(false);
    // Bumped by every `send()` and by `clear()`. A turn's result is only
    // applied if the generation it started with is still current when it
    // resolves — otherwise `clear()` (or a newer `send()`) already moved the
    // conversation on, and this turn's answer would otherwise land in a
    // conversation it was never actually part of.
    const generationRef = useRef(0);

    // The opening message: today's schedule + which projects have gone
    // quiet, computed directly (see briefing.ts) — not a Claude turn, so it
    // never touches historyRef and costs nothing. Only ever fills messages
    // while it's still empty, so it can't clobber a conversation already in
    // progress if this re-fires for any reason.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;

        buildDailyBriefing()
            .then((text) => {
                if (cancelled) return;
                setMessages((prev) =>
                    prev.length === 0 ? [{ id: nextMessageId(), role: "assistant", text }] : prev,
                );
            })
            .catch((err: unknown) => {
                // Best-effort: a failed briefing just means the panel falls
                // back to its static empty state, not an error the user needs
                // to see before they've asked anything.
                console.warn("Daily briefing failed to load:", err);
            })
            .finally(() => {
                if (!cancelled) setBriefingReady(true);
            });

        return () => {
            cancelled = true;
        };
    }, [user, briefingAttempt]);

    const send = useCallback(
        async (text: string) => {
            const trimmed = text.trim();
            if (!trimmed || isThinkingRef.current) return;
            if (!user) {
                setError("Still loading your account — try again in a moment.");
                return;
            }

            isThinkingRef.current = true;
            const generation = ++generationRef.current;

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
                // Stale: `clear()` or a newer `send()` moved the conversation
                // on while this turn was in flight. Applying it now would
                // silently resurrect a cleared/superseded conversation.
                if (generationRef.current !== generation) return;
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
                if (generationRef.current !== generation) return;
                // The raw error (status code, the proxy's own message) is worth
                // having in devtools even though the chat bubble stays generic
                // — "something went wrong" alone isn't enough to tell a rate
                // limit apart from a bad API key from a network blip.
                console.error("Lampara AI turn failed:", err);
                setError(errorMessageFor(err));
            } finally {
                if (generationRef.current === generation) {
                    isThinkingRef.current = false;
                    setIsThinking(false);
                }
            }
        },
        [user, navigate],
    );

    const clear = useCallback(() => {
        // Invalidates any turn still in flight — its eventual result will see
        // a mismatched generation above and be discarded instead of landing
        // in the fresh conversation this starts.
        generationRef.current += 1;
        isThinkingRef.current = false;
        historyRef.current = [];
        setMessages([]);
        setError(null);
        setIsThinking(false);
        setBriefingReady(false);
        setBriefingAttempt((n) => n + 1);
    }, []);

    return { messages, send, clear, isThinking, error, briefingReady };
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
