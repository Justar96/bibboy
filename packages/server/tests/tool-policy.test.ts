import { describe, expect, it } from "vitest"
import {
  compilePattern,
  compilePatterns,
  matchesAny,
  makeToolPolicyMatcher,
  expandToolGroups,
  filterToolsByPolicy,
  resolveEffectivePolicy,
  resolveProfileAllowList,
  TOOL_GROUPS,
  TOOL_PROFILES,
} from "../src/tools/tool-policy"
import { createToolExecutionMetrics } from "../src/tools/types"

// ============================================================================
// compilePattern
// ============================================================================

describe("compilePattern", () => {
  it("compiles '*' to all matcher", () => {
    const patterns = compilePattern("*")
    expect(patterns).toEqual([{ kind: "all" }])
  })

  it("compiles exact name", () => {
    const patterns = compilePattern("web_search")
    expect(patterns).toEqual([{ kind: "exact", value: "web_search" }])
  })

  it("compiles wildcard pattern to regex", () => {
    const patterns = compilePattern("web_*")
    expect(patterns).toHaveLength(1)
    expect(patterns[0].kind).toBe("regex")
  })

  it("expands group:core to exact patterns", () => {
    const patterns = compilePattern("group:core")
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns.every((p) => p.kind === "exact")).toBe(true)
    expect(patterns.map((p) => (p as { value: string }).value)).toContain("memory_search")
  })

  it("expands group:all to all matcher", () => {
    const patterns = compilePattern("group:all")
    expect(patterns).toEqual([{ kind: "all" }])
  })

  it("returns empty for unknown group", () => {
    const patterns = compilePattern("group:nonexistent")
    expect(patterns).toEqual([])
  })
})

// ============================================================================
// matchesAny
// ============================================================================

describe("matchesAny", () => {
  it("matches exact pattern", () => {
    const patterns = compilePatterns(["web_search"])
    expect(matchesAny("web_search", patterns)).toBe(true)
    expect(matchesAny("web_fetch", patterns)).toBe(false)
  })

  it("matches wildcard pattern", () => {
    const patterns = compilePatterns(["web_*"])
    expect(matchesAny("web_search", patterns)).toBe(true)
    expect(matchesAny("web_fetch", patterns)).toBe(true)
    expect(matchesAny("memory_search", patterns)).toBe(false)
  })

  it("matches all pattern", () => {
    const patterns = compilePatterns(["*"])
    expect(matchesAny("anything", patterns)).toBe(true)
  })

  it("matches group expansion", () => {
    const patterns = compilePatterns(["group:web"])
    expect(matchesAny("web_search", patterns)).toBe(true)
    expect(matchesAny("web_fetch", patterns)).toBe(true)
    expect(matchesAny("memory_search", patterns)).toBe(false)
  })
})

// ============================================================================
// makeToolPolicyMatcher (deny-first evaluation)
// ============================================================================

describe("makeToolPolicyMatcher", () => {
  it("allows all when no allow/deny specified", () => {
    const matcher = makeToolPolicyMatcher({})
    expect(matcher("web_search")).toBe(true)
    expect(matcher("anything")).toBe(true)
  })

  it("denies tools in deny list first", () => {
    const matcher = makeToolPolicyMatcher({
      allow: ["*"],
      deny: ["web_search"],
    })
    expect(matcher("web_search")).toBe(false)
    expect(matcher("web_fetch")).toBe(true)
  })

  it("allows only tools in allow list", () => {
    const matcher = makeToolPolicyMatcher({
      allow: ["web_search", "web_fetch"],
    })
    expect(matcher("web_search")).toBe(true)
    expect(matcher("memory_search")).toBe(false)
  })

  it("supports wildcard deny", () => {
    const matcher = makeToolPolicyMatcher({
      deny: ["canvas_*"],
    })
    expect(matcher("canvas_set_pose")).toBe(false)
    expect(matcher("web_search")).toBe(true)
  })

  it("supports group:* in allow", () => {
    const matcher = makeToolPolicyMatcher({
      allow: ["group:web"],
    })
    expect(matcher("web_search")).toBe(true)
    expect(matcher("web_fetch")).toBe(true)
    expect(matcher("memory_search")).toBe(false)
  })

  it("deny takes precedence over allow", () => {
    const matcher = makeToolPolicyMatcher({
      allow: ["group:web"],
      deny: ["web_fetch"],
    })
    expect(matcher("web_search")).toBe(true)
    expect(matcher("web_fetch")).toBe(false)
  })
})

// ============================================================================
// expandToolGroups
// ============================================================================

describe("expandToolGroups", () => {
  it("expands group:core", () => {
    const result = expandToolGroups(["group:core"])
    expect(result).toContain("memory_search")
    expect(result).toContain("memory_get")
  })

  it("mixes groups and plain names", () => {
    const result = expandToolGroups(["group:web", "request_tools"])
    expect(result).toContain("web_search")
    expect(result).toContain("web_fetch")
    expect(result).toContain("request_tools")
  })

  it("deduplicates", () => {
    const result = expandToolGroups(["web_search", "group:web"])
    const count = result.filter((n) => n === "web_search").length
    expect(count).toBe(1)
  })
})

// ============================================================================
// resolveProfileAllowList
// ============================================================================

describe("resolveProfileAllowList", () => {
  it("resolves minimal profile", () => {
    const result = resolveProfileAllowList("minimal")
    expect(result).toContain("memory_search")
    expect(result).toContain("set_character_pose")
  })

  it("resolves full profile to empty (no restrictions)", () => {
    expect(resolveProfileAllowList("full")).toEqual([])
  })

  it("returns empty for unknown profile", () => {
    expect(resolveProfileAllowList("unknown")).toEqual([])
  })

  it("returns empty for null", () => {
    expect(resolveProfileAllowList(null)).toEqual([])
  })
})

// ============================================================================
// resolveEffectivePolicy
// ============================================================================

describe("resolveEffectivePolicy", () => {
  it("allows all with full profile", () => {
    const matcher = resolveEffectivePolicy({
      profile: "full",
      allow: [],
      alsoAllow: [],
      deny: [],
    })
    expect(matcher("anything")).toBe(true)
  })

  it("restricts to profile tools with minimal profile", () => {
    const matcher = resolveEffectivePolicy({
      profile: "minimal",
      allow: [],
      alsoAllow: [],
      deny: [],
    })
    expect(matcher("memory_search")).toBe(true)
    expect(matcher("web_search")).toBe(false)
  })

  it("explicit allow overrides profile", () => {
    const matcher = resolveEffectivePolicy({
      profile: "minimal",
      allow: ["web_search"],
      alsoAllow: [],
      deny: [],
    })
    expect(matcher("web_search")).toBe(true)
    expect(matcher("memory_search")).toBe(false)
  })

  it("alsoAllow extends profile", () => {
    const matcher = resolveEffectivePolicy({
      profile: "minimal",
      allow: [],
      alsoAllow: ["web_search"],
      deny: [],
    })
    expect(matcher("memory_search")).toBe(true)
    expect(matcher("web_search")).toBe(true)
    expect(matcher("canvas_set_pose")).toBe(false)
  })

  it("deny works with full profile", () => {
    const matcher = resolveEffectivePolicy({
      profile: "full",
      allow: [],
      alsoAllow: [],
      deny: ["canvas_*"],
    })
    expect(matcher("web_search")).toBe(true)
    expect(matcher("canvas_set_pose")).toBe(false)
  })

  it("deny overrides explicit allow (deny-first)", () => {
    const matcher = resolveEffectivePolicy({
      profile: "minimal",
      allow: ["web_fetch"],
      alsoAllow: [],
      deny: ["web_*"],
    })
    expect(matcher("memory_search")).toBe(false)
    expect(matcher("web_fetch")).toBe(false)
  })
})

// ============================================================================
// filterToolsByPolicy
// ============================================================================

describe("filterToolsByPolicy", () => {
  it("filters tools by allow list", () => {
    const tools = ["web_search", "web_fetch", "memory_search", "canvas_set_pose"]
    const result = filterToolsByPolicy(tools, { allow: ["group:web"] })
    expect(result).toEqual(["web_search", "web_fetch"])
  })

  it("filters tools by deny list", () => {
    const tools = ["web_search", "web_fetch", "memory_search"]
    const result = filterToolsByPolicy(tools, { deny: ["web_*"] })
    expect(result).toEqual(["memory_search"])
  })

  it("combines allow and deny", () => {
    const tools = ["web_search", "web_fetch", "memory_search"]
    const result = filterToolsByPolicy(tools, { allow: ["web_*"], deny: ["web_fetch"] })
    expect(result).toEqual(["web_search"])
  })
})

// ============================================================================
// TOOL_GROUPS consistency
// ============================================================================

describe("TOOL_GROUPS", () => {
  it("group:all contains all tools from other groups", () => {
    const allTools = TOOL_GROUPS["group:all"]
    for (const [key, tools] of Object.entries(TOOL_GROUPS)) {
      if (key === "group:all") continue
      for (const tool of tools) {
        expect(allTools).toContain(tool)
      }
    }
  })
})

describe("TOOL_PROFILES", () => {
  it("full profile is empty array (no restrictions)", () => {
    expect(TOOL_PROFILES.full).toEqual([])
  })

  it("messaging profile includes canvas and soul groups", () => {
    const expanded = expandToolGroups(TOOL_PROFILES.messaging)
    expect(expanded).toContain("canvas_set_pose")
    expect(expanded).toContain("soul_observe_trait")
  })
})

// ============================================================================
// ToolExecutionMetrics
// ============================================================================

describe("ToolExecutionMetrics", () => {
  it("tracks tool executions", () => {
    const metrics = createToolExecutionMetrics()
    metrics.record("web_search", 150, false)
    metrics.record("web_search", 200, false)
    metrics.record("web_fetch", 500, true)

    expect(metrics.tools.get("web_search")?.count).toBe(2)
    expect(metrics.tools.get("web_search")?.errors).toBe(0)
    expect(metrics.tools.get("web_fetch")?.count).toBe(1)
    expect(metrics.tools.get("web_fetch")?.errors).toBe(1)
  })

  it("generates summary", () => {
    const metrics = createToolExecutionMetrics()
    metrics.record("web_search", 150, false)
    const summary = metrics.getSummary()
    expect(summary).toContain("web_search")
    expect(summary).toContain("1 calls")
  })

  it("returns empty string when no tools tracked", () => {
    const metrics = createToolExecutionMetrics()
    expect(metrics.getSummary()).toBe("")
  })
})
