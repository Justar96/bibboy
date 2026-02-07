import { describe, it, expect } from "vitest"
import {
  validateAgentRequest,
  validateFilePath,
  sanitizeString,
} from "../src/api/input-validation"

describe("sanitizeString", () => {
  it("removes null bytes", () => {
    const input = "hello\0world"
    expect(sanitizeString(input)).toBe("helloworld")
  })

  it("removes control characters but keeps newlines and tabs", () => {
    const input = "hello\nworld\ttab"
    expect(sanitizeString(input)).toBe("hello\nworld\ttab")
  })

  it("trims whitespace", () => {
    const input = "  hello world  "
    expect(sanitizeString(input)).toBe("hello world")
  })

  it("handles non-string input", () => {
    expect(sanitizeString(null as unknown as string)).toBe("")
    expect(sanitizeString(123 as unknown as string)).toBe("")
  })
})

describe("validateAgentRequest", () => {
  it("validates a valid request", () => {
    const body = {
      message: "Hello, how are you?",
      agentId: "default",
      history: [],
      enableTools: true,
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBe("Hello, how are you?")
      expect(result.data.agentId).toBe("default")
    }
  })

  it("rejects missing message", () => {
    const body = {
      agentId: "default",
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Message")
    }
  })

  it("rejects empty message", () => {
    const body = {
      message: "   ",
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("empty")
    }
  })

  it("rejects message exceeding max length", () => {
    const body = {
      message: "a".repeat(10001),
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("maximum length")
    }
  })

  it("rejects invalid agent ID format", () => {
    const body = {
      message: "Hello",
      agentId: "../../../etc/passwd",
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Invalid agent ID")
    }
  })

  it("validates history messages", () => {
    const body = {
      message: "Hello",
      history: [
        {
          id: "msg-1",
          role: "user",
          content: "Hi there",
          timestamp: Date.now(),
        },
        {
          id: "msg-2",
          role: "assistant",
          content: "Hello!",
          timestamp: Date.now(),
        },
      ],
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.history).toHaveLength(2)
    }
  })

  it("rejects history with invalid role", () => {
    const body = {
      message: "Hello",
      history: [
        {
          id: "msg-1",
          role: "hacker",
          content: "Hi there",
          timestamp: Date.now(),
        },
      ],
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("Invalid role")
    }
  })

  it("rejects history exceeding max length", () => {
    const history = Array(51).fill(null).map((_, i) => ({
      id: `msg-${i}`,
      role: "user" as const,
      content: "Message",
      timestamp: Date.now(),
    }))

    const body = {
      message: "Hello",
      history,
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("maximum length")
    }
  })

  it("sanitizes message content", () => {
    const body = {
      message: "Hello\0World",
    }

    const result = validateAgentRequest(body)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.message).toBe("HelloWorld")
    }
  })
})

describe("validateFilePath", () => {
  it("accepts valid filename", () => {
    const result = validateFilePath("SOUL.md")
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe("SOUL.md")
    }
  })

  it("rejects directory traversal attempts", () => {
    const attempts = [
      "../../../etc/passwd",
      "..\\..\\windows\\system32\\config",
      "file/../../../secret.txt",
    ]

    for (const attempt of attempts) {
      const result = validateFilePath(attempt)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain("path traversal")
      }
    }
  })

  it("rejects paths with slashes", () => {
    const result = validateFilePath("subdir/file.txt")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("path traversal")
    }
  })

  it("rejects files without extension", () => {
    const result = validateFilePath("secretfile")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("extension")
    }
  })

  it("rejects overly long filenames", () => {
    const result = validateFilePath("a".repeat(260) + ".txt")
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toContain("too long")
    }
  })
})
