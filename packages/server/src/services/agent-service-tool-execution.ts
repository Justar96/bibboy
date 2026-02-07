import { Effect } from "effect"
import type { ToolExecutionResult } from "@bibboy/shared"
import { ToolError } from "@bibboy/shared"
import type { GeminiFunctionDeclaration } from "@bibboy/agent-runtime"
import {
  applyToolWrappers,
  type FunctionToolDefinition,
  type ToolExecutionContext,
  type ToolRegistry,
} from "../tools/types"
import { compactToolResult } from "../tools/tool-result-store"

const DEFAULT_TOOL_TIMEOUT_MS = 30_000

type ToolCallRequest = {
  id: string
  name: string
  args: Record<string, unknown>
}

type ToolResultLike = Pick<ToolExecutionResult, "content">

function toGeminiParameters(
  parameters: FunctionToolDefinition["parameters"]
): Record<string, unknown> {
  const normalizedProperties = Object.fromEntries(
    Object.entries(parameters.properties).map(([name, schema]) => [name, { ...schema }])
  )

  return {
    type: parameters.type,
    properties: normalizedProperties,
    ...(parameters.required ? { required: [...parameters.required] } : {}),
  }
}

/**
 * Convert function tool definitions to Gemini function declarations.
 */
export function toGeminiFunctionDeclarations(
  tools: FunctionToolDefinition[]
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiParameters(tool.parameters),
  }))
}

const executeTool = (
  toolRegistry: ToolRegistry,
  toolCall: ToolCallRequest,
  ctx: ToolExecutionContext = {}
): Effect.Effect<ToolExecutionResult, never> =>
  Effect.gen(function* () {
    const tool = toolRegistry.get(toolCall.name)

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: `Unknown tool: ${toolCall.name}` }),
          },
        ],
        error: `Unknown tool: ${toolCall.name}`,
      }
    }

    // Apply tool wrappers (timeout + abort signal cascade)
    const wrappedTool = applyToolWrappers(tool, {
      ...ctx,
      timeoutMs: ctx.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    })

    const result = yield* Effect.tryPromise({
      try: async () => wrappedTool.execute(toolCall.id, toolCall.args),
      catch: (error) =>
        new ToolError({
          toolName: toolCall.name,
          reason: error instanceof Error ? error.message : "Unknown error",
        }),
    }).pipe(
      Effect.catchAll((toolError) =>
        Effect.succeed({
          toolCallId: toolCall.id,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ error: toolError.reason }),
            },
          ],
          error: toolError.reason,
        })
      )
    )

    return { ...result, toolCallId: toolCall.id }
  })

export const executeTools = (
  toolRegistry: ToolRegistry,
  toolCalls: ToolCallRequest[],
  ctx: ToolExecutionContext = {}
): Effect.Effect<ToolExecutionResult[], never> =>
  Effect.forEach(toolCalls, (toolCall) => executeTool(toolRegistry, toolCall, ctx), {
    concurrency: "unbounded",
  })

export async function compactFunctionResponses(
  calls: ReadonlyArray<{ name: string }>,
  results: ReadonlyArray<ToolResultLike>,
  agentId: string,
  iteration: number
): Promise<Array<{ functionResponse: { name: string; response: { result: string } } }>> {
  const parts: Array<{ functionResponse: { name: string; response: { result: string } } }> = []

  for (let index = 0; index < calls.length; index++) {
    const rawText = results[index]?.content[0]?.text ?? ""
    const compacted = await compactToolResult(
      calls[index].name,
      rawText,
      agentId,
      iteration
    )

    parts.push({
      functionResponse: {
        name: calls[index].name,
        response: { result: compacted },
      },
    })
  }

  return parts
}
