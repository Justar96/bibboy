import type { AgentPose, ChatMessage } from "@bibboy/shared"
import type { AgentTool, ToolRegistry, ToolGroupName, ToolGroupInfo, ToolExecutionContext } from "./types"
import { createWebSearchTool } from "./web-search"
import { createWebFetchTool } from "./web-fetch"
import { createMemorySearchTool, createMemoryGetTool } from "./memory-search"
import { createWorkspaceTools } from "./workspace-tools"
import { createSetCharacterPoseTool } from "./set-character-pose"
import {
  createCanvasTools,
  type CanvasToolRuntime,
} from "./canvas-tools"
import type { ResolvedAgentConfig } from "../agents/AgentConfig"
import {
  TOOL_GROUPS,
  resolveEffectivePolicy,
} from "./tool-policy"

// ============================================================================
// Tool Group Descriptions (for request_tools meta-tool)
// ============================================================================

const TOOL_GROUP_DESCRIPTIONS: Record<ToolGroupName, string> = {
  core: "Memory search, task suggestions, and character pose",
  web: "Web search and URL content fetching",
  canvas: "Pixel character builder — layers, colors, poses, animations",
  workspace: "File read/write/list for workspace context",
}

const TOOL_GROUP_NAMES: Record<ToolGroupName, string[]> = {
  core: TOOL_GROUPS["group:core"],
  web: TOOL_GROUPS["group:web"],
  canvas: TOOL_GROUPS["group:canvas"],
  workspace: TOOL_GROUPS["group:workspace"],
}

function isToolGroupName(value: string): value is ToolGroupName {
  return value in TOOL_GROUP_NAMES
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Create tools for a specific group on demand (for request_tools dynamic loading).
 */
function createGroupTools(
  group: ToolGroupName,
  config: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[],
  sendPoseChange?: (pose: AgentPose) => void,
  canvasRuntime?: CanvasToolRuntime,
): AgentTool[] {
  switch (group) {
    case "core": {
      const coreParts: AgentTool[] = []
      if (config.memorySearch.enabled) {
        coreParts.push(createMemorySearchTool(config, getSessionMessages))
        coreParts.push(createMemoryGetTool(config, getSessionMessages))
      }
      if (sendPoseChange) {
        coreParts.push(createSetCharacterPoseTool(sendPoseChange))
      }
      return coreParts
    }
    case "web": {
      const webParts: AgentTool[] = []
      const ws = createWebSearchTool()
      if (ws) webParts.push(ws)
      webParts.push(createWebFetchTool())
      return webParts
    }
    case "canvas":
      return canvasRuntime ? createCanvasTools(canvasRuntime) : []
    case "workspace":
      return createWorkspaceTools(config.id)
  }
}

/**
 * Create a tool registry with all available tools.
 * Uses compiled policy matching (deny-first) for efficient tool filtering.
 */
export function createToolRegistry(
  agentConfig: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[],
  sendPoseChange?: (pose: AgentPose) => void,
  canvasRuntime?: CanvasToolRuntime,
): ToolRegistry {
  const tools: AgentTool[] = []

  // Use compiled policy matcher (deny-first evaluation)
  const shouldInclude = resolveEffectivePolicy({
    profile: agentConfig.tools.profile,
    allow: agentConfig.tools.allow,
    alsoAllow: agentConfig.tools.alsoAllow,
    deny: agentConfig.tools.deny,
  })

  // Add web search tool (if API key available)
  const webSearch = createWebSearchTool()
  if (webSearch && shouldInclude("web_search")) {
    tools.push(webSearch)
  }

  // Add web fetch tool
  if (shouldInclude("web_fetch")) {
    tools.push(createWebFetchTool())
  }

  // Add memory tools (if memory search is enabled)
  if (agentConfig.memorySearch.enabled) {
    if (shouldInclude("memory_search")) {
      tools.push(createMemorySearchTool(agentConfig, getSessionMessages))
    }
    if (shouldInclude("memory_get")) {
      tools.push(createMemoryGetTool(agentConfig, getSessionMessages))
    }
  }

  // Add workspace file tools
  const workspaceTools = createWorkspaceTools(agentConfig.id)
  for (const tool of workspaceTools) {
    if (shouldInclude(tool.name)) {
      tools.push(tool)
    }
  }

  // Add character pose tool (when pose change callback is available)
  if (sendPoseChange && shouldInclude("set_character_pose")) {
    tools.push(createSetCharacterPoseTool(sendPoseChange))
  }

  // Add canvas builder tools (session-scoped)
  if (canvasRuntime) {
    const canvasTools = createCanvasTools(canvasRuntime)
    for (const tool of canvasTools) {
      if (shouldInclude(tool.name)) {
        tools.push(tool)
      }
    }
  }

  const loadedGroups = new Set<ToolGroupName>()

  // Determine which groups are loaded based on included tools
  for (const [group, names] of Object.entries(TOOL_GROUP_NAMES) as [ToolGroupName, string[]][]) {
    if (names.some((n) => tools.some((t) => t.name === n))) {
      loadedGroups.add(group)
    }
  }

  // Add request_tools meta-tool (lets the agent load additional tool groups mid-conversation)
  if (shouldInclude("request_tools")) {
    tools.push({
      label: "Request Tools",
      name: "request_tools",
      description:
        "Load additional tool groups into this conversation. " +
        "Call this when you need capabilities not currently available. " +
        "Available groups: " +
        (Object.keys(TOOL_GROUP_NAMES) as ToolGroupName[])
          .map((g) => `${g} (${TOOL_GROUP_DESCRIPTIONS[g]})`)
          .join("; "),
      parameters: {
        type: "object",
        properties: {
          groups: {
            type: "string",
            description:
              "Comma-separated group names to load. Available: " +
              Object.keys(TOOL_GROUP_NAMES).join(", "),
          },
        },
        required: ["groups"],
      },
      execute: async (_toolCallId, args) => {
        const groupsStr = typeof args.groups === "string" ? args.groups : ""
        const requested = groupsStr
          .split(",")
          .map((g) => g.trim())
          .filter((g) => g.length > 0)
        const newlyLoaded: ToolGroupName[] = []
        const alreadyLoaded: ToolGroupName[] = []
        const invalidGroups: string[] = []

        for (const group of requested) {
          if (!isToolGroupName(group)) {
            invalidGroups.push(group)
            continue
          }
          if (loadedGroups.has(group)) continue

          // Actually instantiate tools for the requested group
          const newTools = createGroupTools(group, agentConfig, getSessionMessages, sendPoseChange, canvasRuntime)
          const addedNames: string[] = []
          for (const tool of newTools) {
            if (!tools.some((t) => t.name === tool.name)) {
              tools.push(tool)
              addedNames.push(tool.name)
            }
          }

          loadedGroups.add(group)
          newlyLoaded.push(group)
        }

        for (const group of requested) {
          if (!isToolGroupName(group)) continue
          if (!newlyLoaded.includes(group) && loadedGroups.has(group)) {
            alreadyLoaded.push(group)
          }
        }

        const uniqueAlreadyLoaded = Array.from(new Set(alreadyLoaded))
        const uniqueInvalid = Array.from(new Set(invalidGroups))

        let hint =
          newlyLoaded.length > 0
            ? `Groups loaded: ${newlyLoaded.join(", ")}. The tools from these groups are now available in your next tool call.`
            : "All requested groups were already loaded."

        if (uniqueInvalid.length > 0) {
          hint += ` Ignored invalid groups: ${uniqueInvalid.join(", ")}.`
        }

        return {
          toolCallId: _toolCallId,
          content: [{
            type: "text",
            text: JSON.stringify({
              loaded: newlyLoaded,
              alreadyLoaded: uniqueAlreadyLoaded,
              invalidGroups: uniqueInvalid,
              hint,
            }),
          }],
        }
      },
    })
  }

  return {
    tools,
    get: (name: string) => tools.find((t) => t.name === name),
    getDefinitions: () =>
      tools.map((tool) => ({
        type: "function" as const,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    addTools: (newTools: AgentTool[]) => {
      for (const tool of newTools) {
        if (!tools.some((t) => t.name === tool.name)) {
          tools.push(tool)
        }
      }
    },
    getGroups: (): ToolGroupInfo[] =>
      (Object.keys(TOOL_GROUP_NAMES) as ToolGroupName[]).map((name) => ({
        name,
        description: TOOL_GROUP_DESCRIPTIONS[name],
        toolNames: TOOL_GROUP_NAMES[name],
        loaded: loadedGroups.has(name),
      })),
    markGroupLoaded: (group: ToolGroupName) => {
      loadedGroups.add(group)
    },
    isGroupLoaded: (group: ToolGroupName) => loadedGroups.has(group),
    getToolSummary: (): string => {
      if (tools.length === 0) return "No tools available."
      const grouped: Record<string, string[]> = {}
      for (const tool of tools) {
        // Find which group this tool belongs to
        let groupLabel = "other"
        for (const [gName, gTools] of Object.entries(TOOL_GROUP_NAMES)) {
          if (gTools.includes(tool.name)) {
            groupLabel = gName
            break
          }
        }
        if (!grouped[groupLabel]) grouped[groupLabel] = []
        grouped[groupLabel].push(tool.name)
      }
      const lines = [`${tools.length} tools available:`]
      for (const [group, names] of Object.entries(grouped)) {
        lines.push(`  ${group}: ${names.join(", ")}`)
      }
      return lines.join("\n")
    },
  }
}

// Re-exports
export type { AgentTool, ToolRegistry, FunctionToolDefinition, ToolGroupName, ToolGroupInfo, ToolExecutionContext, ToolExecutionMetrics } from "./types"
export { jsonResult, errorResult, truncateText, applyToolWrappers, createToolExecutionMetrics } from "./types"
export { createWebSearchTool } from "./web-search"
export { createWebFetchTool } from "./web-fetch"
export { createMemorySearchTool, createMemoryGetTool } from "./memory-search"
export { createWorkspaceTools } from "./workspace-tools"
export { createSetCharacterPoseTool } from "./set-character-pose"
export { createCanvasTools, type CanvasToolRuntime } from "./canvas-tools"
export { compactToolResult, resetResultCounter } from "./tool-result-store"
export {
  TOOL_GROUPS,
  TOOL_PROFILES,
  compilePattern,
  compilePatterns,
  matchesAny,
  makeToolPolicyMatcher,
  expandToolGroups,
  resolveProfileAllowList,
  resolveEffectivePolicy,
  filterToolsByPolicy,
  type CompiledPattern,
  type ToolPolicy,
} from "./tool-policy"
// New modules (OpenClaw-inspired)
export { wrapToolWithErrorSafety, toSafeToolDefinitions, sanitizeToolResultText, sanitizeToolErrorMessage, makeMissingToolResult } from "./tool-definition-adapter"
export { resolveToolDisplay, formatToolSummary, formatToolCallSummary, type ResolvedToolDisplay } from "./tool-display"
export { buildToolSummaryMap, buildToolListingForPrompt } from "./tool-summaries"
export { createToolResultGuard, repairTranscript, isTranscriptValid, type ToolResultGuard } from "./tool-result-guard"
