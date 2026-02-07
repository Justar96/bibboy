import { afterEach, describe, expect, it, vi } from "vitest"
import { Effect } from "effect"
import {
  chatMessagesToGeminiContents,
  createGeminiResponse,
} from "../src/gemini/gemini-client"

const baseRequest = {
  apiKey: "test-key",
  model: "gemini-test",
  contents: [{ role: "user" as const, parts: [{ text: "hello" }] }],
}

describe("createGeminiResponse", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("parses valid Gemini response payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  role: "model",
                  parts: [
                    { text: "hello " },
                    { text: "world" },
                    {
                      functionCall: {
                        name: "read_file",
                        args: { filename: "SOUL.md" },
                      },
                    },
                  ],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 3,
              totalTokenCount: 8,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )

    const result = await Effect.runPromise(createGeminiResponse(baseRequest))

    expect(result.text).toBe("hello world")
    expect(result.functionCalls).toEqual([
      { name: "read_file", args: { filename: "SOUL.md" } },
    ])
    expect(result.usage).toEqual({
      promptTokens: 5,
      completionTokens: 3,
      totalTokens: 8,
    })
  })

  it("rejects malformed function call args that are not objects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      functionCall: {
                        name: "read_file",
                        args: "SOUL.md",
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )

    await expect(
      Effect.runPromise(createGeminiResponse(baseRequest))
    ).rejects.toThrow("Unexpected Gemini response shape")
  })
})

describe("chatMessagesToGeminiContents", () => {
  it("injects system context into the first user turn", () => {
    const contents = chatMessagesToGeminiContents([
      { role: "system", content: "summary: prior context" },
      { role: "user", content: "new prompt" },
      { role: "assistant", content: "response" },
    ])

    expect(contents[0]?.role).toBe("user")
    expect(contents[0]?.parts[0]?.text).toContain("summary: prior context")
    expect(contents[0]?.parts[1]?.text).toBe("new prompt")
  })
})
