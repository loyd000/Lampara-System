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

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
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
     * the next call so Claude keeps the thread. */
    history: AgentMessage[];
};

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
            body: JSON.stringify({ system, messages, tools: AGENT_TOOL_DECLARATIONS }),
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

export async function runAgentTurn(
    history: AgentMessage[],
    userText: string,
    ctx: AgentContext,
): Promise<AgentTurnResult> {
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
            const result = tool
                ? await tool.run(call.input, ctx).catch((err: unknown) => ({
                      error: err instanceof Error ? err.message : "Tool call failed",
                  }))
                : { error: `Unknown tool: ${call.name}` };
            resultBlocks.push({
                type: "tool_result",
                tool_use_id: call.id,
                content: JSON.stringify(result),
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
