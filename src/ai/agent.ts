/**
 * Claude client wrapper — talks to our own `/api/agent` proxy, never to
 * api.anthropic.com directly. The Anthropic API key lives only in that
 * serverless function's environment (see api/agent.ts for why: unlike
 * Gemini, an Anthropic key can't be restricted to a domain, so it can never
 * safely ship in the browser bundle).
 *
 * Tool execution stays client-side and RLS-scoped to the signed-in user (see
 * tools/read-tools.ts) — the proxy only relays the raw "what should happen
 * next" call to Claude and hands its response back untouched. This module
 * runs the multi-round tool-calling loop on top of that single-call proxy.
 *
 * Prompt caching: the system prompt and the tool list (see tools/index.ts)
 * are cached with a 1-hour breakpoint each — both are effectively static
 * across a whole day for one user, so this is a straightforward win. The
 * conversation history gets its own breakpoint too, rebuilt fresh on every
 * call — the actual biggest cost driver here isn't repeat *questions*
 * (nothing here recognises "you asked this before" and skips the model; a
 * project's data changes constantly, so every question still gets a real
 * answer from a real tool call) but the *same* question's own multi-round
 * tool-calling loop resending its growing history on every round.
 */
import { supabase } from "@/lib/supabase/client.ts";
import { AGENT_TOOLS, AGENT_TOOL_DECLARATIONS } from "./tools/index.ts";
import { buildSystemPrompt } from "./prompts.ts";
import type { AgentContext } from "./types.ts";

/** A tool-call chain longer than this almost certainly means the model is
 * stuck — better to stop and say so than burn calls silently. */
const MAX_TOOL_ROUNDS = 8;

/** The proxy hasn't been configured yet (no ANTHROPIC_API_KEY on the
 * server) — distinct from a request/network failure so the panel can say
 * something more useful than "try again". */
export class AgentConfigError extends Error {}

/** Anything the proxy or Claude itself rejected the request for — carries
 * the HTTP status so the UI can tell a rate limit apart from everything
 * else. */
export class AgentApiError extends Error {
    status?: number;
    constructor(message: string, status?: number) {
        super(message);
        this.status = status;
    }
}

// ─── Message shapes ──────────────────────────────────────────────────────
// Mirrors the wire shape of Anthropic's Messages API structurally, rather
// than importing `@anthropic-ai/sdk` here — that package is server-only
// (see types.ts for the same reasoning on tool declarations). This is JSON
// over `fetch`, so duck-typing the shape is all that's actually required.

type CacheControl = { type: "ephemeral"; ttl?: "5m" | "1h" };
type TextBlock = { type: "text"; text: string; cache_control?: CacheControl };
type ToolUseBlock = {
    type: "tool_use";
    id: string;
    name: string;
    input: Record<string, unknown>;
    cache_control?: CacheControl;
};
type ToolResultBlock = {
    type: "tool_result";
    tool_use_id: string;
    content: string;
    is_error?: boolean;
    cache_control?: CacheControl;
};
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export type AgentMessage = {
    role: "user" | "assistant";
    content: string | ContentBlock[];
};

type ProxyResponseBody = {
    content?: ContentBlock[];
    stop_reason?: string | null;
    error?: string;
};

export type AgentTurnResult = {
    text: string;
    /** The full message history including this turn — pass back in as-is on
     * the next call so Claude keeps the thread. Never carries the
     * wire-only `cache_control` markers `withHistoryCacheBreakpoint` adds;
     * those are rebuilt fresh for each outgoing request instead. */
    history: AgentMessage[];
};

function stripCacheControl(block: ContentBlock): ContentBlock {
    return { ...block, cache_control: undefined };
}

/**
 * Returns a wire copy of `messages` with exactly one cache breakpoint: the
 * last content block of the last message. Anthropic caches everything up to
 * and including a marked block, so as a tool-calling loop's history grows
 * round by round, each subsequent call only pays full input price for
 * what's new since the previous one, instead of the whole (growing)
 * conversation every time.
 *
 * Always strips any breakpoints from earlier rounds first rather than
 * accumulating one per round — Anthropic allows at most 4 cache_control
 * breakpoints per request, and this one plus the tools' and system's would
 * exceed that on a long enough chain otherwise. `messages` itself (the
 * conversation history returned to the caller and kept in the panel's ref)
 * is never mutated — these markers only ever exist on the copy sent over
 * the wire.
 */
function withHistoryCacheBreakpoint(messages: AgentMessage[]): AgentMessage[] {
    const wire: AgentMessage[] = messages.map((m) => ({
        role: m.role,
        content: typeof m.content === "string" ? m.content : m.content.map(stripCacheControl),
    }));

    const last = wire[wire.length - 1];
    if (!last) return wire;

    if (typeof last.content === "string") {
        last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
        return wire;
    }
    if (last.content.length === 0) return wire;

    const lastIndex = last.content.length - 1;
    last.content = last.content.map((block, i) =>
        i === lastIndex ? { ...block, cache_control: { type: "ephemeral" } } : block,
    );
    return wire;
}

async function callProxy(messages: AgentMessage[], system: string): Promise<ContentBlock[]> {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
        throw new AgentApiError("Your session expired — sign in again to use the AI assistant.", 401);
    }

    let res: Response;
    try {
        res = await fetch("/api/agent", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                // Identical for a given user on a given day (see
                // prompts.ts) — a 1-hour breakpoint means the first
                // question of the morning keeps this warm for the rest of
                // the day, not just the next few minutes.
                system: [{ type: "text", text: system, cache_control: { type: "ephemeral", ttl: "1h" } }],
                messages: withHistoryCacheBreakpoint(messages),
                tools: AGENT_TOOL_DECLARATIONS,
            }),
        });
    } catch {
        throw new AgentApiError("Couldn't reach the AI assistant — check your connection and try again.");
    }

    const body = (await res.json().catch(() => null)) as ProxyResponseBody | null;

    if (!res.ok) {
        if (res.status === 501) {
            throw new AgentConfigError(
                body?.error ?? "ANTHROPIC_API_KEY is not set on the server — add it in Vercel's project settings.",
            );
        }
        throw new AgentApiError(body?.error ?? `AI assistant request failed (${res.status}).`, res.status);
    }

    return body?.content ?? [];
}

/**
 * A message's content is "plain text" if it's a bare string, or an array
 * where every block is `type: "text"` — i.e. the model made no tool calls
 * in that turn at all.
 */
function isTextOnly(content: AgentMessage["content"]): boolean {
    if (typeof content === "string") return true;
    return content.every((block) => block.type === "text");
}

/**
 * Which write tools (if any) are confirmed for round 0 of *this* turn —
 * derived entirely from the incoming history, not from separate state the
 * hook has to remember to thread through correctly.
 *
 * A tool counts as confirmed only if the turn immediately before this one
 * ended in plain text (the model described something and stopped, rather
 * than continuing to call tools) *and* the tool_result turn immediately
 * before that text was the specific "not confirmed yet" refusal this same
 * loop produces below, naming that tool. That refusal is what proposing a
 * write action actually looks like in this history: a blocked tool_use
 * followed by the model's own plain-text description of what it just tried
 * to do. Anything else — an empty history, the previous turn ending
 * mid-tool-call, a stale confirmation from several turns back — yields no
 * confirmed tools, and confirmation never carries into round 1+ of the
 * *same* turn regardless, since by construction this is only ever computed
 * once, from history as it stood before the current turn started.
 */
export function confirmedToolNames(history: AgentMessage[]): Set<string> {
    const confirmed = new Set<string>();
    const lastMessage = history[history.length - 1];
    if (!lastMessage || lastMessage.role !== "assistant" || !isTextOnly(lastMessage.content)) {
        return confirmed;
    }

    const priorMessage = history[history.length - 2];
    if (!priorMessage || priorMessage.role !== "user" || typeof priorMessage.content === "string") {
        return confirmed;
    }

    for (const block of priorMessage.content) {
        if (block.type !== "tool_result") continue;
        try {
            const parsed = JSON.parse(block.content) as { pendingConfirmation?: unknown };
            if (typeof parsed.pendingConfirmation === "string") confirmed.add(parsed.pendingConfirmation);
        } catch {
            // Not JSON, or not our shape — not a confirmation marker.
        }
    }
    return confirmed;
}

export async function runAgentTurn(
    history: AgentMessage[],
    userText: string,
    ctx: AgentContext,
): Promise<AgentTurnResult> {
    // Computed once, from history as it stood *before* this turn — never
    // recomputed mid-loop, which is exactly what stops a write tool from
    // being confirmed by anything that happens within this same turn.
    const confirmedThisTurn = confirmedToolNames(history);

    const messages: AgentMessage[] = [...history, { role: "user", content: userText }];
    const system = buildSystemPrompt(ctx);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const content = await callProxy(messages, system);
        messages.push({ role: "assistant", content });

        const toolUses = content.filter((block): block is ToolUseBlock => block.type === "tool_use");

        if (toolUses.length === 0) {
            const text = content
                .filter((block): block is TextBlock => block.type === "text")
                .map((block) => block.text)
                .join("\n")
                .trim();
            return { text, history: messages };
        }

        const resultBlocks: ToolResultBlock[] = [];
        for (const call of toolUses) {
            const tool = AGENT_TOOLS[call.name];

            let result: Record<string, unknown>;
            if (!tool) {
                result = { error: `Unknown tool: ${call.name}` };
            } else if (tool.requiresConfirmation && !(round === 0 && confirmedThisTurn.has(call.name))) {
                // Blocked regardless of what the model's own arguments or
                // reasoning claim — this is the code-enforced version of
                // the system prompt's "describe it and wait" rule. The
                // model's very next plain-text reply, if it names this
                // tool again, is what `confirmedToolNames` looks for on
                // the *following* turn.
                result = {
                    error:
                        "This action has not been confirmed yet. Describe exactly what you're " +
                        "about to do in a plain-text reply and wait for the user's next message " +
                        "before calling this tool again — do not retry it in this same turn.",
                    pendingConfirmation: call.name,
                };
            } else {
                result = await tool.run(call.input, ctx).catch((err: unknown) => ({
                    error: err instanceof Error ? err.message : "Tool call failed",
                }));
            }

            resultBlocks.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: JSON.stringify(result),
                is_error: typeof result.error === "string" || undefined,
            });
        }
        // A tool_result turn must be role "user" and come immediately after
        // the assistant turn holding the matching tool_use block(s).
        messages.push({ role: "user", content: resultBlocks });
    }

    return {
        text: "That took more steps than I'm allowed to chain at once — try asking in a simpler way.",
        history: messages,
    };
}
