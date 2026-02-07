import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useTaskList } from "../../../src/hooks/useTaskList";

describe("useTaskList", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("ingests unique agent-suggested tasks as pending entries", () => {
    const { result } = renderHook(() => useTaskList());

    act(() => {
      result.current.ingestSuggestedTasks(["Ship v1", "Ship v1", "  "]);
    });

    expect(result.current.tasks).toHaveLength(1);
    expect(result.current.tasks[0]).toMatchObject({
      text: "Ship v1",
      status: "pending",
      source: "agent",
    });
  });

  it("avoids duplicates against existing task texts", () => {
    const { result } = renderHook(() => useTaskList());

    act(() => {
      result.current.addTask("Review PR", "user");
    });
    act(() => {
      result.current.ingestSuggestedTasks(["  review   pr  ", "Write release notes"]);
    });

    expect(result.current.tasks).toHaveLength(2);
    expect(result.current.tasks.map((task) => task.text)).toEqual([
      "Write release notes",
      "Review PR",
    ]);
  });
});
