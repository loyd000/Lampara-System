import type { AgentTool } from "../types.ts";
import { getProjectTool, getScheduleTool, getTeamTool, listPackagesTool, listProjectsTool } from "./read-tools.ts";
import {
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
    [createQuoteTool.declaration.name]: createQuoteTool,
    [scheduleInspectionTool.declaration.name]: scheduleInspectionTool,
    [scheduleInstallationTool.declaration.name]: scheduleInstallationTool,
    [updateProjectStageTool.declaration.name]: updateProjectStageTool,
    [navigateTool.declaration.name]: navigateTool,
};

export const AGENT_TOOL_DECLARATIONS = Object.values(AGENT_TOOLS).map((tool) => tool.declaration);
