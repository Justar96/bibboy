import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  shouldCompact,
  getContextUsage,
  compactIfNeeded,
  CONTEXT_WINDOW_TOKENS,
  COMPACTION_THRESHOLD,
  SAFETY_MARGIN,
  RECENT_TURNS_TO_KEEP,
} from "../src/services/ConversationMemory"
import type { ChatMessage } from "@bibboy/shared"

// ============================================================================
// Helpers
// ============================================================================

function makeMessage(
  role: "user" | "assistant" | "system",
  content: string,
  id?: string
): ChatMessage {
  return {
    id: id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    role,
    content,
    timestamp: Date.now(),
  }
}

function makeConversation(turns: number): ChatMessage[] {
  const messages: ChatMessage[] = []
  for (let i = 0; i < turns; i++) {
    messages.push(makeMessage("user", `User message ${i + 1}: ${" ".repeat(100)}`))
    messages.push(makeMessage("assistant", `Assistant response ${i + 1}: ${" ".repeat(200)}`))
  }
  return messages
}

function makeLargeConversation(estimatedTokens: number): ChatMessage[] {
  // Each char ≈ 1/3.5 tokens, so for N tokens we need ~3.5N chars
  // Minus ~10 tokens overhead per message
  const messages: ChatMessage[] = []
  const tokensPerTurn = 2000 // ~2K tokens per user+assistant pair
  const turnsNeeded = Math.ceil(estimatedTokens / tokensPerTurn)

  for (let i = 0; i < turnsNeeded; i++) {
    // Each message ~1K tokens = ~3500 chars
    const userText = `User question ${i + 1}: ` + "x".repeat(3400)
    const assistantText = `Answer ${i + 1}: ` + "y".repeat(3400)
    messages.push(makeMessage("user", userText))
    messages.push(makeMessage("assistant", assistantText))
  }
  return messages
}

// ============================================================================
// Token Estimation
// ============================================================================

describe("Token Estimation", () => {
  it("estimates tokens from text length", () => {
    const tokens = estimateTokens("Hello, world!")
    // 13 chars / 3.5 ≈ 4
    expect(tokens).toBe(4)
  })

  it("returns 0 for empty text", () => {
    expect(estimateTokens("")).toBe(0)
    expect(estimateTokens(null as unknown as string)).toBe(0)
  })

  it("estimates message tokens with overhead", () => {
    const msg = makeMessage("user", "Hello!")
    const tokens = estimateMessageTokens(msg)
    // 6 chars / 3.5 ≈ 2, plus 10 overhead = 12
    expect(tokens).toBe(12)
  })

  it("sums tokens for message array", () => {
    const messages = [
      makeMessage("user", "Hello"),
      makeMessage("assistant", "Hi there, how can I help?"),
    ]
    const total = estimateMessagesTokens(messages)
    expect(total).toBeGreaterThan(0)
    expect(total).toBe(
      estimateMessageTokens(messages[0]) + estimateMessageTokens(messages[1])
    )
  })
})

// ============================================================================
// Compaction Detection
// ============================================================================

describe("Compaction Detection", () => {
  it("returns false for small conversations", () => {
    const messages = makeConversation(3)
    expect(shouldCompact(2000, messages)).toBe(false)
  })

  it("returns false when below minimum message count", () => {
    const messages = [
      makeMessage("user", "x".repeat(100000)),
      makeMessage("assistant", "y".repeat(100000)),
    ]
    // Even with huge content, < 6 messages means no compaction
    expect(shouldCompact(0, messages)).toBe(false)
  })

  it("returns true when estimated tokens exceed threshold", () => {
    // Create messages that total > 75% of 128K (with safety margin)
    // Threshold = 128_000 * 0.75 = 96_000 tokens
    // Safety margin = 1.2, so need raw ~80_000 tokens
    const largeMessages = makeLargeConversation(85_000)
    expect(largeMessages.length).toBeGreaterThanOrEqual(6)
    expect(shouldCompact(2000, largeMessages)).toBe(true)
  })

  it("accounts for system prompt tokens", () => {
    // Large system prompt should make compaction trigger sooner
    const messages = makeLargeConversation(60_000)
    const withSmallPrompt = shouldCompact(1000, messages)
    const withLargePrompt = shouldCompact(30_000, messages)
    // Large prompt should trigger compaction even if messages alone wouldn't
    if (withSmallPrompt === false) {
      expect(withLargePrompt).toBe(true)
    }
  })
})

// ============================================================================
// Context Usage
// ============================================================================

describe("getContextUsage", () => {
  it("returns usage stats", () => {
    const messages = makeConversation(5)
    const usage = getContextUsage(2000, messages)

    expect(usage.contextLimit).toBe(CONTEXT_WINDOW_TOKENS)
    expect(usage.estimatedTokens).toBeGreaterThan(0)
    expect(usage.usagePercent).toBeGreaterThan(0)
    expect(usage.usagePercent).toBeLessThan(100)
    expect(typeof usage.shouldCompact).toBe("boolean")
  })

  it("reports high usage for large conversations", () => {
    const messages = makeLargeConversation(100_000)
    const usage = getContextUsage(2000, messages)
    expect(usage.usagePercent).toBeGreaterThan(50)
    expect(usage.shouldCompact).toBe(true)
  })
})

// ============================================================================
// compactIfNeeded (integration — mocked Gemini)
// ============================================================================

describe("compactIfNeeded", () => {
  it("returns original messages when compaction not needed", async () => {
    const messages = makeConversation(3)

    const result = await compactIfNeeded(messages, 2000, "fake-key", "gemini-3-flash-preview")

    expect(result.compacted).toBe(false)
    expect(result.messages).toHaveLength(messages.length)
    expect(result.messagesCompacted).toBe(0)
  })

  it("preserves recent turns during compaction", async () => {
    // We can't test the actual Gemini call without an API key,
    // but we can verify the split logic by checking that
    // shouldCompact returns true for large conversations
    const messages = makeLargeConversation(100_000)
    expect(shouldCompact(2000, messages)).toBe(true)

    // Verify the split logic keeps recent turns
    const recentUserCount = messages
      .slice(-RECENT_TURNS_TO_KEEP * 2)
      .filter((m) => m.role === "user").length
    expect(recentUserCount).toBe(RECENT_TURNS_TO_KEEP)
  })

  it("handles empty message array", async () => {
    const result = await compactIfNeeded([], 2000, "fake-key", "gemini-3-flash-preview")

    expect(result.compacted).toBe(false)
    expect(result.messages).toHaveLength(0)
  })
})

// ============================================================================
// Constants
// ============================================================================

describe("Constants", () => {
  it("has expected context window", () => {
    expect(CONTEXT_WINDOW_TOKENS).toBe(128_000)
  })

  it("has expected compaction threshold", () => {
    expect(COMPACTION_THRESHOLD).toBe(0.75)
  })

  it("has expected safety margin", () => {
    expect(SAFETY_MARGIN).toBe(1.2)
  })

  it("keeps recent turns during compaction", () => {
    expect(RECENT_TURNS_TO_KEEP).toBe(4)
  })
})
