import { describe, expect, it } from "vitest"
import {
  isHandledResponsesStreamEvent,
  parseHandledResponsesStreamEvent,
} from "../../../src/hooks/responses-stream-events"

describe("responses-stream-events", () => {
  it("parses handled text delta events", () => {
    const payload = JSON.stringify({
      type: "response.output_text.delta",
      item_id: "msg_1",
      output_index: 0,
      content_index: 0,
      delta: "Hello",
      sequence_number: 1,
    })

    const event = parseHandledResponsesStreamEvent(payload)
    expect(event).toMatchObject({
      type: "response.output_text.delta",
      delta: "Hello",
    })
  })

  it("accepts function call output item events and narrows item shape", () => {
    const raw = {
      type: "response.output_item.added",
      output_index: 1,
      item: {
        type: "function_call_output",
        id: "call_output_1",
        call_id: "tool_1",
        output: "{\"ok\":true}",
      },
      sequence_number: 2,
    }

    expect(isHandledResponsesStreamEvent(raw)).toBe(true)

    const event = parseHandledResponsesStreamEvent(JSON.stringify(raw))
    expect(event?.type).toBe("response.output_item.added")
    if (event?.type === "response.output_item.added") {
      expect(event.item.type).toBe("function_call_output")
    }
  })

  it("rejects malformed events missing required fields", () => {
    const payload = JSON.stringify({
      type: "response.function_call_arguments.delta",
      item_id: "call_1",
      output_index: 0,
      delta: 42,
      sequence_number: 3,
    })

    expect(parseHandledResponsesStreamEvent(payload)).toBeNull()
  })

  it("parses response.failed and error events", () => {
    const failedPayload = JSON.stringify({
      type: "response.failed",
      response: {
        id: "resp_1",
        object: "response",
        created_at: 1,
        status: "failed",
        model: "gemini-2.5-flash",
        output: [],
        error: { code: "provider_error", message: "upstream failure" },
      },
      sequence_number: 4,
    })

    const errorPayload = JSON.stringify({
      type: "error",
      error: { code: "stream_error", message: "broken stream" },
      sequence_number: 5,
    })

    expect(parseHandledResponsesStreamEvent(failedPayload)?.type).toBe("response.failed")
    expect(parseHandledResponsesStreamEvent(errorPayload)?.type).toBe("error")
  })
})
