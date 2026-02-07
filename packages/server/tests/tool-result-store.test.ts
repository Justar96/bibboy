import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/workspace", () => ({
  writeWorkspaceFile: vi.fn(async () => {}),
}))

import { compactToolResult, resetResultCounter } from "../src/tools/tool-result-store"
import { writeWorkspaceFile } from "../src/workspace"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

describe("tool-result-store", () => {
  beforeEach(() => {
    resetResultCounter()
    vi.clearAllMocks()
  })

  it("compacts web_search payload with short snippets", async () => {
    const longDescription = "a".repeat(240)
    const output = await compactToolResult(
      "web_search",
      JSON.stringify({
        query: "latest ai news",
        provider: "brave",
        count: 1,
        tookMs: 123,
        results: [
          {
            title: "Article",
            url: "https://example.com/news",
            description: longDescription,
            siteName: "example.com",
          },
        ],
      }),
      "agent-test"
    )

    const parsed: unknown = JSON.parse(output)
    expect(isRecord(parsed)).toBe(true)
    if (isRecord(parsed)) {
      expect(parsed.query).toBe("latest ai news")
      expect(Array.isArray(parsed.results)).toBe(true)
      const first = (parsed.results as unknown[])[0]
      expect(isRecord(first)).toBe(true)
      if (isRecord(first)) {
        expect(typeof first.snippet).toBe("string")
        expect((first.snippet as string).length).toBe(120)
      }
    }
  })

  it("saves long web_fetch payload to workspace and returns file hint", async () => {
    const longText = "lorem ipsum ".repeat(320)

    const output = await compactToolResult(
      "web_fetch",
      JSON.stringify({
        url: "https://example.com/guide",
        title: "Guide",
        status: 200,
        fetchedAt: "2026-01-01T00:00:00.000Z",
        extractor: "readability",
        text: longText,
      }),
      "agent-abc"
    )

    expect(writeWorkspaceFile).toHaveBeenCalledTimes(1)
    const [agentId, filename, fileContent] = vi.mocked(writeWorkspaceFile).mock.calls[0] ?? []
    expect(agentId).toBe("agent-abc")
    expect(typeof filename).toBe("string")
    expect((filename as string).startsWith("web-fetch-1-")).toBe(true)
    expect(typeof fileContent).toBe("string")
    expect((fileContent as string).includes(longText.slice(0, 40))).toBe(true)

    const parsed: unknown = JSON.parse(output)
    expect(isRecord(parsed)).toBe(true)
    if (isRecord(parsed)) {
      expect(parsed.savedTo).toBe(filename)
      expect(typeof parsed.hint).toBe("string")
      expect(typeof parsed.preview).toBe("string")
    }
  })

  it("truncates raw text when JSON parse fails", async () => {
    const raw = "x".repeat(5000)
    const output = await compactToolResult("web_search", raw, "agent-test")

    expect(output.endsWith("\n[...truncated]")).toBe(true)
    expect(output.length).toBeLessThan(raw.length)
  })
})
