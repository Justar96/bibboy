import type { ResponseOutputItem, ResponseStreamEvent } from "@bibboy/shared"
import { isJsonRecord, tryJsonParse } from "./websocket-chat-utils"

const HANDLED_EVENT_TYPES = [
  "response.created",
  "response.in_progress",
  "response.completed",
  "response.failed",
  "response.output_item.added",
  "response.output_text.delta",
  "response.output_text.done",
  "response.refusal.delta",
  "response.refusal.done",
  "response.function_call_arguments.delta",
  "response.function_call_arguments.done",
  "error",
] as const

type HandledEventType = (typeof HANDLED_EVENT_TYPES)[number]

export type HandledResponsesStreamEvent = Extract<ResponseStreamEvent, { type: HandledEventType }>

function hasSequenceNumber(value: Record<string, unknown>): boolean {
  return typeof value.sequence_number === "number"
}

function hasTextPartShape(value: unknown): boolean {
  if (!isJsonRecord(value) || typeof value.type !== "string") return false
  if (value.type === "output_text" || value.type === "reasoning_text") {
    return typeof value.text === "string"
  }
  if (value.type === "refusal") {
    return typeof value.refusal === "string"
  }
  return false
}

function hasMessageItemShape(value: Record<string, unknown>): boolean {
  if (value.type !== "message") return false
  if (typeof value.id !== "string") return false
  if (value.role !== "assistant") return false
  if (!Array.isArray(value.content)) return false
  return value.content.every((part) => hasTextPartShape(part))
}

function hasFunctionCallItemShape(value: Record<string, unknown>): boolean {
  return (
    value.type === "function_call" &&
    typeof value.id === "string" &&
    typeof value.call_id === "string" &&
    typeof value.name === "string" &&
    typeof value.arguments === "string"
  )
}

function hasFunctionCallOutputItemShape(value: Record<string, unknown>): boolean {
  return (
    value.type === "function_call_output" &&
    typeof value.id === "string" &&
    typeof value.call_id === "string" &&
    typeof value.output === "string"
  )
}

function isResponseOutputItem(value: unknown): value is ResponseOutputItem {
  if (!isJsonRecord(value) || typeof value.type !== "string") return false
  if (hasMessageItemShape(value)) return true
  if (hasFunctionCallItemShape(value)) return true
  if (hasFunctionCallOutputItemShape(value)) return true
  return false
}

function hasResponseResourceShape(value: unknown): boolean {
  if (!isJsonRecord(value)) return false
  if (typeof value.id !== "string") return false
  if (!Array.isArray(value.output)) return false
  if (!value.output.every((item) => isResponseOutputItem(item))) return false
  return true
}

export function isHandledResponsesStreamEvent(
  value: unknown
): value is HandledResponsesStreamEvent {
  if (!isJsonRecord(value)) return false
  if (typeof value.type !== "string") return false
  if (!(HANDLED_EVENT_TYPES as readonly string[]).includes(value.type)) return false
  if (!hasSequenceNumber(value)) return false

  switch (value.type) {
    case "response.created":
    case "response.in_progress":
    case "response.completed":
    case "response.failed":
      return hasResponseResourceShape(value.response)
    case "response.output_item.added":
      return typeof value.output_index === "number" && isResponseOutputItem(value.item)
    case "response.output_text.delta":
      return (
        typeof value.item_id === "string" &&
        typeof value.output_index === "number" &&
        typeof value.content_index === "number" &&
        typeof value.delta === "string"
      )
    case "response.output_text.done":
      return (
        typeof value.item_id === "string" &&
        typeof value.output_index === "number" &&
        typeof value.content_index === "number" &&
        typeof value.text === "string"
      )
    case "response.refusal.delta":
      return (
        typeof value.item_id === "string" &&
        typeof value.output_index === "number" &&
        typeof value.content_index === "number" &&
        typeof value.delta === "string"
      )
    case "response.refusal.done":
      return (
        typeof value.item_id === "string" &&
        typeof value.output_index === "number" &&
        typeof value.content_index === "number" &&
        typeof value.refusal === "string"
      )
    case "response.function_call_arguments.delta":
      return (
        typeof value.item_id === "string" &&
        typeof value.output_index === "number" &&
        typeof value.delta === "string"
      )
    case "response.function_call_arguments.done":
      return (
        typeof value.item_id === "string" &&
        typeof value.name === "string" &&
        typeof value.output_index === "number" &&
        typeof value.arguments === "string"
      )
    case "error":
      return (
        isJsonRecord(value.error) &&
        typeof value.error.code === "string" &&
        typeof value.error.message === "string"
      )
    default:
      return false
  }
}

export function parseHandledResponsesStreamEvent(payload: string): HandledResponsesStreamEvent | null {
  const parsed = tryJsonParse(payload)
  if (!isHandledResponsesStreamEvent(parsed)) return null
  return parsed
}
