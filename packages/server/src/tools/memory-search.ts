import type { ToolExecutionResult, ChatMessage } from "@bibboy/shared"
import type { AgentTool } from "./types"
import {
  jsonResult,
  readStringParam,
  readNumberParam,
} from "./types"
import { createMemoryService } from "../memory"
import type { ResolvedAgentConfig } from "../agents/AgentConfig"

// ============================================================================
// Memory Search Tool (Vector + Session Search)
// Follows reference implementation pattern: never throws, returns { results: [], disabled: true, error }
// ============================================================================

const DEFAULT_MAX_RESULTS = 6
const DEFAULT_MIN_SCORE = 0.35

/**
 * Create memory_search tool with vector search and session context.
 * Error handling: returns disabled state instead of throwing (matching reference).
 */
export function createMemorySearchTool(
  agentConfig: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[]
): AgentTool {
  const memoryService = createMemoryService(agentConfig, getSessionMessages)

  return {
    label: "Memory Search",
    name: "memory_search",
    description:
      "Search current session conversation history and memory files for relevant context. Always searches the current session transcript. Use before answering questions about what was discussed earlier in this conversation, prior decisions, preferences, or any information the user shared.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query to find relevant memories and past messages.",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (1-20).",
          minimum: 1,
          maximum: 20,
        },
        minScore: {
          type: "number",
          description: "Minimum similarity score threshold (0-1).",
          minimum: 0,
          maximum: 1,
        },
      },
      required: ["query"],
    },
    execute: async (_toolCallId, args): Promise<ToolExecutionResult> => {
      // Parse query (safe extraction)
      let query: string
      try {
        query = readStringParam(args, "query", { required: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return jsonResult({ results: [], disabled: true, error: message })
      }

      const maxResults = readNumberParam(args, "maxResults", { integer: true, min: 1, max: 20 }) ?? DEFAULT_MAX_RESULTS
      const minScore = readNumberParam(args, "minScore", { min: 0, max: 1 }) ?? DEFAULT_MIN_SCORE

      try {
        const results = await memoryService.search(query, { maxResults, minScore })

        return jsonResult({
          query,
          count: results.length,
          results: results.map((r) => ({
            path: r.path,
            lineStart: r.lineStart,
            lineEnd: r.lineEnd,
            snippet: r.snippet,
            score: Math.round(r.score * 100) / 100,
          })),
          provider: agentConfig.memorySearch.provider,
          model: agentConfig.memorySearch.model,
        })
      } catch (err) {
        // Never throw - return disabled state with error message
        const message = err instanceof Error ? err.message : String(err)
        return jsonResult({ results: [], disabled: true, error: message })
      }
    },
  }
}

/**
 * Create memory_get tool for retrieving specific content.
 * Error handling: returns disabled state instead of throwing (matching reference).
 */
export function createMemoryGetTool(
  agentConfig: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[]
): AgentTool {
  const memoryService = createMemoryService(agentConfig, getSessionMessages)

  return {
    label: "Memory Get",
    name: "memory_get",
    description:
      "Retrieve specific content from session transcript or memory files. Use path='session' with from/lines to read session messages by index (from memory_search results). Use other paths for memory/*.md files.",
    parameters: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the memory file (from memory_search results).",
        },
        from: {
          type: "number",
          description: "Starting line number (1-indexed).",
          minimum: 1,
        },
        lines: {
          type: "number",
          description: "Number of lines to retrieve.",
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["path"],
    },
    execute: async (_toolCallId, args): Promise<ToolExecutionResult> => {
      // Parse path (safe extraction)
      let path: string
      try {
        path = readStringParam(args, "path", { required: true })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return jsonResult({ path: "", text: "", disabled: true, error: message })
      }

      const from = readNumberParam(args, "from", { integer: true, min: 1 })
      const lines = readNumberParam(args, "lines", { integer: true, min: 1, max: 100 })

      try {
        const content = memoryService.get(path, { from, lines })

        if (content === null) {
          return jsonResult({
            path,
            text: "",
            error: "File not found in memory.",
          })
        }

        return jsonResult({
          path,
          from: from ?? 1,
          lines: lines ?? content.split("\n").length,
          text: content,
        })
      } catch (err) {
        // Never throw - return disabled state with error message
        const message = err instanceof Error ? err.message : String(err)
        return jsonResult({ path, text: "", disabled: true, error: message })
      }
    },
  }
}
