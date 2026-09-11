import type { AgentTool } from "../types.ts";
import {
    getContractTool,
    getOcularReportTool,
    getPipelineSummaryTool,
    getProjectTool,
    getScheduleTool,
    getTeamTool,
    listPackagesTool,
    listProjectsTool,
    listTicketsTool,
} from "./read-tools.ts";
import {
    addLeadNoteTool,
    createQuoteTool,
    navigateTool,
    scheduleInspectionTool,
    scheduleInstallationTool,
    updateProjectStageTool,
} from "./write-tools.ts";

/** Every tool the agent can call, keyed by the name Claude calls it by. */
export const AGENT_TOOLS: Record<string, AgentTool> = {
    [listProjectsTool.declaration.name]: listProjectsTool,
    [getProjectTool.declaration.name]: getProjectTool,
    [getScheduleTool.declaration.name]: getScheduleTool,
    [listPackagesTool.declaration.name]: listPackagesTool,
    [getTeamTool.declaration.name]: getTeamTool,
    [getContractTool.declaration.name]: getContractTool,
    [getOcularReportTool.declaration.name]: getOcularReportTool,
    [listTicketsTool.declaration.name]: listTicketsTool,
    [getPipelineSummaryTool.declaration.name]: getPipelineSummaryTool,
    [createQuoteTool.declaration.name]: createQuoteTool,
    [scheduleInspectionTool.declaration.name]: scheduleInspectionTool,
    [scheduleInstallationTool.declaration.name]: scheduleInstallationTool,
    [updateProjectStageTool.declaration.name]: updateProjectStageTool,
    [addLeadNoteTool.declaration.name]: addLeadNoteTool,
    [navigateTool.declaration.name]: navigateTool,
};

/**
 * The full tool list is identical on every single call this app ever makes
 * — same names, same schemas, regardless of who's asking or what they
 * asked. That makes it a textbook prompt-caching candidate: a breakpoint on
 * the last entry tells Claude "everything up to here is worth caching",
 * so every call after the first pays 10% of the input price for this whole
 * block instead of full price. `1h` (rather than the 5-minute default) is
 * worth it here specifically because query volume is low — a longer TTL
 * means a cache written by this morning's first question is still warm for
 * one asked mid-afternoon.
 */
export const AGENT_TOOL_DECLARATIONS = Object.values(AGENT_TOOLS).map((tool) => tool.declaration);
const lastToolDeclaration = AGENT_TOOL_DECLARATIONS[AGENT_TOOL_DECLARATIONS.length - 1];
if (lastToolDeclaration) {
    lastToolDeclaration.cache_control = { type: "ephemeral", ttl: "1h" };
}
