import type { ToolGroupName } from "./types"

// ============================================================================
// Tool Policy (OpenClaw-inspired compiled pattern matching)
// ============================================================================

/**
 * Tool group definitions mapping group:* names to individual tool names.
 * Inspired by OpenClaw's TOOL_GROUPS with deny-first evaluation.
 */
type ToolGroupKey = `group:${ToolGroupName}` | "group:all"
type ToolProfileName = "minimal" | "coding" | "messaging" | "full"

const BASE_TOOL_GROUPS: Record<Exclude<ToolGroupKey, "group:all">, string[]> = {
  "group:core": ["memory_search", "memory_get", "set_character_pose", "task_suggest"],
  "group:web": ["web_search", "web_fetch"],
  "group:canvas": [
    "canvas_get_state", "canvas_set_layer_variant", "canvas_set_layer_color",
    "canvas_set_palette", "canvas_set_pose", "canvas_set_animation",
    "canvas_reset_character", "canvas_undo", "canvas_export_blueprint",
    "canvas_batch_ops", "canvas_randomize_character", "canvas_describe_character",
    "canvas_adjust_color", "canvas_set_layer_visibility", "canvas_cycle_variant",
    "canvas_import_blueprint",
  ],
  "group:soul": ["soul_observe_trait", "soul_get_state"],
  "group:workspace": ["read_file", "write_file", "list_files"],
}

// Build group:all dynamically from all other groups
const groupAllTools = Array.from(new Set(Object.values(BASE_TOOL_GROUPS).flat()))

export const TOOL_GROUPS: Record<ToolGroupKey, string[]> = {
  ...BASE_TOOL_GROUPS,
  "group:all": groupAllTools, // Special: matches everything
}

function isToolGroupKey(value: string): value is ToolGroupKey {
  return value in TOOL_GROUPS
}

/**
 * Tool profiles using group:* syntax for composable tool sets.
 */
export const TOOL_PROFILES: Record<ToolProfileName, string[]> = {
  minimal: ["group:core"],
  coding: ["group:core", "group:web", "group:workspace"],
  messaging: ["group:core", "group:web", "group:canvas", "group:soul", "request_tools"],
  full: [], // Empty = all tools allowed
}

function isToolProfileName(value: string): value is ToolProfileName {
  return value in TOOL_PROFILES
}

// ============================================================================
// Compiled Pattern Matching
// ============================================================================

/** A compiled pattern for efficient tool name matching. */
export type CompiledPattern =
  | { kind: "all" }
  | { kind: "exact"; value: string }
  | { kind: "regex"; value: RegExp }

/**
 * Compile a pattern string into a CompiledPattern.
 * - "*" → matches all
 * - "web_*" → regex /^web_.*$/
 * - "group:core" → expanded to individual tool names
 * - "exec" → exact match
 */
export function compilePattern(pattern: string): CompiledPattern[] {
  const trimmed = pattern.trim()

  if (trimmed === "*") {
    return [{ kind: "all" }]
  }

  // Expand group references to individual tool names
  if (trimmed.startsWith("group:")) {
    if (!isToolGroupKey(trimmed)) return []
    if (trimmed === "group:all") return [{ kind: "all" }]
    return TOOL_GROUPS[trimmed].map((t) => ({ kind: "exact" as const, value: t }))
  }

  // Wildcard pattern
  if (trimmed.includes("*")) {
    const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")
    return [{ kind: "regex", value: new RegExp(`^${escaped}$`) }]
  }

  return [{ kind: "exact", value: trimmed }]
}

/**
 * Compile an array of pattern strings into CompiledPatterns.
 */
export function compilePatterns(patterns: string[]): CompiledPattern[] {
  return patterns.flatMap(compilePattern)
}

/**
 * Check if a tool name matches any of the compiled patterns.
 */
export function matchesAny(name: string, patterns: CompiledPattern[]): boolean {
  for (const p of patterns) {
    switch (p.kind) {
      case "all":
        return true
      case "exact":
        if (p.value === name) return true
        break
      case "regex":
        if (p.value.test(name)) return true
        break
    }
  }
  return false
}

// ============================================================================
// Tool Policy Matcher
// ============================================================================

export interface ToolPolicy {
  allow?: string[]
  deny?: string[]
}

/**
 * Create a matcher function from a tool policy.
 * Uses deny-first evaluation (OpenClaw pattern):
 * 1. If name matches deny → rejected
 * 2. If allow is empty → accepted (no restrictions)
 * 3. If name matches allow → accepted
 * 4. Otherwise → rejected
 */
export function makeToolPolicyMatcher(policy: ToolPolicy): (name: string) => boolean {
  const deny = compilePatterns(policy.deny ?? [])
  const allow = compilePatterns(policy.allow ?? [])

  return (name: string): boolean => {
    if (deny.length > 0 && matchesAny(name, deny)) return false
    if (allow.length === 0) return true
    return matchesAny(name, allow)
  }
}

/**
 * Expand group references in a string array to individual tool names.
 * e.g. ["group:core", "web_search"] → ["memory_search", "memory_get", "set_character_pose", "task_suggest", "web_search"]
 */
export function expandToolGroups(patterns: string[]): string[] {
  const result: string[] = []
  for (const p of patterns) {
    if (isToolGroupKey(p)) {
      result.push(...TOOL_GROUPS[p])
      continue
    }
    result.push(p)
  }
  return [...new Set(result)]
}

/**
 * Resolve a tool profile to an expanded allow list.
 */
export function resolveProfileAllowList(profile: string | null): string[] {
  if (!profile || !isToolProfileName(profile)) return []
  const profilePatterns = TOOL_PROFILES[profile]
  if (profilePatterns.length === 0) return [] // "full" = no restrictions
  return expandToolGroups(profilePatterns)
}

// ============================================================================
// Hierarchical Policy Resolution (OpenClaw-inspired)
// ============================================================================

export interface ResolvedToolPolicyInput {
  profile: string | null
  allow: string[]
  alsoAllow: string[]
  deny: string[]
}

/**
 * Resolve the effective tool policy from profile + explicit settings.
 * Order of precedence:
 * 1. Explicit allow list (if set, profile is ignored)
 * 2. Profile's tool set + alsoAllow
 * 3. No restrictions (if nothing set)
 */
export function resolveEffectivePolicy(input: ResolvedToolPolicyInput): (name: string) => boolean {
  const { profile, allow, alsoAllow, deny } = input

  // Build effective allow list
  let effectiveAllow: string[]

  if (allow.length > 0) {
    // Explicit allow overrides profile
    effectiveAllow = [...expandToolGroups(allow), ...expandToolGroups(alsoAllow)]
  } else if (profile && isToolProfileName(profile)) {
    const profileTools = TOOL_PROFILES[profile]
    if (profileTools.length === 0) {
      // "full" profile = no restrictions, still honor deny list
      effectiveAllow = []
    } else {
      effectiveAllow = [...expandToolGroups(profileTools), ...expandToolGroups(alsoAllow)]
    }
  } else {
    effectiveAllow = expandToolGroups(alsoAllow)
  }

  return makeToolPolicyMatcher({
    allow: effectiveAllow,
    deny: expandToolGroups(deny),
  })
}

/**
 * Filter a list of tool names by policy.
 */
export function filterToolsByPolicy(
  toolNames: string[],
  policy: ToolPolicy
): string[] {
  const matcher = makeToolPolicyMatcher(policy)
  return toolNames.filter(matcher)
}
