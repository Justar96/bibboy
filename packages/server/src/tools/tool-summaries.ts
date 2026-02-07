// ============================================================================
// Tool Summaries
// ============================================================================
// Builds a name → description map from tools for system prompt injection.
// Adapted from OpenClaw's tool-summaries.ts.
// ============================================================================

import type { AgentTool } from "./types"

/**
 * Build a map of tool name → description for system prompt inclusion.
 * Prefers description over label. Lowercase keys for case-insensitive lookup.
 */
export function buildToolSummaryMap(tools: AgentTool[]): Record<string, string> {
  const summaries: Record<string, string> = {}
  for (const tool of tools) {
    const summary = tool.description?.trim() || tool.label?.trim()
    if (!summary) continue
    summaries[tool.name.toLowerCase()] = summary
  }
  return summaries
}

/**
 * Build a formatted tool listing for the system prompt.
 * Groups tools by category and includes concise descriptions.
 *
 * Format:
 * ```
 * ## Tooling
 * N tools available (filtered by policy). Tool names are case-sensitive.
 * - tool_name: Short description
 * ```
 */
export function buildToolListingForPrompt(
  tools: AgentTool[],
  groupMap?: Record<string, string[]>
): string {
  if (tools.length === 0) return ""

  const lines: string[] = [
    "## Tooling",
    `${tools.length} tools available (filtered by policy). Tool names are case-sensitive. Call tools exactly as listed.`,
    "",
  ]

  if (groupMap && Object.keys(groupMap).length > 0) {
    // Group-organized listing
    const toolsByGroup = new Map<string, AgentTool[]>()
    const ungrouped: AgentTool[] = []

    for (const tool of tools) {
      let found = false
      for (const [group, names] of Object.entries(groupMap)) {
        if (names.includes(tool.name)) {
          const existing = toolsByGroup.get(group) ?? []
          existing.push(tool)
          toolsByGroup.set(group, existing)
          found = true
          break
        }
      }
      if (!found) ungrouped.push(tool)
    }

    for (const [group, groupTools] of toolsByGroup) {
      lines.push(`**${group}:**`)
      for (const tool of groupTools) {
        lines.push(`- ${tool.name}: ${getShortDescription(tool)}`)
      }
      lines.push("")
    }

    if (ungrouped.length > 0) {
      lines.push("**other:**")
      for (const tool of ungrouped) {
        lines.push(`- ${tool.name}: ${getShortDescription(tool)}`)
      }
      lines.push("")
    }
  } else {
    // Flat listing
    for (const tool of tools) {
      lines.push(`- ${tool.name}: ${getShortDescription(tool)}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

/**
 * Get a short (1-line) description of a tool for the system prompt.
 * Truncates long descriptions at the first period or 120 chars.
 */
function getShortDescription(tool: AgentTool): string {
  const desc = tool.description?.trim() || tool.label?.trim() || tool.name

  // Take first sentence
  const firstPeriod = desc.indexOf(". ")
  if (firstPeriod > 0 && firstPeriod < 120) {
    return desc.slice(0, firstPeriod + 1)
  }

  // Truncate
  if (desc.length > 120) {
    return desc.slice(0, 117) + "..."
  }

  return desc
}
