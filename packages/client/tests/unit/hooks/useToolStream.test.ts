import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useToolStream } from "../../../src/hooks/useToolStream"

describe("useToolStream", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should initialize with empty state", () => {
    const { result } = renderHook(() => useToolStream())

    expect(result.current.entries.size).toBe(0)
    expect(result.current.messages).toHaveLength(0)
  })

  it("should add a new tool entry", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", {
        name: "calculateSum",
        args: { a: 1, b: 2 },
        status: "running",
      })
    })

    // Entry should exist immediately
    expect(result.current.entries.size).toBe(1)
    const entry = result.current.entries.get("tool_1")
    expect(entry?.name).toBe("calculateSum")
    expect(entry?.status).toBe("running")
  })

  it("should throttle message sync at 80ms", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", { name: "tool1" })
      result.current.upsertTool("tool_2", { name: "tool2" })
    })

    // Messages should be empty until throttle fires
    expect(result.current.messages).toHaveLength(0)

    // Advance past throttle interval
    act(() => {
      vi.advanceTimersByTime(80)
    })

    // Now messages should be synced
    expect(result.current.messages).toHaveLength(2)
  })

  it("should force immediate sync on tool completion", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", { name: "tool1", status: "running" })
    })

    act(() => {
      result.current.completeTool("tool_1", { result: "done" })
    })

    // Should sync immediately (force=true on complete)
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].content).toHaveLength(2) // toolcall + toolresult
  })

  it("should limit entries to 50 with LRU cleanup", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    // Add 55 tools
    act(() => {
      for (let i = 0; i < 55; i++) {
        result.current.upsertTool(`tool_${i}`, { name: `tool${i}` })
      }
    })

    // Should trim to 50
    expect(result.current.entries.size).toBe(50)
    // First 5 should be removed
    expect(result.current.entries.has("tool_0")).toBe(false)
    expect(result.current.entries.has("tool_4")).toBe(false)
    // Last ones should remain
    expect(result.current.entries.has("tool_54")).toBe(true)
  })

  it("should reset all state", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", { name: "tool1" })
      vi.advanceTimersByTime(80)
    })

    expect(result.current.entries.size).toBe(1)
    expect(result.current.messages).toHaveLength(1)

    act(() => {
      result.current.reset()
    })

    expect(result.current.entries.size).toBe(0)
    expect(result.current.messages).toHaveLength(0)
  })

  it("should build correct tool message structure", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", {
        name: "searchWeb",
        args: { query: "test" },
        status: "running",
      })
      vi.advanceTimersByTime(80)
    })

    const msg = result.current.messages[0]
    expect(msg.role).toBe("assistant")
    expect(msg.toolCallId).toBe("tool_1")
    expect(msg.runId).toBe("run_123")
    expect(msg.content[0]).toEqual({
      type: "toolcall",
      name: "searchWeb",
      arguments: { query: "test" },
    })
  })

  it("should update existing entry on upsert", () => {
    const { result } = renderHook(() => useToolStream({ runId: "run_123" }))

    act(() => {
      result.current.upsertTool("tool_1", { name: "tool1", args: { a: 1 } })
    })

    act(() => {
      result.current.upsertTool("tool_1", { args: { a: 2, b: 3 } })
    })

    const entry = result.current.entries.get("tool_1")
    expect(entry?.args).toEqual({ a: 2, b: 3 })
    // Should still be only 1 entry
    expect(result.current.entries.size).toBe(1)
  })
})
