import { describe, expect, it } from "vitest"
import {
  extractAgentErrorMessage,
  extractErrorTag,
} from "../src/services/error-utils"

describe("extractErrorTag", () => {
  it("reads tagged errors", () => {
    expect(extractErrorTag({ _tag: "AgentError", reason: "failed" })).toBe("AgentError")
  })

  it("returns unknown for non-tagged values", () => {
    expect(extractErrorTag("x")).toBe("unknown")
    expect(extractErrorTag({})).toBe("unknown")
  })
})

describe("extractAgentErrorMessage", () => {
  it("extracts reason from AgentError", () => {
    expect(
      extractAgentErrorMessage({ _tag: "AgentError", reason: "provider failed" })
    ).toBe("provider failed")
  })

  it("formats ToolError with tool name and reason", () => {
    expect(
      extractAgentErrorMessage({
        _tag: "ToolError",
        toolName: "web_search",
        reason: "timeout",
      })
    ).toBe("Tool 'web_search' failed: timeout")
  })

  it("formats rate-limit and context-overflow metadata", () => {
    expect(
      extractAgentErrorMessage({ _tag: "RateLimitExceededError", retryAfterMs: 30000 })
    ).toContain("30000ms")

    expect(
      extractAgentErrorMessage({
        _tag: "ContextOverflowError",
        model: "gemini-3-flash-preview",
        tokensUsed: 12345,
      })
    ).toContain("12345 tokens")
  })

  it("falls back to native Error messages", () => {
    expect(extractAgentErrorMessage(new Error("network broke"))).toBe("network broke")
  })

  it("uses generic fallback for unknown objects", () => {
    expect(extractAgentErrorMessage({ foo: "bar" })).toBe("Unknown error")
    expect(extractAgentErrorMessage(null)).toBe("Unknown error")
  })

  it("uses reason from unknown tagged errors", () => {
    expect(
      extractAgentErrorMessage({ _tag: "CustomDomainError", reason: "custom failure" })
    ).toBe("custom failure")
  })
})
