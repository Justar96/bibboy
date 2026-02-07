import { describe, expect, it } from "vitest"
import {
  isJsonRecord,
  parseToolResult,
  safeJsonParseObject,
  tryJsonParse,
} from "../../../src/hooks/websocket-chat-utils"

describe("websocket-chat-utils", () => {
  it("parses valid tool execution result payloads", () => {
    const output = JSON.stringify({
      toolCallId: "tc_1",
      content: [{ type: "text", text: "done" }],
      error: "failed",
    })

    expect(parseToolResult("fallback", output)).toEqual({
      toolCallId: "tc_1",
      content: [{ type: "text", text: "done" }],
      error: "failed",
    })
  })

  it("falls back to plain-text tool result for invalid payloads", () => {
    expect(parseToolResult("tc_bad", "{not json")).toEqual({
      toolCallId: "tc_bad",
      content: [{ type: "text", text: "{not json" }],
    })

    const wrongShape = JSON.stringify({ toolCallId: 1, content: "nope" })
    expect(parseToolResult("tc_shape", wrongShape)).toEqual({
      toolCallId: "tc_shape",
      content: [{ type: "text", text: wrongShape }],
    })
  })

  it("parses object json with fallback for non-object values", () => {
    expect(safeJsonParseObject("{\"a\":1}", { fallback: true })).toEqual({ a: 1 })
    expect(safeJsonParseObject("[1,2,3]", { fallback: true })).toEqual({ fallback: true })
    expect(safeJsonParseObject("invalid", { fallback: true })).toEqual({ fallback: true })
  })

  it("parses arbitrary json and returns undefined for invalid json", () => {
    expect(tryJsonParse("{\"ok\":true}")).toEqual({ ok: true })
    expect(tryJsonParse("not-json")).toBeUndefined()
  })

  it("identifies plain records only", () => {
    expect(isJsonRecord({ a: 1 })).toBe(true)
    expect(isJsonRecord(null)).toBe(false)
    expect(isJsonRecord(["a"])).toBe(false)
    expect(isJsonRecord("x")).toBe(false)
  })
})
