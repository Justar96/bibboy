import { describe, expect, it, vi } from "vitest";
import { createTaskSuggestTool } from "../src/tools/task-suggest";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

describe("task_suggest tool", () => {
  it("parses JSON-array input and emits valid tasks", async () => {
    const emitTaskSuggest = vi.fn();
    const tool = createTaskSuggestTool(emitTaskSuggest);

    const result = await tool.execute("call_1", {
      tasks: JSON.stringify([{ text: "Ship v1" }, { text: "" }, { text: 42 }]),
    });

    expect(result.error).toBeUndefined();
    expect(emitTaskSuggest).toHaveBeenCalledTimes(1);
    const emitted = emitTaskSuggest.mock.calls[0]?.[0];
    expect(emitted).toHaveLength(2);
    expect(emitted[0]?.text).toBe("Ship v1");
    expect(emitted[1]?.text).toBe("42");

    expect(isRecord(result.details)).toBe(true);
    if (isRecord(result.details)) {
      expect(result.details.suggested).toBe(2);
    }
  });

  it("returns error for invalid JSON string", async () => {
    const tool = createTaskSuggestTool(() => {});
    const result = await tool.execute("call_2", { tasks: "[invalid" });

    expect(result.error).toBe("Invalid JSON in tasks parameter");
  });

  it("returns error for non-array tasks input", async () => {
    const tool = createTaskSuggestTool(() => {});
    const result = await tool.execute("call_3", { tasks: { text: "Nope" } });

    expect(result.error).toBe("tasks must be a JSON array string or array");
  });

  it("accepts array input and filters invalid task items", async () => {
    const emitTaskSuggest = vi.fn();
    const tool = createTaskSuggestTool(emitTaskSuggest);

    const result = await tool.execute("call_4", {
      tasks: [{ text: "First" }, { nope: "missing text" }, { text: 7 }, null],
    });

    expect(result.error).toBeUndefined();
    expect(emitTaskSuggest).toHaveBeenCalledTimes(1);
    const emitted = emitTaskSuggest.mock.calls[0]?.[0];
    expect(emitted).toHaveLength(2);
    expect(emitted[0]?.text).toBe("First");
    expect(emitted[1]?.text).toBe("7");
  });

  it("returns no-valid-tasks error when array has no usable text entries", async () => {
    const tool = createTaskSuggestTool(() => {});
    const result = await tool.execute("call_5", {
      tasks: [{ text: "   " }, { nope: true }, 1],
    });

    expect(result.error).toBe("No valid tasks found. Each task must have a 'text' field.");
  });
});
