/** A suggested task for the user. */
export interface TaskSuggestion {
  id: string
  text: string
}
import type { AgentTool } from "./types"
import { jsonResult, errorResult } from "./types"

/**
 * Callback to emit task suggestions to the client via WebSocket.
 */
export type TaskSuggestCallback = (tasks: TaskSuggestion[]) => void

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function parseTasksInput(value: unknown): unknown[] | null {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  if (Array.isArray(value)) {
    return value
  }

  return null
}

/**
 * Create a tool that lets the agent suggest tasks for the user.
 */
export function createTaskSuggestTool(
  emitTaskSuggest: TaskSuggestCallback
): AgentTool {
  return {
    label: "Suggest Task",
    name: "task_suggest",
    description:
      "Suggest one or more actionable tasks or goals for the user. " +
      "Use this when you identify things the user might want to do, track, or follow up on. " +
      "Each task should be a concise, actionable item.",
    parameters: {
      type: "object",
      properties: {
        tasks: {
          type: "string",
          description:
            "JSON array of task objects, each with a 'text' field. " +
            'Example: [{"text": "Set up dark mode"}, {"text": "Add user profile page"}]',
        },
      },
      required: ["tasks"],
    },
    execute: async (_toolCallId, args) => {
      const tasksRaw = args.tasks
      const parsed = parseTasksInput(tasksRaw)

      if (parsed === null) {
        if (typeof tasksRaw === "string") {
          return errorResult("Invalid JSON in tasks parameter")
        }
        return errorResult("tasks must be a JSON array string or array")
      }

      if (parsed.length === 0) {
        return errorResult("tasks must be a non-empty array")
      }

      const tasks: TaskSuggestion[] = parsed
        .map((item, i) => {
          if (isRecord(item) && "text" in item) {
            const text = String(item.text).trim()
            return text ? { id: `task_${Date.now()}_${i}`, text } : null
          }
          return null
        })
        .filter((t): t is TaskSuggestion => t !== null)

      if (tasks.length === 0) {
        return errorResult("No valid tasks found. Each task must have a 'text' field.")
      }

      emitTaskSuggest(tasks)

      return jsonResult({
        suggested: tasks.length,
        tasks: tasks.map((t) => ({ id: t.id, text: t.text })),
      })
    },
  }
}
