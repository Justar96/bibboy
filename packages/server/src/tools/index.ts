import type { AgentPose, ChatMessage } from "@bibboy/shared"
import type { AgentTool, ToolRegistry } from "./types"
import { createWebSearchTool } from "./web-search"
import { createWebFetchTool } from "./web-fetch"
import { createMemorySearchTool, createMemoryGetTool } from "./memory-search"
import { createWorkspaceTools } from "./workspace-tools"
import { createSetCharacterPoseTool } from "./set-character-pose"
import {
  createCanvasTools,
  type CanvasToolRuntime,
} from "./canvas-tools"
import { createSoulTools } from "./soul-tools"
import type { SoulToolRuntime } from "../services/SoulStateService"
import type { ResolvedAgentConfig, ToolProfile } from "../agents/AgentConfig"

// ============================================================================
// Tool Profiles (matching reference implementation)
// ============================================================================

const TOOL_PROFILES: Record<ToolProfile, string[]> = {
  minimal: ["memory_search", "memory_get"],
  coding: ["memory_search", "memory_get", "read_file", "write_file", "list_files", "web_search", "web_fetch"],
  messaging: [
    "memory_search",
    "memory_get",
    "web_search",
    "web_fetch",
    "set_character_pose",
    "canvas_get_state",
    "canvas_set_layer_variant",
    "canvas_set_layer_color",
    "canvas_set_palette",
    "canvas_set_pose",
    "canvas_set_animation",
    "canvas_reset_character",
    "canvas_undo",
    "canvas_export_blueprint",
    "soul_observe_trait",
    "soul_get_state",
  ],
  full: [], // Empty means all tools allowed
}

/**
 * Resolve effective allow list from profile and explicit settings.
 */
function resolveEffectiveAllowList(tools: ResolvedAgentConfig["tools"]): string[] {
  const profile = tools.profile
  const explicitAllow = tools.allow
  const alsoAllow = tools.alsoAllow

  // If explicit allow list is set, use it (profile ignored)
  if (explicitAllow.length > 0) {
    return [...explicitAllow, ...alsoAllow]
  }

  // If profile is set, use profile's tools + alsoAllow
  if (profile && TOOL_PROFILES[profile]) {
    const profileTools = TOOL_PROFILES[profile]
    // Empty profile means all tools (full)
    if (profileTools.length === 0) {
      return [...alsoAllow] // Will be interpreted as "all" when empty
    }
    return [...profileTools, ...alsoAllow]
  }

  // No profile, no explicit allow - return alsoAllow (will be "all" if empty)
  return [...alsoAllow]
}

// ============================================================================
// Tool Registry
// ============================================================================

/**
 * Create a tool registry with all available tools.
 */
export function createToolRegistry(
  agentConfig: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[],
  sendPoseChange?: (pose: AgentPose) => void,
  canvasRuntime?: CanvasToolRuntime,
  soulRuntime?: SoulToolRuntime
): ToolRegistry {
  const tools: AgentTool[] = []
  const effectiveAllowList = resolveEffectiveAllowList(agentConfig.tools)
  const denyList = agentConfig.tools.deny

  const shouldInclude = (name: string): boolean => {
    // If deny list has this tool, exclude it
    if (denyList.length > 0 && denyList.includes(name)) {
      return false
    }
    // If effective allow list is empty, include all; otherwise check if in allow list
    if (effectiveAllowList.length === 0) {
      return true
    }
    return effectiveAllowList.includes(name)
  }

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

  // Add soul evolution tools (session-scoped)
  if (soulRuntime) {
    const soulTools = createSoulTools(soulRuntime)
    for (const tool of soulTools) {
      if (shouldInclude(tool.name)) {
        tools.push(tool)
      }
    }
  }

  return {
    tools,
    get: (name: string) => tools.find((t) => t.name === name),
    getDefinitions: () => tools.map((tool) => ({
      type: "function" as const,
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    })),
  }
}

// Re-exports
export type { AgentTool, ToolRegistry, FunctionToolDefinition } from "./types"
export { jsonResult, errorResult, truncateText } from "./types"
export { createWebSearchTool } from "./web-search"
export { createWebFetchTool } from "./web-fetch"
export { createMemorySearchTool, createMemoryGetTool } from "./memory-search"
export { createWorkspaceTools } from "./workspace-tools"
export { createSetCharacterPoseTool } from "./set-character-pose"
export { createCanvasTools, type CanvasToolRuntime } from "./canvas-tools"
export { createSoulTools } from "./soul-tools"
export { compactToolResult, resetResultCounter } from "./tool-result-store"
