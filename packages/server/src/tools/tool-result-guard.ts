// ============================================================================
// Tool Result Guard
// ============================================================================
// Tracks pending tool calls and ensures every function call gets a response.
// Gemini rejects transcripts where function calls are not followed by matching
// function responses. This guard synthesizes missing results for interrupted or
// abandoned tool calls.
//
// Adapted from OpenClaw's session-tool-result-guard.ts.
// ============================================================================

import type { GeminiContent } from "@bibboy/agent-runtime"
import { makeMissingToolResult } from "./tool-definition-adapter"

// ============================================================================
// Pending Tool Call Tracker
// ============================================================================

/** Tracks tool calls awaiting results within an agent loop iteration. */
export interface ToolResultGuard {
  /** Record that tool calls were sent to the model. */
  trackToolCalls: (calls: Array<{ id: string; name: string }>) => void
  /** Record that a tool result was received. */
  markResolved: (toolCallId: string) => void
  /** Flush all pending tool calls with synthetic error results. */
  flushPending: () => Array<{ name: string; response: { result: string } }>
  /** Get count of pending (unresolved) tool calls. */
  pendingCount: () => number
  /** Get IDs of pending tool calls. */
  pendingIds: () => string[]
  /** Reset all tracking state. */
  reset: () => void
}

/**
 * Create a tool result guard for tracking pending tool calls.
 */
export function createToolResultGuard(): ToolResultGuard {
  // Map: toolCallId → toolName
  const pending = new Map<string, string>()

  return {
    trackToolCalls(calls) {
      for (const call of calls) {
        pending.set(call.id, call.name)
      }
    },

    markResolved(toolCallId) {
      pending.delete(toolCallId)
    },

    flushPending() {
      if (pending.size === 0) return []

      const syntheticResults: Array<{ name: string; response: { result: string } }> = []

      for (const [id, name] of pending.entries()) {
        const result = makeMissingToolResult({ toolCallId: id, toolName: name })
        const resultText = result.content?.[0]?.text ?? JSON.stringify({ error: "interrupted" })

        syntheticResults.push({
          name,
          response: { result: resultText },
        })
      }

      pending.clear()
      return syntheticResults
    },

    pendingCount: () => pending.size,
    pendingIds: () => Array.from(pending.keys()),
    reset: () => pending.clear(),
  }
}

// ============================================================================
// Transcript Repair
// ============================================================================

/**
 * Repair a Gemini conversation transcript to ensure valid structure.
 * Gemini requires:
 * 1. Every function call in a model turn must be followed by a matching function response
 * 2. Conversations must start with a user turn
 * 3. No consecutive same-role turns (except user after function responses)
 *
 * This function:
 * - Drops tool call parts with missing args
 * - Ensures every function call gets a function response
 * - Fixes role alternation violations
 */
export function repairTranscript(contents: GeminiContent[]): GeminiContent[] {
  if (contents.length === 0) return contents

  const result: GeminiContent[] = []

  for (let i = 0; i < contents.length; i++) {
    const turn = contents[i]

    // Sanitize model turns: drop function calls with no args
    if (turn.role === "model") {
      const sanitizedParts = turn.parts.filter((part) => {
        if (part.functionCall) {
          // Drop if name is missing or empty
          return typeof part.functionCall.name === "string" && part.functionCall.name.length > 0
        }
        return true
      })

      // Skip entirely empty model turns
      if (sanitizedParts.length === 0) continue

      // Extract function calls that need responses
      const functionCalls = sanitizedParts.filter((p) => p.functionCall)

      result.push({ ...turn, parts: sanitizedParts })

      // Check if next turn has matching function responses
      if (functionCalls.length > 0) {
        const nextTurn = contents[i + 1]
        const nextHasFunctionResponses = nextTurn?.parts?.some((p) => p.functionResponse)

        if (!nextHasFunctionResponses) {
          // Synthesize missing function responses
          const syntheticParts = functionCalls.map((fc) => ({
            functionResponse: {
              name: fc.functionCall!.name,
              response: {
                result: JSON.stringify({
                  status: "error",
                  tool: fc.functionCall!.name,
                  error: "Tool execution was interrupted — retry if needed.",
                }),
              },
            },
          }))

          result.push({ role: "user", parts: syntheticParts })
        }
      }
    } else {
      // For user turns, just push
      result.push(turn)
    }
  }

  // Ensure starts with user turn
  if (result.length > 0 && result[0].role === "model") {
    result.unshift({ role: "user", parts: [{ text: "(conversation context)" }] })
  }

  // Merge consecutive same-role turns
  const merged: GeminiContent[] = []
  for (const turn of result) {
    const last = merged[merged.length - 1]
    if (last && last.role === turn.role) {
      last.parts.push(...turn.parts)
    } else {
      merged.push({ ...turn, parts: [...turn.parts] })
    }
  }

  return merged
}

/**
 * Validate that a transcript has no orphaned function calls.
 * Returns true if valid, false if repair is needed.
 */
export function isTranscriptValid(contents: GeminiContent[]): boolean {
  for (let i = 0; i < contents.length; i++) {
    const turn = contents[i]
    if (turn.role !== "model") continue

    const functionCalls = turn.parts.filter((p) => p.functionCall)
    if (functionCalls.length === 0) continue

    // Check next turn has matching function responses
    const nextTurn = contents[i + 1]
    if (!nextTurn) return false

    const responseNames = new Set(
      nextTurn.parts
        .filter((p) => p.functionResponse)
        .map((p) => p.functionResponse!.name)
    )

    for (const fc of functionCalls) {
      if (!responseNames.has(fc.functionCall!.name)) return false
    }
  }

  return true
}
