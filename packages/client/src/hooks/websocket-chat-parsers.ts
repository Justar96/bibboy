import {
  type JsonRpcErrorResponse,
  type JsonRpcSuccessResponse,
} from "@bibboy/shared"
import {
  isJsonRecord,
  type JsonRecord,
} from "./websocket-chat-utils"

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function isJsonRpcErrorResponse(value: unknown): value is JsonRpcErrorResponse {
  if (!isJsonRecord(value)) return false
  if (value.jsonrpc !== "2.0") return false
  if (typeof value.id !== "string") return false
  if (!isJsonRecord(value.error)) return false
  return typeof value.error.message === "string"
}

export function isJsonRpcSuccessResponse(value: unknown): value is JsonRpcSuccessResponse {
  if (!isJsonRecord(value)) return false
  if (value.jsonrpc !== "2.0") return false
  if (typeof value.id !== "string") return false
  return "result" in value && !("error" in value)
}

export function readResultMessageId(value: unknown): string | null {
  if (!isJsonRecord(value)) return null
  return readString(value.messageId)
}

export function extractAssistantMessageContent(output: unknown, fallback: string): string {
  if (!Array.isArray(output)) return fallback

  let messageContent = fallback
  for (const item of output) {
    if (!isJsonRecord(item) || item.type !== "message" || !Array.isArray(item.content)) {
      continue
    }
    for (const part of item.content) {
      if (!isJsonRecord(part)) {
        continue
      }
      if (part.type === "output_text") {
        const text = readString(part.text)
        if (text !== null) {
          messageContent = text
        }
      }
      if (part.type === "refusal") {
        const refusal = readString(part.refusal)
        if (refusal !== null) {
          messageContent = refusal
        }
      }
    }
  }

  return messageContent
}

export function extractEventErrorMessage(data: JsonRecord, fallback: string): string {
  const error = isJsonRecord(data.error) ? data.error : null
  return readString(error?.message) ?? fallback
}
