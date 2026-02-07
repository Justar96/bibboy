import { Effect } from "effect";
import type { ToolExecutionResult } from "@bibboy/shared";
import { ToolError } from "@bibboy/shared";
import type { GeminiFunctionDeclaration } from "@bibboy/agent-runtime";
import { normalizeToolParameters } from "@bibboy/agent-runtime";
import {
  applyToolWrappers,
  type FunctionToolDefinition,
  type ToolExecutionContext,
  type ToolRegistry,
} from "../tools/types";
import {
  wrapToolWithErrorSafety,
  sanitizeToolResultText,
  sanitizeToolErrorMessage,
} from "../tools/tool-definition-adapter";
import { formatToolCallSummary } from "../tools/tool-display";
import { compactToolResult } from "../tools/tool-result-store";

const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

type ToolCallRequest = {
  id: string;
  name: string;
  args: Record<string, unknown>;
};

type ToolResultLike = Pick<ToolExecutionResult, "content">;

function toGeminiParameters(
  parameters: FunctionToolDefinition["parameters"],
): Record<string, unknown> {
  // Use the robust schema normalizer that handles $ref, anyOf, null, etc.
  const normalized = normalizeToolParameters({ parameters });
  const schema = normalized.parameters;
  const normalizedProperties = Object.fromEntries(
    Object.entries(schema.properties).map(([name, value]) => [name, { ...value }]),
  );

  return {
    type: schema.type,
    properties: normalizedProperties,
    ...(schema.required ? { required: [...schema.required] } : {}),
  };
}

/**
 * Convert function tool definitions to Gemini function declarations.
 * Applies schema normalization for cross-provider compatibility.
 */
export function toGeminiFunctionDeclarations(
  tools: FunctionToolDefinition[],
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiParameters(tool.parameters),
  }));
}

const executeTool = (
  toolRegistry: ToolRegistry,
  toolCall: ToolCallRequest,
  ctx: ToolExecutionContext = {},
): Effect.Effect<ToolExecutionResult, never> =>
  Effect.gen(function* () {
    const tool = toolRegistry.get(toolCall.name);

    if (!tool) {
      console.warn(`[tools] Unknown tool called: ${toolCall.name}`);
      return {
        toolCallId: toolCall.id,
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              status: "error",
              tool: toolCall.name,
              error: `Unknown tool: ${toolCall.name}. Available tools: ${toolRegistry.tools.map((t) => t.name).join(", ")}`,
            }),
          },
        ],
        error: `Unknown tool: ${toolCall.name}`,
      };
    }

    // Log tool call with display summary
    const summary = formatToolCallSummary(toolCall.name, toolCall.args);
    console.log(`[tools] ${summary}`);

    // Apply wrappers: error safety → timeout → logging → metrics
    // Error safety is outermost — catches everything except AbortError
    let wrappedTool = applyToolWrappers(tool, {
      ...ctx,
      timeoutMs: ctx.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
    });
    wrappedTool = wrapToolWithErrorSafety(wrappedTool);

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
              text: JSON.stringify({
                status: "error",
                tool: toolCall.name,
                error: sanitizeToolErrorMessage(toolError.reason),
              }),
            },
          ],
          error: toolError.reason,
        }),
      ),
    );

    // Sanitize result text length
    if (result.content?.[0]?.text) {
      const sanitizedText = sanitizeToolResultText(result.content[0].text);
      return {
        ...result,
        toolCallId: toolCall.id,
        content: [{ type: "text" as const, text: sanitizedText }, ...result.content.slice(1)],
      };
    }

    return { ...result, toolCallId: toolCall.id };
  });

export const executeTools = (
  toolRegistry: ToolRegistry,
  toolCalls: ToolCallRequest[],
  ctx: ToolExecutionContext = {},
): Effect.Effect<ToolExecutionResult[], never> =>
  Effect.forEach(toolCalls, (toolCall) => executeTool(toolRegistry, toolCall, ctx), {
    concurrency: "unbounded",
  });

export async function compactFunctionResponses(
  calls: ReadonlyArray<{ name: string }>,
  results: ReadonlyArray<ToolResultLike>,
  agentId: string,
  iteration: number,
): Promise<Array<{ functionResponse: { name: string; response: { result: string } } }>> {
  const parts: Array<{ functionResponse: { name: string; response: { result: string } } }> = [];

  for (let index = 0; index < calls.length; index++) {
    const rawText = results[index]?.content[0]?.text ?? "";
    const compacted = await compactToolResult(calls[index].name, rawText, agentId, iteration);

    parts.push({
      functionResponse: {
        name: calls[index].name,
        response: { result: compacted },
      },
    });
  }

  return parts;
}
