import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolExecutionResult } from "@bibboy/shared"
import { createWebFetchTool } from "../src/tools/web-fetch"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getPayload(result: ToolExecutionResult): JsonRecord {
  if (!isRecord(result.details)) {
    throw new Error("Expected jsonResult payload in result.details")
  }
  return result.details
}

describe("web_fetch tool", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("defaults extractMode to text for invalid input", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", mockFetch)

    const tool = createWebFetchTool()
    const result = await tool.execute("call_1", {
      url: "https://example.com/a.json",
      extractMode: "invalid-mode",
    })

    const payload = getPayload(result)
    expect(payload.extractMode).toBe("text")
    expect(payload.status).toBe(200)
  })

  it("keeps markdown extractMode when requested", async () => {
    const mockFetch = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, value: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", mockFetch)

    const tool = createWebFetchTool()
    const result = await tool.execute("call_2", {
      url: "https://example.com/b.json",
      extractMode: "markdown",
    })

    const payload = getPayload(result)
    expect(payload.extractMode).toBe("markdown")
    expect(payload.extractor).toBe("json")
  })
})
