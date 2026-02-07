import { describe, expect, it } from "vitest";
import type { ToolExecutionResult } from "@bibboy/shared";
import { extractSuggestedTaskTexts } from "../../../src/hooks/task-suggest-ingestion";

describe("task-suggest-ingestion", () => {
  it("extracts task texts from tool result details payload", () => {
    const result: ToolExecutionResult = {
      toolCallId: "call_1",
      content: [{ type: "text", text: "{}" }],
      details: {
        suggested: 2,
        tasks: [
          { id: "task_1", text: "Ship v1" },
          { id: "task_2", text: "Add tests" },
        ],
      },
    };

    expect(extractSuggestedTaskTexts(result)).toEqual(["Ship v1", "Add tests"]);
  });

  it("falls back to parsing JSON payload from first content block", () => {
    const result: ToolExecutionResult = {
      toolCallId: "call_2",
      content: [
        {
          type: "text",
          text: JSON.stringify({
            suggested: 2,
            tasks: [{ text: "Write changelog" }, { text: "  Tidy imports  " }],
          }),
        },
      ],
    };

    expect(extractSuggestedTaskTexts(result)).toEqual(["Write changelog", "Tidy imports"]);
  });

  it("returns empty list for invalid payloads", () => {
    const result: ToolExecutionResult = {
      toolCallId: "call_3",
      content: [{ type: "text", text: '{"ok":true}' }],
      details: { tasks: [{ missing: "text" }] },
    };

    expect(extractSuggestedTaskTexts(result)).toEqual([]);
  });
});
