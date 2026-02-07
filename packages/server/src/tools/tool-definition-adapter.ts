// ============================================================================
// Tool Definition Adapter
// ============================================================================
// Wraps AgentTool objects with safety guarantees before passing to the model.
// Adapted from OpenClaw's pi-tool-definition-adapter.ts.
//
// Key guarantee: tool execution errors are NEVER thrown — they're returned as
// structured JSON results so the model can see the error and decide to retry.
// Only AbortErrors are re-thrown (those indicate intentional cancellation).
// ============================================================================

import type { ToolExecutionResult } from "@bibboy/shared";
import type { AgentTool, FunctionToolDefinition } from "./types";
import { jsonResult } from "./types";

/**
 * Describe an error in a structured way for logging and model consumption.
 */
function describeToolExecutionError(err: unknown): {
  message: string;
  stack?: string;
} {
  if (err instanceof Error) {
    const message = err.message?.trim() ? err.message : String(err);
    return { message, stack: err.stack };
  }
  return { message: String(err) };
}

/**
 * Check if an error is an AbortError (intentional cancellation).
 */
function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  return name === "AbortError";
}

/**
 * Wrap a tool's execute function with error safety.
 * Catches all errors except AbortError and returns them as structured JSON
 * results, so the model sees them and can decide to retry.
 */
export function wrapToolWithErrorSafety(tool: AgentTool): AgentTool {
  return {
    ...tool,
    execute: async (
      toolCallId: string,
      args: Record<string, unknown>,
    ): Promise<ToolExecutionResult> => {
      try {
        return await tool.execute(toolCallId, args);
      } catch (err) {
        // Re-throw abort errors (intentional cancellation)
        if (isAbortError(err)) throw err;

        const described = describeToolExecutionError(err);

        if (described.stack && described.stack !== described.message) {
          console.debug(`[tools:${tool.name}] failed stack:\n${described.stack}`);
        }
        console.error(`[tools:${tool.name}] failed: ${described.message}`);

        // Return structured error for the model to see
        const result = jsonResult({
          status: "error",
          tool: tool.name,
          error: described.message,
        });
        return { ...result, toolCallId, error: described.message };
      }
    },
  };
}

/**
 * Convert AgentTool[] to safe FunctionToolDefinition[] for the model.
 * Each tool is wrapped with error safety so failures never crash the agent loop.
 */
export function toSafeToolDefinitions(tools: AgentTool[]): {
  definitions: FunctionToolDefinition[];
  safeTools: AgentTool[];
} {
  const safeTools = tools.map(wrapToolWithErrorSafety);
  const definitions = safeTools.map((tool) => ({
    type: "function" as const,
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
  return { definitions, safeTools };
}

/**
 * Sanitize tool result text for context efficiency.
 * Truncates overly long results and strips base64 image data.
 */
export function sanitizeToolResultText(text: string, maxChars: number = 8_000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n...(truncated)";
}

/**
 * Sanitize a tool result error message.
 * Keeps only the first line, truncated to 400 chars.
 */
export function sanitizeToolErrorMessage(error: string): string {
  const firstLine = error.split("\n")[0] ?? error;
  if (firstLine.length <= 400) return firstLine;
  return firstLine.slice(0, 400) + "...";
}

/**
 * Create a synthetic "missing" tool result for interrupted/orphaned tool calls.
 * This satisfies Gemini's requirement that every function call gets a response.
 */
export function makeMissingToolResult(opts: {
  toolCallId: string;
  toolName?: string;
}): ToolExecutionResult {
  const result = jsonResult({
    status: "error",
    tool: opts.toolName ?? "unknown",
    error: "Tool execution was interrupted before a result could be collected — retry if needed.",
  });
  return { ...result, toolCallId: opts.toolCallId, error: "Tool execution interrupted" };
}
