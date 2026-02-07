import { Schema } from "effect";
import type { AgentTool } from "./types";
import { jsonResult, errorResult } from "./types";

/** A suggested task for the user. */
export interface TaskSuggestion {
  id: string;
  text: string;
}

/**
 * Callback to emit task suggestions to the client via WebSocket.
 */
export type TaskSuggestCallback = (tasks: TaskSuggestion[]) => void;

const TaskInputArraySchema = Schema.Array(Schema.Unknown);
const TaskInputItemSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
});

const decodeUnknownTaskInputArray = Schema.decodeUnknownEither(TaskInputArraySchema);
const decodeUnknownTaskInputItem = Schema.decodeUnknownEither(TaskInputItemSchema);

type ParseTasksInputResult =
  | { _tag: "InvalidJson" }
  | { _tag: "InvalidType" }
  | { _tag: "Ok"; tasks: unknown[] };

function decodeTaskArray(value: unknown): unknown[] | null {
  const decoded = decodeUnknownTaskInputArray(value);
  return decoded._tag === "Right" ? Array.from(decoded.right) : null;
}

function parseTasksInput(value: unknown): ParseTasksInputResult {
  if (typeof value === "string") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return { _tag: "InvalidJson" };
    }

    const tasks = decodeTaskArray(parsed);
    if (tasks === null) {
      return { _tag: "InvalidType" };
    }

    return { _tag: "Ok", tasks };
  }

  if (Array.isArray(value)) {
    const tasks = decodeTaskArray(value);
    if (tasks === null) {
      return { _tag: "InvalidType" };
    }

    return { _tag: "Ok", tasks };
  }

  return { _tag: "InvalidType" };
}

/**
 * Create a tool that lets the agent suggest tasks for the user.
 */
export function createTaskSuggestTool(emitTaskSuggest: TaskSuggestCallback): AgentTool {
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
      const tasksRaw = args.tasks;
      const parsedResult = parseTasksInput(tasksRaw);

      if (parsedResult._tag !== "Ok") {
        if (parsedResult._tag === "InvalidJson") {
          return errorResult("Invalid JSON in tasks parameter");
        }
        return errorResult("tasks must be a JSON array string or array");
      }

      if (parsedResult.tasks.length === 0) {
        return errorResult("tasks must be a non-empty array");
      }

      const now = Date.now();
      const tasks: TaskSuggestion[] = parsedResult.tasks
        .map((item, index) => {
          const parsedTask = decodeUnknownTaskInputItem(item);
          if (parsedTask._tag !== "Right" || !("text" in parsedTask.right)) {
            return null;
          }

          const text = String(parsedTask.right.text).trim();
          if (!text) {
            return null;
          }

          return {
            id: `task_${now}_${index}`,
            text,
          };
        })
        .filter((task): task is TaskSuggestion => {
          return task !== null;
        });

      if (tasks.length === 0) {
        return errorResult("No valid tasks found. Each task must have a 'text' field.");
      }

      emitTaskSuggest(tasks);

      return jsonResult({
        suggested: tasks.length,
        tasks: tasks.map((task) => ({
          id: task.id,
          text: task.text,
        })),
      });
    },
  };
}
