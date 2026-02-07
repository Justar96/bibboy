import { Effect, HashMap, Option, Ref } from "effect"
import type { AgentStreamEvent, ChatMessage } from "@bibboy/shared"
import { describe, expect, it, vi } from "vitest"
import {
  cleanupSessionStreamingState,
  createStreamEventState,
  handleAgentStreamEvent,
} from "../src/services/chat-processor-stream-handlers"

type HandleEventParams = Parameters<typeof handleAgentStreamEvent>[0]
type TestSessionManager = HandleEventParams["sessionManager"]
type TestEmitter = HandleEventParams["emitter"]

function createSessionManagerMock() {
  return {
    addMessage: vi.fn((_sessionId: string, _message: ChatMessage) => Effect.void),
    setActiveMessage: vi.fn((_sessionId: string, _messageId: string | null) => Effect.void),
    setStreaming: vi.fn((_sessionId: string, _isStreaming: boolean) => Effect.void),
  } as unknown as TestSessionManager
}

function createEmitterMock() {
  return {
    responseId: "resp_1",
    start: vi.fn(),
    addTextDelta: vi.fn(),
    addToolCall: vi.fn(),
    addToolResult: vi.fn(),
    complete: vi.fn(),
    fail: vi.fn(),
  } as unknown as TestEmitter
}

describe("chat-processor-stream-handlers", () => {
  it("applies text delta events", async () => {
    const sessionManager = createSessionManagerMock()
    const emitter = createEmitterMock()
    const state = createStreamEventState()

    const event: AgentStreamEvent = {
      type: "text_delta",
      delta: "Hello",
    }

    await Effect.runPromise(
      handleAgentStreamEvent({
        event,
        abortSignal: new AbortController().signal,
        emitter,
        sessionManager,
        sessionId: "s1",
        messageId: "m1",
        state,
      })
    )

    expect(state.accumulatedContent).toBe("Hello")
    expect(emitter.addTextDelta).toHaveBeenCalledWith("Hello")
  })

  it("handles done events and persists assistant message", async () => {
    const sessionManager = createSessionManagerMock()
    const emitter = createEmitterMock()
    const state = createStreamEventState()

    const event: AgentStreamEvent = {
      type: "done",
      message: {
        id: "assistant_1",
        role: "assistant",
        content: "Final answer",
        timestamp: Date.now(),
      },
    }

    await Effect.runPromise(
      handleAgentStreamEvent({
        event,
        abortSignal: new AbortController().signal,
        emitter,
        sessionManager,
        sessionId: "session-1",
        messageId: "message-1",
        state,
      })
    )

    expect(state.completed).toBe(true)
    expect(emitter.complete).toHaveBeenCalledWith("completed")
    expect(sessionManager.addMessage).toHaveBeenCalledTimes(1)
    expect(sessionManager.addMessage).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        id: "message-1_response",
        role: "assistant",
        content: "Final answer",
      })
    )
  })

  it("ignores events when abort signal is already aborted", async () => {
    const sessionManager = createSessionManagerMock()
    const emitter = createEmitterMock()
    const state = createStreamEventState()
    const controller = new AbortController()
    controller.abort()

    const event: AgentStreamEvent = {
      type: "error",
      error: "ignored",
    }

    await Effect.runPromise(
      handleAgentStreamEvent({
        event,
        abortSignal: controller.signal,
        emitter,
        sessionManager,
        sessionId: "s1",
        messageId: "m1",
        state,
      })
    )

    expect(state.completed).toBe(false)
    expect(emitter.fail).not.toHaveBeenCalled()
  })

  it("cleans streaming session state and removes active stream", async () => {
    const sessionManager = createSessionManagerMock()
    const initialStreams = HashMap.set(
      HashMap.empty<string, { id: string }>(),
      "session-1",
      { id: "active" }
    )
    const activeStreamsRef = await Effect.runPromise(
      Ref.make(initialStreams)
    )

    await Effect.runPromise(
      cleanupSessionStreamingState({
        sessionManager,
        activeStreamsRef,
        sessionId: "session-1",
      })
    )

    expect(sessionManager.setActiveMessage).toHaveBeenCalledWith("session-1", null)
    expect(sessionManager.setStreaming).toHaveBeenCalledWith("session-1", false)

    const streams = await Effect.runPromise(Ref.get(activeStreamsRef))
    expect(Option.isNone(HashMap.get(streams, "session-1"))).toBe(true)
  })
})
