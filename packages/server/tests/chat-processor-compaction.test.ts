import { Effect } from "effect"
import type { ChatMessage, CompactingNotification } from "@bibboy/shared"
import { describe, expect, it, vi } from "vitest"
import { maybeCompactSessionMessages } from "../src/services/chat-processor-compaction"
import type { CompactionResult } from "../src/services/ConversationMemory"

const baseMessages: ChatMessage[] = [
  {
    id: "u1",
    role: "user",
    content: "hello",
    timestamp: 1,
  },
  {
    id: "a1",
    role: "assistant",
    content: "hi",
    timestamp: 2,
  },
]

function createNotificationMock() {
  return vi.fn((_params: CompactingNotification["params"]) => Effect.void)
}

function createReplaceMock() {
  return vi.fn((_messages: ChatMessage[]) => Effect.void)
}

describe("maybeCompactSessionMessages", () => {
  it("returns original messages when api key is missing", async () => {
    const sendCompactionNotification = createNotificationMock()
    const replaceSessionMessages = createReplaceMock()
    const shouldCompactFn = vi.fn(() => true)
    const compactIfNeededFn = vi.fn(async () => {
      throw new Error("should not run")
    })

    const result = await Effect.runPromise(
      maybeCompactSessionMessages({
        sessionId: "s1",
        messageId: "m1",
        model: "gemini-3-flash-preview",
        apiKey: null,
        sessionMessages: baseMessages,
        sendCompactionNotification,
        replaceSessionMessages,
        shouldCompactFn,
        compactIfNeededFn,
      })
    )

    expect(result).toEqual(baseMessages)
    expect(shouldCompactFn).not.toHaveBeenCalled()
    expect(compactIfNeededFn).not.toHaveBeenCalled()
    expect(sendCompactionNotification).not.toHaveBeenCalled()
    expect(replaceSessionMessages).not.toHaveBeenCalled()
  })

  it("skips compaction when threshold is not met", async () => {
    const sendCompactionNotification = createNotificationMock()
    const replaceSessionMessages = createReplaceMock()
    const shouldCompactFn = vi.fn(() => false)
    const compactIfNeededFn = vi.fn(async (): Promise<CompactionResult> => ({
      compacted: false,
      messages: baseMessages,
      tokensBefore: 100,
      tokensAfter: 100,
      messagesCompacted: 0,
    }))

    const result = await Effect.runPromise(
      maybeCompactSessionMessages({
        sessionId: "s1",
        messageId: "m1",
        model: "gemini-3-flash-preview",
        apiKey: "api-key",
        sessionMessages: baseMessages,
        sendCompactionNotification,
        replaceSessionMessages,
        shouldCompactFn,
        compactIfNeededFn,
      })
    )

    expect(result).toEqual(baseMessages)
    expect(shouldCompactFn).toHaveBeenCalledTimes(1)
    expect(compactIfNeededFn).toHaveBeenCalledTimes(1)
    expect(sendCompactionNotification).not.toHaveBeenCalled()
    expect(replaceSessionMessages).not.toHaveBeenCalled()
  })

  it("replaces messages and emits start/done notifications on successful compaction", async () => {
    const sendCompactionNotification = createNotificationMock()
    const replaceSessionMessages = createReplaceMock()
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const compactedMessages: ChatMessage[] = [
      {
        id: "summary_1",
        role: "system",
        content: "[Conversation Summary] ...",
        timestamp: 3,
      },
      ...baseMessages,
    ]

    const compactionResult: CompactionResult = {
      compacted: true,
      messages: compactedMessages,
      tokensBefore: 4000,
      tokensAfter: 1000,
      messagesCompacted: 6,
    }

    const result = await Effect.runPromise(
      maybeCompactSessionMessages({
        sessionId: "s1",
        messageId: "m1",
        model: "gemini-3-flash-preview",
        apiKey: "api-key",
        sessionMessages: baseMessages,
        sendCompactionNotification,
        replaceSessionMessages,
        shouldCompactFn: () => true,
        compactIfNeededFn: async () => compactionResult,
      })
    )

    expect(result).toEqual(compactedMessages)
    expect(sendCompactionNotification).toHaveBeenNthCalledWith(1, {
      messageId: "m1",
      phase: "start",
    })
    expect(sendCompactionNotification).toHaveBeenNthCalledWith(2, {
      messageId: "m1",
      phase: "done",
      messagesCompacted: 6,
    })
    expect(replaceSessionMessages).toHaveBeenCalledWith(compactedMessages)
    logSpy.mockRestore()
  })

  it("clears compaction indicator when compaction throws", async () => {
    const sendCompactionNotification = createNotificationMock()
    const replaceSessionMessages = createReplaceMock()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const result = await Effect.runPromise(
      maybeCompactSessionMessages({
        sessionId: "s1",
        messageId: "m1",
        model: "gemini-3-flash-preview",
        apiKey: "api-key",
        sessionMessages: baseMessages,
        sendCompactionNotification,
        replaceSessionMessages,
        shouldCompactFn: () => true,
        compactIfNeededFn: async () => {
          throw new Error("compaction failed")
        },
      })
    )

    expect(result).toEqual(baseMessages)
    expect(sendCompactionNotification).toHaveBeenNthCalledWith(1, {
      messageId: "m1",
      phase: "start",
    })
    expect(sendCompactionNotification).toHaveBeenNthCalledWith(2, {
      messageId: "m1",
      phase: "done",
    })
    expect(replaceSessionMessages).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
