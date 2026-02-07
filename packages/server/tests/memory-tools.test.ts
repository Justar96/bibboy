import { describe, expect, it, vi } from "vitest"
import { createMemorySearchTool, createMemoryGetTool } from "../src/tools/memory-search"
import type { ResolvedAgentConfig } from "../src/agents/AgentConfig"
import type { ChatMessage } from "@bibboy/shared"

// Mock the memory service to throw errors
vi.mock("../src/memory", () => ({
  createMemoryService: () => ({
    search: async () => {
      throw new Error("Gemini embedding error: 429 insufficient_quota")
    },
    get: () => {
      throw new Error("file not found")
    },
  }),
}))

const createMockAgentConfig = (): ResolvedAgentConfig => ({
  id: "test-agent",
  name: "Test Agent",
  model: { primary: "gemini-3-flash-preview", fallbacks: [] },
  memorySearch: {
    enabled: true,
    sources: ["memory"],
    extraPaths: [],
    provider: "gemini",
    remote: undefined,
    experimental: { sessionMemory: false },
    fallback: "none",
    model: "gemini-embedding-001",
    local: {},
    store: {
      driver: "sqlite",
      path: "/tmp/test.sqlite",
      vector: { enabled: true },
    },
    chunking: { tokens: 400, overlap: 80 },
    sync: {
      onSessionStart: true,
      onSearch: true,
      watch: true,
      watchDebounceMs: 1500,
      intervalMinutes: 0,
      sessions: { deltaBytes: 100000, deltaMessages: 50 },
    },
    query: {
      maxResults: 6,
      minScore: 0.35,
      hybrid: {
        enabled: true,
        vectorWeight: 0.7,
        textWeight: 0.3,
        candidateMultiplier: 4,
      },
    },
    cache: { enabled: true },
  },
  tools: { profile: null, allow: [], alsoAllow: [], deny: [], byProvider: {} },
  thinkingLevel: "off",
  timeFormat: "auto",
})

const mockGetSessionMessages = (): ChatMessage[] => []

describe("memory tools - error handling", () => {
  it("memory_search does not throw when service fails", async () => {
    const config = createMockAgentConfig()
    const tool = createMemorySearchTool(config, mockGetSessionMessages)

    // Should not throw
    const result = await tool.execute("call_1", { query: "hello" })

    // Should return disabled state with error
    const details = result.details as { results: unknown[]; disabled: boolean; error: string }
    expect(details.results).toEqual([])
    expect(details.disabled).toBe(true)
    expect(details.error).toContain("insufficient_quota")
  })

  it("memory_get does not throw when service fails", async () => {
    const config = createMockAgentConfig()
    const tool = createMemoryGetTool(config, mockGetSessionMessages)

    // Should not throw
    const result = await tool.execute("call_2", { path: "memory/NOPE.md" })

    // Should return disabled state with error
    const details = result.details as { path: string; text: string; disabled: boolean; error: string }
    expect(details.path).toBe("memory/NOPE.md")
    expect(details.text).toBe("")
    expect(details.disabled).toBe(true)
    expect(details.error).toContain("file not found")
  })

  it("memory_search returns error when query is missing", async () => {
    const config = createMockAgentConfig()
    const tool = createMemorySearchTool(config, mockGetSessionMessages)

    const result = await tool.execute("call_3", {})

    const details = result.details as { results: unknown[]; disabled: boolean; error: string }
    expect(details.results).toEqual([])
    expect(details.disabled).toBe(true)
    expect(details.error).toContain("query")
  })

  it("memory_get returns error when path is missing", async () => {
    const config = createMockAgentConfig()
    const tool = createMemoryGetTool(config, mockGetSessionMessages)

    const result = await tool.execute("call_4", {})

    const details = result.details as { path: string; text: string; disabled: boolean; error: string }
    expect(details.path).toBe("")
    expect(details.text).toBe("")
    expect(details.disabled).toBe(true)
    expect(details.error).toContain("path")
  })
})
