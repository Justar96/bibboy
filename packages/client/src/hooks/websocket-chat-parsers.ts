import {
  PERSONALITY_TRAITS,
  SOUL_STAGES,
  type CanvasCharacterBlueprint,
  type CanvasOp,
  type JsonRpcErrorResponse,
  type JsonRpcSuccessResponse,
  type SoulStage,
  type SoulState,
} from "@bibboy/shared"
import {
  isCanvasBlueprint,
  isCanvasOp,
  isJsonRecord,
  type JsonRecord,
} from "./websocket-chat-utils"

export function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function isSoulStage(value: unknown): value is SoulStage {
  return typeof value === "string" && SOUL_STAGES.includes(value as SoulStage)
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

export function isSoulState(value: unknown): value is SoulState {
  if (!isJsonRecord(value)) return false
  if (!isSoulStage(value.stage)) return false
  if (readNumber(value.interactionCount) === null) return false

  if (!isJsonRecord(value.traits)) return false
  for (const [key, traitValue] of Object.entries(value.traits)) {
    if (!PERSONALITY_TRAITS.includes(key as (typeof PERSONALITY_TRAITS)[number])) {
      return false
    }
    if (readNumber(traitValue) === null) {
      return false
    }
  }

  if (!Array.isArray(value.history)) return false
  for (const item of value.history) {
    if (!isJsonRecord(item)) return false
    if (!isSoulStage(item.fromStage) || !isSoulStage(item.toStage)) return false
    if (readString(item.trigger) === null || readNumber(item.timestamp) === null) return false
  }

  return true
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

export function parseCanvasSnapshot(
  params: JsonRecord
): { version: number; blueprint: CanvasCharacterBlueprint } | null {
  const version = readNumber(params.version)
  const blueprint = params.blueprint
  if (version === null || !isCanvasBlueprint(blueprint)) {
    return null
  }
  return { version, blueprint }
}

export function parseCanvasPatch(
  params: JsonRecord
): { version: number; blueprint: CanvasCharacterBlueprint; op: CanvasOp | null } | null {
  const snapshot = parseCanvasSnapshot(params)
  if (!snapshot) return null
  return {
    ...snapshot,
    op: isCanvasOp(params.op) ? params.op : null,
  }
}
