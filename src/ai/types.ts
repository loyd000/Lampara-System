import type { UserRole } from "@/lib/supabase/database.types.ts";

/** One line of the visible chat transcript. Not the same shape as an
 * Anthropic `MessageParam` — this is only what the panel renders. */
export type AgentChatMessage = {
    id: string;
    role: "user" | "assistant";
    text: string;
};

/** Who is asking, passed into every tool call so a tool can scope its own
 * queries (or refuse) without re-fetching the current user itself. */
export type AgentContext = {
    userId: string;
    userName: string;
    userRole: UserRole;
    /** yyyy-mm-dd, resolved once per conversation so "today"/"this week" mean
     * the same day throughout a multi-tool-call turn. */
    today: string;
};

/** What a tool hands back to the model. Always JSON-serialisable — this is
 * exactly what becomes a `tool_result` block's `content`. An `error` key
 * signals failure to the model without throwing out of the agent loop. */
export type ToolResult = Record<string, unknown>;

/**
 * Deliberately a local, minimal shape rather than `Anthropic.Tool` imported
 * from `@anthropic-ai/sdk` — that package is server-only (see api/agent.ts);
 * this file is imported from browser code, and a type-only import would be
 * erased at build time anyway, but keeping the client's tool layer decoupled
 * from the SDK means nothing has to be reconsidered if the proxy's SDK ever
 * changes.
 */
export type AgentToolDeclaration = {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
};

export type AgentTool = {
    declaration: AgentToolDeclaration;
    run: (args: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
};
