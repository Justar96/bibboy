import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useChatQueue, isChatStopCommand, isChatResetCommand } from "../../../src/hooks/useChatQueue"

describe("useChatQueue", () => {
  describe("command detection", () => {
    it("should detect stop commands", () => {
      expect(isChatStopCommand("stop")).toBe(true)
      expect(isChatStopCommand("STOP")).toBe(true)
      expect(isChatStopCommand("/stop")).toBe(true)
      expect(isChatStopCommand("esc")).toBe(true)
      expect(isChatStopCommand("abort")).toBe(true)
      expect(isChatStopCommand("wait")).toBe(true)
      expect(isChatStopCommand("exit")).toBe(true)
      expect(isChatStopCommand("  stop  ")).toBe(true)
    })

    it("should not detect non-stop commands as stop", () => {
      expect(isChatStopCommand("hello")).toBe(false)
      expect(isChatStopCommand("stopping")).toBe(false)
      expect(isChatStopCommand("")).toBe(false)
    })

    it("should detect reset commands", () => {
      expect(isChatResetCommand("/new")).toBe(true)
      expect(isChatResetCommand("/reset")).toBe(true)
      expect(isChatResetCommand("/NEW")).toBe(true)
      expect(isChatResetCommand("/new session")).toBe(true)
      expect(isChatResetCommand("/reset now")).toBe(true)
    })

    it("should not detect non-reset commands as reset", () => {
      expect(isChatResetCommand("new")).toBe(false)
      expect(isChatResetCommand("reset")).toBe(false)
      expect(isChatResetCommand("hello")).toBe(false)
    })
  })

  describe("draft management", () => {
    it("should initialize with empty draft", () => {
      const { result } = renderHook(() => useChatQueue())
      expect(result.current.draft).toBe("")
    })

    it("should update draft", () => {
      const { result } = renderHook(() => useChatQueue())

      act(() => {
        result.current.setDraft("Hello world")
      })

      expect(result.current.draft).toBe("Hello world")
    })

    it("should restore draft on failure", () => {
      const { result } = renderHook(() => useChatQueue())

      act(() => {
        result.current.restoreDraft("Previous message")
      })

      expect(result.current.draft).toBe("Previous message")
    })
  })

  describe("queue operations", () => {
    it("should initialize with empty queue", () => {
      const { result } = renderHook(() => useChatQueue())
      expect(result.current.queue).toHaveLength(0)
    })

    it("should queue messages when busy", async () => {
      const { result } = renderHook(() => 
        useChatQueue({ 
          onFlush: vi.fn().mockResolvedValue(true) 
        })
      )

      act(() => {
        result.current.setBusy(true)
        result.current.setDraft("First message")
      })

      await act(async () => {
        await result.current.send()
      })

      expect(result.current.queue).toHaveLength(1)
      expect(result.current.queue[0].text).toBe("First message")
    })

    it("should remove items from queue", async () => {
      const { result } = renderHook(() => 
        useChatQueue({ 
          onFlush: vi.fn().mockResolvedValue(true) 
        })
      )

      act(() => {
        result.current.setBusy(true)
        result.current.setDraft("Message 1")
      })

      await act(async () => {
        await result.current.send()
        result.current.setDraft("Message 2")
        await result.current.send()
      })

      expect(result.current.queue).toHaveLength(2)

      const itemId = result.current.queue[0].id

      act(() => {
        result.current.removeFromQueue(itemId)
      })

      expect(result.current.queue).toHaveLength(1)
    })

    it("should clear entire queue", async () => {
      const { result } = renderHook(() => 
        useChatQueue({ 
          onFlush: vi.fn().mockResolvedValue(true) 
        })
      )

      act(() => {
        result.current.setBusy(true)
        result.current.setDraft("Message 1")
      })

      await act(async () => {
        await result.current.send()
        result.current.setDraft("Message 2")
        await result.current.send()
      })

      expect(result.current.queue).toHaveLength(2)

      act(() => {
        result.current.clearQueue()
      })

      expect(result.current.queue).toHaveLength(0)
    })
  })

  describe("stop command handling", () => {
    it("should call onStop and clear draft on stop command", async () => {
      const onStop = vi.fn()
      const { result } = renderHook(() => useChatQueue({ onStop }))

      act(() => {
        result.current.setDraft("/stop")
      })

      await act(async () => {
        await result.current.send()
      })

      expect(onStop).toHaveBeenCalledTimes(1)
      expect(result.current.draft).toBe("")
    })
  })

  describe("send behavior", () => {
    it("should not send empty messages", async () => {
      const onFlush = vi.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useChatQueue({ onFlush }))

      await act(async () => {
        const sent = await result.current.send("")
        expect(sent).toBe(false)
      })

      expect(onFlush).not.toHaveBeenCalled()
    })

    it("should send message directly when not busy", async () => {
      const onFlush = vi.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useChatQueue({ onFlush }))

      act(() => {
        result.current.setDraft("Test message")
      })

      await act(async () => {
        const sent = await result.current.send()
        expect(sent).toBe(true)
      })

      expect(onFlush).toHaveBeenCalledTimes(1)
      expect(onFlush).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Test message" })
      )
    })

    it("should clear draft after successful send", async () => {
      const onFlush = vi.fn().mockResolvedValue(true)
      const { result } = renderHook(() => useChatQueue({ onFlush }))

      act(() => {
        result.current.setDraft("Test message")
      })

      await act(async () => {
        await result.current.send()
      })

      expect(result.current.draft).toBe("")
    })
  })
})
