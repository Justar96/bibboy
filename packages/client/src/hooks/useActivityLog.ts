import { useState, useEffect, useRef, useCallback } from "react"
import type { ChatMessage, TypingState } from "@bibboy/shared"
import type { ToolExecution } from "./websocket-chat-utils"

// ============================================================================
// Types
// ============================================================================

export type ActivityActionStatus = "running" | "completed" | "error"

export interface ActivityAction {
  readonly id: string
  readonly type: "tool" | "canvas" | "soul" | "text" | "compacting" | "task"
  readonly name: string
  readonly status: ActivityActionStatus
  readonly startedAt: number
  readonly completedAt?: number
  readonly details?: Record<string, unknown>
}

export interface ActivityGroup {
  readonly messageId: string
  readonly userText: string
  readonly timestamp: number
  readonly actions: ActivityAction[]
}

export interface ActivityLogInput {
  readonly messages: ChatMessage[]
  readonly activeTools: ToolExecution[]
  readonly isTyping: boolean
  readonly typingState: TypingState | null
  readonly isCompacting: boolean
  readonly taskSuggestCount?: number
}

// ============================================================================
// Helpers
// ============================================================================

function toolToAction(tool: ToolExecution): ActivityAction {
  return {
    id: tool.id,
    type: "tool",
    name: tool.name,
    status: tool.status === "running" ? "running" : tool.error ? "error" : "completed",
    startedAt: tool.startedAt ?? Date.now(),
    completedAt: tool.status !== "running" ? Date.now() : undefined,
    details: tool.arguments,
  }
}

/** Merge live tool state into persisted actions. Keeps completed actions, updates running ones. */
function mergeActions(
  existing: ActivityAction[],
  liveTools: ToolExecution[],
  isTyping: boolean,
  typingState: TypingState | null,
  isCompacting: boolean,
  taskSuggestCount: number
): ActivityAction[] {
  const liveToolIds = new Set(liveTools.map((t) => t.id))

  // Keep all previously persisted tool actions that are no longer live
  const persisted = existing.filter(
    (a) => a.type === "tool" && !liveToolIds.has(a.id) && a.status !== "running"
  )

  // Current live tool actions (may be running or just completed)
  const liveActions = liveTools.map(toolToAction)

  // Transient actions (text responding, compacting) — only shown while active
  const transient: ActivityAction[] = []

  if (isCompacting) {
    transient.push({
      id: "compacting",
      type: "compacting",
      name: "Compacting context",
      status: "running",
      startedAt: Date.now(),
    })
  } else {
    // Keep completed compacting from previous state
    const prevCompacting = existing.find(
      (a) => a.type === "compacting" && a.status === "completed"
    )
    if (prevCompacting) transient.push(prevCompacting)
  }

  if (isTyping && typingState === "streaming") {
    transient.push({
      id: "responding",
      type: "text",
      name: "Responding",
      status: "running",
      startedAt: Date.now(),
    })
  } else {
    // Keep completed text action from previous state
    const prevText = existing.find(
      (a) => a.type === "text" && a.status === "completed"
    )
    if (prevText) transient.push(prevText)
  }

  // Show task suggestion as a completed action when count > 0
  if (taskSuggestCount > 0) {
    transient.push({
      id: `task_suggest_${taskSuggestCount}`,
      type: "task",
      name: `Suggested ${taskSuggestCount} task${taskSuggestCount > 1 ? "s" : ""}`,
      status: "completed",
      startedAt: Date.now(),
      completedAt: Date.now(),
    })
  }

  return [...persisted, ...liveActions, ...transient]
}

// ============================================================================
// Hook
// ============================================================================

export function useActivityLog(input: ActivityLogInput): ActivityGroup[] {
  const [groups, setGroups] = useState<ActivityGroup[]>([])
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  const { messages, activeTools, isTyping, typingState, isCompacting, taskSuggestCount = 0 } = input

  // Track user messages to create groups
  useEffect(() => {
    const userMessages = messages.filter((m) => m.role === "user")
    setGroups((prev) => {
      const existingIds = new Set(prev.map((g) => g.messageId))
      const newGroups = userMessages
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
          messageId: m.id,
          userText: m.content,
          timestamp: m.timestamp,
          actions: [],
        }))
      if (newGroups.length === 0) return prev
      return [...prev, ...newGroups]
    })
  }, [messages])

  // Merge live state into the latest group's actions (accumulative, not replacing)
  const updateLatestGroupActions = useCallback(
    (tools: ToolExecution[], typing: boolean, tState: TypingState | null, compacting: boolean, taskCount: number) => {
      const current = groupsRef.current
      if (current.length === 0) return

      const latestGroupId = current[current.length - 1].messageId

      setGroups((prev) =>
        prev.map((g) =>
          g.messageId === latestGroupId
            ? { ...g, actions: mergeActions(g.actions, tools, typing, tState, compacting, taskCount) }
            : g
        )
      )
    },
    []
  )

  // React to live state changes
  useEffect(() => {
    updateLatestGroupActions(activeTools, isTyping, typingState, isCompacting, taskSuggestCount)
  }, [activeTools, isTyping, typingState, isCompacting, taskSuggestCount, updateLatestGroupActions])

  // Finalize running transient actions when response completes
  useEffect(() => {
    if (!isTyping) {
      setGroups((prev) => {
        if (prev.length === 0) return prev
        const latestGroupId = prev[prev.length - 1].messageId
        return prev.map((g) =>
          g.messageId === latestGroupId
            ? {
                ...g,
                actions: g.actions.map((a) =>
                  a.type === "text" && a.status === "running"
                    ? { ...a, status: "completed" as const, completedAt: Date.now(), name: "Response complete" }
                    : a.type === "compacting" && a.status === "running"
                      ? { ...a, status: "completed" as const, completedAt: Date.now() }
                      : a
                ),
              }
            : g
        )
      })
    }
  }, [isTyping])

  return groups
}
