import type { AgentTool } from "../types.ts";
import { getProjectTool, getScheduleTool, listProjectsTool } from "./read-tools.ts";

/**
 * Every tool the agent can call, keyed by the name Claude calls it by. Phase
 * 2 adds a `write-tools.ts` alongside this one and merges it in here — the
 * loop in `agent.ts` doesn't change, only this list grows.
 */
export const AGENT_TOOLS: Record<string, AgentTool> = {
    [listProjectsTool.declaration.name]: listProjectsTool,
    [getProjectTool.declaration.name]: getProjectTool,
    [getScheduleTool.declaration.name]: getScheduleTool,
};

export const AGENT_TOOL_DECLARATIONS = Object.values(AGENT_TOOLS).map((tool) => tool.declaration);
