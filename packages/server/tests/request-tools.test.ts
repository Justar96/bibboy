import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolExecutionResult } from "@bibboy/shared"

vi.mock("../src/tools/memory-search", () => ({
  createMemorySearchTool: () => ({
    label: "Memory Search",
    name: "memory_search",
    description: "Mock memory search tool",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (): Promise<ToolExecutionResult> => ({
      toolCallId: "mock_memory_search",
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    }),
  }),
  createMemoryGetTool: () => ({
    label: "Memory Get",
    name: "memory_get",
    description: "Mock memory get tool",
    parameters: { type: "object", properties: {}, required: [] },
    execute: async (): Promise<ToolExecutionResult> => ({
      toolCallId: "mock_memory_get",
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
    }),
  }),
}))

import { createToolRegistry } from "../src/tools"
import { agentConfig, initializeAgentConfig } from "../src/agents/AgentConfig"

type RequestToolsResult = {
  loaded: string[]
  alreadyLoaded: string[]
  invalidGroups: string[]
  hint: string
}

function parseRequestToolsPayload(result: ToolExecutionResult): RequestToolsResult {
  const text = result.content[0]?.text ?? "{}"
  return JSON.parse(text) as RequestToolsResult
}

describe("request_tools", () => {
  beforeEach(() => {
    initializeAgentConfig()
  })

  it("separates invalid groups from already-loaded groups", async () => {
    const resolved = agentConfig.getAgent(agentConfig.getDefaultAgentId())
    expect(resolved).toBeDefined()
    if (!resolved) return

    const registry = createToolRegistry(resolved, () => [])
    const requestTools = registry.get("request_tools")
    expect(requestTools).toBeDefined()
    if (!requestTools) return

    const first = await requestTools.execute("tc_1", {
      groups: "workspace,not_a_group",
    })
    const firstPayload = parseRequestToolsPayload(first)
    expect(firstPayload.loaded).toEqual(["workspace"])
    expect(firstPayload.alreadyLoaded).toEqual([])
    expect(firstPayload.invalidGroups).toEqual(["not_a_group"])

    const second = await requestTools.execute("tc_2", {
      groups: "workspace,still_invalid",
    })
    const secondPayload = parseRequestToolsPayload(second)
    expect(secondPayload.loaded).toEqual([])
    expect(secondPayload.alreadyLoaded).toEqual(["workspace"])
    expect(secondPayload.invalidGroups).toEqual(["still_invalid"])
  })
})
