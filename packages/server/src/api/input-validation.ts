// ============================================================================
// Input Validation and Sanitization
// ============================================================================
import { Schema } from "effect"

// Maximum sizes for input validation
const MAX_MESSAGE_LENGTH = 10000 // 10KB max message
const MAX_HISTORY_LENGTH = 50    // Max messages in history
const MAX_HISTORY_CONTENT = 5000 // Max characters per history message

/**
 * Validation result type.
 */
type ValidationResult<T> = 
  | { success: true; data: T }
  | { success: false; error: string }

const ChatRoleSchema = Schema.Union(
  Schema.Literal("user"),
  Schema.Literal("assistant"),
  Schema.Literal("system")
)
type ChatRole = Schema.Schema.Type<typeof ChatRoleSchema>

const UnknownRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
})

const decodeUnknownRecord = Schema.decodeUnknownEither(UnknownRecordSchema)
const decodeUnknownString = Schema.decodeUnknownEither(Schema.String)
const decodeUnknownBoolean = Schema.decodeUnknownEither(Schema.Boolean)
const decodeUnknownNumber = Schema.decodeUnknownEither(Schema.Number)
const decodeUnknownArray = Schema.decodeUnknownEither(Schema.Array(Schema.Unknown))
const decodeUnknownChatRole = Schema.decodeUnknownEither(ChatRoleSchema)

function toRecord(value: unknown): Record<string, unknown> | null {
  const decoded = decodeUnknownRecord(value)
  return decoded._tag === "Right" ? decoded.right : null
}

function toString(value: unknown): string | null {
  const decoded = decodeUnknownString(value)
  return decoded._tag === "Right" ? decoded.right : null
}

function toBoolean(value: unknown): boolean | null {
  const decoded = decodeUnknownBoolean(value)
  return decoded._tag === "Right" ? decoded.right : null
}

function toNumber(value: unknown): number | null {
  const decoded = decodeUnknownNumber(value)
  if (decoded._tag !== "Right" || !Number.isFinite(decoded.right)) {
    return null
  }
  return decoded.right
}

function toUnknownArray(value: unknown): unknown[] | null {
  const decoded = decodeUnknownArray(value)
  return decoded._tag === "Right" ? Array.from(decoded.right) : null
}

function toChatRole(value: unknown): ChatRole | null {
  const decoded = decodeUnknownChatRole(value)
  return decoded._tag === "Right" ? decoded.right : null
}

function removeDisallowedControlChars(input: string): string {
  let result = ""

  for (const char of input) {
    const code = char.codePointAt(0)
    if (code === undefined) {
      result += char
      continue
    }

    // Keep tab/newline/carriage-return; drop remaining ASCII control chars.
    if (code <= 0x1F && code !== 0x09 && code !== 0x0A && code !== 0x0D) {
      continue
    }

    result += char
  }

  return result
}

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Preserves most content but removes null bytes and control characters.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return ""
  
  // Remove control characters (including null bytes) while keeping newlines and tabs.
  return removeDisallowedControlChars(input).trim()
}

/**
 * Validate and sanitize an agent request.
 * Returns sanitized data or validation error.
 */
export function validateAgentRequest(body: unknown): ValidationResult<{
  message: string
  agentId?: string
  history: Array<{ id: string; role: ChatRole; content: string; timestamp: number }>
  enableTools: boolean
}> {
  const req = toRecord(body)
  if (!req) {
    return { success: false, error: "Invalid request body" }
  }

  // Validate message
  const rawMessage = toString(req.message)
  if (rawMessage === null) {
    return { success: false, error: "Message is required and must be a string" }
  }

  const message = sanitizeString(rawMessage)
  
  if (message.length === 0) {
    return { success: false, error: "Message cannot be empty" }
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { 
      success: false, 
      error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH} characters` 
    }
  }

  // Validate agentId if provided
  let agentId: string | undefined
  if (req.agentId !== undefined) {
    const parsedAgentId = toString(req.agentId)
    if (parsedAgentId === null) {
      return { success: false, error: "Agent ID must be a string" }
    }
    agentId = sanitizeString(parsedAgentId).slice(0, 100)
    // Validate agent ID format (alphanumeric, hyphens, underscores)
    if (agentId && !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      return { success: false, error: "Invalid agent ID format" }
    }
  }

  // Validate history if provided
  const history: Array<{ id: string; role: ChatRole; content: string; timestamp: number }> = []
  
  if (req.history !== undefined) {
    const parsedHistory = toUnknownArray(req.history)
    if (parsedHistory === null) {
      return { success: false, error: "History must be an array" }
    }

    if (parsedHistory.length > MAX_HISTORY_LENGTH) {
      return { 
        success: false, 
        error: `History exceeds maximum length of ${MAX_HISTORY_LENGTH} messages` 
      }
    }

    for (let i = 0; i < parsedHistory.length; i++) {
      const histMsg = toRecord(parsedHistory[i])
      if (!histMsg) {
        return { success: false, error: `Invalid message at history index ${i}` }
      }

      const rawId = toString(histMsg.id)
      if (rawId === null) {
        return { success: false, error: `Missing or invalid ID at history index ${i}` }
      }

      const parsedRole = toChatRole(histMsg.role)
      if (parsedRole === null) {
        return { success: false, error: `Invalid role at history index ${i}` }
      }

      const rawContent = toString(histMsg.content)
      if (rawContent === null) {
        return { success: false, error: `Missing or invalid content at history index ${i}` }
      }

      const content = sanitizeString(rawContent)
      if (content.length > MAX_HISTORY_CONTENT) {
        return { 
          success: false, 
          error: `Message content at history index ${i} exceeds maximum length` 
        }
      }

      const parsedTimestamp = toNumber(histMsg.timestamp)
      if (parsedTimestamp === null) {
        return { success: false, error: `Invalid timestamp at history index ${i}` }
      }

      history.push({
        id: sanitizeString(rawId).slice(0, 100),
        role: parsedRole,
        content,
        timestamp: parsedTimestamp,
      })
    }
  }

  // Validate enableTools
  let enableTools = true
  if (req.enableTools !== undefined) {
    const parsedEnableTools = toBoolean(req.enableTools)
    if (parsedEnableTools === null) {
      return { success: false, error: "enableTools must be a boolean" }
    }
    enableTools = parsedEnableTools
  }

  return {
    success: true,
    data: {
      message,
      agentId,
      history,
      enableTools,
    },
  }
}

/**
 * Validate workspace file path to prevent directory traversal.
 */
export function validateFilePath(filename: string): ValidationResult<string> {
  if (typeof filename !== "string") {
    return { success: false, error: "Filename must be a string" }
  }

  const sanitized = sanitizeString(filename)

  // Check for directory traversal attempts
  if (sanitized.includes("..") || sanitized.includes("/") || sanitized.includes("\\")) {
    return { success: false, error: "Invalid filename: path traversal not allowed" }
  }

  // Check for null bytes (already removed by sanitizeString but double-check)
  if (sanitized.includes("\0")) {
    return { success: false, error: "Invalid filename: contains null bytes" }
  }

  // Limit length
  if (sanitized.length > 255) {
    return { success: false, error: "Filename too long" }
  }

  // Must have valid extension
  if (!/\.[a-zA-Z0-9]+$/.test(sanitized)) {
    return { success: false, error: "Invalid filename: must have extension" }
  }

  return { success: true, data: sanitized }
}

/**
 * Create a validation error response.
 */
export function validationErrorResponse(error: string): Response {
  return new Response(
    JSON.stringify({
      _tag: "ValidationError",
      error,
    }),
    {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  )
}
