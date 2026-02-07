import { Effect, Stream, pipe } from "effect"
import type {
  AgentStreamEvent,
  ToolExecutionResult,
} from "@bibboy/shared"
import type { GeminiContent } from "@bibboy/agent-runtime"
import { describe, expect, it, vi } from "vitest"
import {
  orchestrateAgentStreamIterations,
} from "../src/services/agent-service-stream-orchestrator"
import type {
  AgentTool,
  FunctionToolDefinition,
  ToolGroupInfo,
  ToolGroupName,
  ToolRegistry,
} from "../src/tools/types"

function createToolRegistryMock(
  definitions: FunctionToolDefinition[] = []
): ToolRegistry {
  const tools: AgentTool[] = []
  const loadedGroups = new Set<ToolGroupName>()

  return {
    tools,
    get: () => undefined,
    getDefinitions: () => definitions,
    addTools: () => {},
    getGroups: (): ToolGroupInfo[] => [],
    markGroupLoaded: (group: ToolGroupName) => {
      loadedGroups.add(group)
    },
    isGroupLoaded: (group: ToolGroupName) => loadedGroups.has(group),
    getToolSummary: () => "No tools available.",
  }
}

async function collectEvents(
  stream: Stream.Stream<AgentStreamEvent, unknown>
): Promise<AgentStreamEvent[]> {
  return Effect.runPromise(
    pipe(
      stream,
      Stream.runCollect,
      Effect.map((chunk) => [...chunk])
    )
  )
}

const initialContents: GeminiContent[] = [
  {
    role: "user",
    parts: [{ text: "Hi" }],
  },
]

describe("orchestrateAgentStreamIterations", () => {
  it("streams text deltas and emits final done without tools", async () => {
    const streamGeminiFn = vi.fn(() =>
      Stream.fromIterable<AgentStreamEvent>([
        { type: "text_delta", delta: "Hello" },
      ])
    )

    const events = await collectEvents(
      orchestrateAgentStreamIterations({
        apiKey: "test-key",
        model: "gemini-3-flash-preview",
        enableTools: false,
        toolRegistry: createToolRegistryMock(),
        initialContents,
        systemInstruction: "You are helpful",
        agentId: "agent-1",
        maxToolIterations: 3,
        softLimitIterations: 1,
        toolTimeoutMs: 30_000,
        deps: {
          streamGeminiFn,
          generateMessageIdFn: () => "msg_test_1",
        },
      })
    )

    expect(streamGeminiFn).toHaveBeenCalledTimes(1)
    expect(events).toHaveLength(2)
    expect(events[0]).toEqual({ type: "text_delta", delta: "Hello" })

    const doneEvent = events[1]
    expect(doneEvent.type).toBe("done")
    if (doneEvent.type === "done") {
      expect(doneEvent.message.id).toBe("msg_test_1")
      expect(doneEvent.message.content).toBe("Hello")
      expect(doneEvent.toolCalls).toBeUndefined()
    }
  })

  it("handles tool loop, emits tool_end, and continues recursion", async () => {
    const definitions: FunctionToolDefinition[] = [
      {
        type: "function",
        name: "memory_search",
        description: "Search memory",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query",
            },
          },
          required: ["query"],
        },
      },
    ]

    let callIndex = 0
    const streamGeminiFn = vi.fn(() => {
      callIndex += 1
      if (callIndex === 1) {
        return Stream.fromIterable<AgentStreamEvent>([
          {
            type: "tool_start",
            toolCallId: "call_1",
            toolName: "memory_search",
            arguments: { query: "project" },
          },
        ])
      }

      return Stream.fromIterable<AgentStreamEvent>([
        {
          type: "text_delta",
          delta: "Final answer",
        },
      ])
    })

    const toolResult: ToolExecutionResult = {
      toolCallId: "call_1",
      content: [{ type: "text", text: '{"hits":1}' }],
    }

    const executeToolsFn = vi.fn(
      (
        _toolRegistry: ToolRegistry,
        _toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>,
        _ctx?: unknown
      ) => Effect.succeed([toolResult])
    )

    const compactFunctionResponsesFn = vi.fn(
      async (
        _calls: ReadonlyArray<{ name: string }>,
        _results: ReadonlyArray<Pick<ToolExecutionResult, "content">>,
        _agentId: string,
        _iteration: number
      ) => [
        {
          functionResponse: {
            name: "memory_search",
            response: { result: '{"hits":1}' },
          },
        },
      ]
    )

    const events = await collectEvents(
      orchestrateAgentStreamIterations({
        apiKey: "test-key",
        model: "gemini-3-flash-preview",
        enableTools: true,
        toolRegistry: createToolRegistryMock(definitions),
        initialContents,
        systemInstruction: "You are helpful",
        agentId: "agent-1",
        maxToolIterations: 3,
        softLimitIterations: 1,
        toolTimeoutMs: 30_000,
        deps: {
          streamGeminiFn,
          executeToolsFn,
          compactFunctionResponsesFn,
          generateMessageIdFn: () => "msg_test_2",
        },
      })
    )

    expect(streamGeminiFn).toHaveBeenCalledTimes(2)
    expect(executeToolsFn).toHaveBeenCalledTimes(1)
    expect(compactFunctionResponsesFn).toHaveBeenCalledTimes(1)
    expect(events.map((event) => event.type)).toEqual([
      "tool_start",
      "tool_end",
      "text_delta",
      "done",
    ])

    const doneEvent = events[3]
    expect(doneEvent.type).toBe("done")
    if (doneEvent.type === "done") {
      expect(doneEvent.message.id).toBe("msg_test_2")
      expect(doneEvent.message.content).toBe("Final answer")
      expect(doneEvent.toolCalls).toEqual([
        {
          id: "call_1",
          name: "memory_search",
          arguments: { query: "project" },
        },
      ])
    }
  })
})
