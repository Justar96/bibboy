/**
 * Throttled Tool Stream Hook
 *
 * Manages tool execution state with throttled synchronization to prevent
 * UI jank during rapid tool updates. Based on patterns from reference-openclaw-project.
 */

import { useState, useCallback, useRef, useMemo } from "react"

// ============================================================================
// Constants
// ============================================================================

/** Maximum number of tool entries to keep in the stream */
const TOOL_STREAM_LIMIT = 50

/** Throttle interval for syncing tool messages to UI (ms) */
const TOOL_STREAM_THROTTLE_MS = 80

/** Maximum characters to display in tool output */
const TOOL_OUTPUT_CHAR_LIMIT = 120_000

// ============================================================================
// Types
// ============================================================================

export interface ToolStreamEntry {
  /** Unique ID for this tool call */
  toolCallId: string
  /** Run ID this tool belongs to */
  runId: string
  /** Session key (optional) */
  sessionKey?: string
  /** Tool name */
  name: string
  /** Parsed tool arguments */
  args?: unknown
  /** Formatted output string */
  output?: string
  /** Execution status */
  status: "running" | "completed" | "error"
  /** Raw arguments JSON string */
  rawArguments?: string
  /** When tool started executing */
  startedAt: number
  /** Last update timestamp */
  updatedAt: number
}

/** Renderable tool message for UI */
export interface ToolMessage {
  role: "assistant"
  toolCallId: string
  runId: string
  content: ToolMessageContent[]
  timestamp: number
}

export type ToolMessageContent =
  | { type: "toolcall"; name: string; arguments: unknown }
  | { type: "toolresult"; name: string; text: string }

// ============================================================================
// Helper Functions
// ============================================================================

function truncateText(
  text: string,
  limit: number
): { text: string; truncated: boolean; total: number } {
  if (text.length <= limit) {
    return { text, truncated: false, total: text.length }
  }
  return { text: text.slice(0, limit), truncated: true, total: text.length }
}

function formatToolOutput(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  let text: string
  if (typeof value === "string") {
    text = value
  } else {
    try {
      text = JSON.stringify(value, null, 2)
    } catch {
      text = String(value)
    }
  }
  const result = truncateText(text, TOOL_OUTPUT_CHAR_LIMIT)
  if (!result.truncated) {
    return result.text
  }
  return `${result.text}\n\n… truncated (${result.total} chars, showing first ${result.text.length}).`
}

function buildToolMessage(entry: ToolStreamEntry): ToolMessage {
  const content: ToolMessageContent[] = [
    { type: "toolcall", name: entry.name, arguments: entry.args ?? {} },
  ]
  if (entry.output) {
    content.push({ type: "toolresult", name: entry.name, text: entry.output })
  }
  return {
    role: "assistant",
    toolCallId: entry.toolCallId,
    runId: entry.runId,
    content,
    timestamp: entry.startedAt,
  }
}

// ============================================================================
// Hook Implementation
// ============================================================================

export interface UseToolStreamOptions {
  /** Current active run ID */
  runId?: string | null
  /** Current session key */
  sessionKey?: string
}

export interface UseToolStreamReturn {
  /** Current tool entries (Map for efficient lookup) */
  entries: Map<string, ToolStreamEntry>
  /** Tool messages ready for rendering */
  messages: ToolMessage[]
  /** Add or update a tool entry */
  upsertTool: (
    toolCallId: string,
    update: Partial<Omit<ToolStreamEntry, "toolCallId">>
  ) => void
  /** Mark a tool as completed with output */
  completeTool: (toolCallId: string, output: unknown, error?: boolean) => void
  /** Reset all tool stream state */
  reset: () => void
}

export function useToolStream(
  options: UseToolStreamOptions = {}
): UseToolStreamReturn {
  const { runId, sessionKey } = options

  // Internal state - Map for O(1) lookups
  const entriesRef = useRef(new Map<string, ToolStreamEntry>())
  const orderRef = useRef<string[]>([])
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Rendered state (updated via throttled sync)
  const [messages, setMessages] = useState<ToolMessage[]>([])
  // Version counter to trigger entries snapshot updates
  const [entriesVersion, setEntriesVersion] = useState(0)

  // Sync entries to messages (throttled)
  const flushSync = useCallback(() => {
    if (syncTimerRef.current !== null) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    const msgs = orderRef.current
      .map((id) => {
        const entry = entriesRef.current.get(id)
        return entry ? buildToolMessage(entry) : null
      })
      .filter((msg): msg is ToolMessage => msg !== null)
    setMessages(msgs)
  }, [])

  const scheduleSync = useCallback(
    (force = false) => {
      if (force) {
        flushSync()
        return
      }
      if (syncTimerRef.current !== null) {
        return // Already scheduled
      }
      syncTimerRef.current = setTimeout(flushSync, TOOL_STREAM_THROTTLE_MS)
    },
    [flushSync]
  )

  // Trim old entries when over limit
  const trimEntries = useCallback(() => {
    if (orderRef.current.length <= TOOL_STREAM_LIMIT) {
      return
    }
    const overflow = orderRef.current.length - TOOL_STREAM_LIMIT
    const removed = orderRef.current.splice(0, overflow)
    for (const id of removed) {
      entriesRef.current.delete(id)
    }
  }, [])

  // Upsert a tool entry
  const upsertTool = useCallback(
    (
      toolCallId: string,
      update: Partial<Omit<ToolStreamEntry, "toolCallId">>
    ) => {
      const now = Date.now()
      const existing = entriesRef.current.get(toolCallId)

      if (existing) {
        // Update existing entry
        Object.assign(existing, { ...update, updatedAt: now })
      } else {
        // Create new entry
        const entry: ToolStreamEntry = {
          toolCallId,
          runId: update.runId ?? runId ?? "",
          sessionKey: update.sessionKey ?? sessionKey,
          name: update.name ?? "tool",
          args: update.args,
          output: update.output,
          status: update.status ?? "running",
          rawArguments: update.rawArguments,
          startedAt: update.startedAt ?? now,
          updatedAt: now,
        }
        entriesRef.current.set(toolCallId, entry)
        orderRef.current.push(toolCallId)
      }

      trimEntries()
      scheduleSync()
      // Trigger entries snapshot update
      setEntriesVersion((v) => v + 1)
    },
    [runId, sessionKey, trimEntries, scheduleSync]
  )

  // Complete a tool with output
  const completeTool = useCallback(
    (toolCallId: string, output: unknown, error = false) => {
      const entry = entriesRef.current.get(toolCallId)
      if (!entry) return

      entry.output = formatToolOutput(output) ?? undefined
      entry.status = error ? "error" : "completed"
      entry.updatedAt = Date.now()

      // Force immediate sync on completion for smooth UX
      scheduleSync(true)
      setEntriesVersion((v) => v + 1)
    },
    [scheduleSync]
  )

  // Reset all state
  const reset = useCallback(() => {
    entriesRef.current.clear()
    orderRef.current = []
    if (syncTimerRef.current !== null) {
      clearTimeout(syncTimerRef.current)
      syncTimerRef.current = null
    }
    setMessages([])
    setEntriesVersion(0)
  }, [])

  // Memoized entries snapshot for consumers - updates when version changes
  const entries = useMemo(
    () => new Map(entriesRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entriesVersion]
  )

  return {
    entries,
    messages,
    upsertTool,
    completeTool,
    reset,
  }
}

