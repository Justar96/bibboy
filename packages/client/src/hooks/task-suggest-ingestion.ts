import { useEffect, useRef } from "react";
import { Schema } from "effect";
import type { ToolExecutionResult } from "@bibboy/shared";

const TaskSuggestionItemSchema = Schema.Struct({
  text: Schema.String,
});

const TaskSuggestPayloadSchema = Schema.Struct({
  tasks: Schema.Array(TaskSuggestionItemSchema),
});

const decodeTaskSuggestPayload = Schema.decodeUnknownEither(TaskSuggestPayloadSchema);

function parseTaskSuggestPayload(value: unknown): string[] {
  const decoded = decodeTaskSuggestPayload(value);
  if (decoded._tag !== "Right") {
    return [];
  }

  return decoded.right.tasks.map((task) => task.text.trim()).filter((text) => text.length > 0);
}

export interface TaskSuggestToolExecution {
  readonly id: string;
  readonly name: string;
  readonly status: "running" | "completed" | "error";
  readonly result?: ToolExecutionResult;
}

export function extractSuggestedTaskTexts(result: ToolExecutionResult): string[] {
  const fromDetails = parseTaskSuggestPayload(result.details);
  if (fromDetails.length > 0) {
    return fromDetails;
  }

  const firstBlock = result.content[0];
  if (!firstBlock || firstBlock.type !== "text") {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(firstBlock.text);
  } catch {
    return [];
  }

  return parseTaskSuggestPayload(parsed);
}

export function useAutoIngestTaskSuggestions(params: {
  readonly activeTools: readonly TaskSuggestToolExecution[];
  readonly ingestSuggestedTasks: (texts: readonly string[]) => void;
}): void {
  const processedToolIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const suggested: string[] = [];

    for (const tool of params.activeTools) {
      if (tool.name !== "task_suggest" || tool.status === "running") {
        continue;
      }

      if (processedToolIdsRef.current.has(tool.id)) {
        continue;
      }
      processedToolIdsRef.current.add(tool.id);

      if (!tool.result || tool.status === "error") {
        continue;
      }

      suggested.push(...extractSuggestedTaskTexts(tool.result));
    }

    if (suggested.length > 0) {
      params.ingestSuggestedTasks(suggested);
    }
  }, [params.activeTools, params.ingestSuggestedTasks]);
}
