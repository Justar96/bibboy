// ============================================================================
// Input Validation and Sanitization
// ============================================================================

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

/**
 * Sanitize a string by removing potentially dangerous characters.
 * Preserves most content but removes null bytes and control characters.
 */
export function sanitizeString(input: string): string {
  if (typeof input !== "string") return ""
  
  // Remove null bytes and most control characters (keep newlines, tabs)
  return input
    .replace(/\0/g, "")
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim()
}

/**
 * Validate and sanitize an agent request.
 * Returns sanitized data or validation error.
 */
export function validateAgentRequest(body: unknown): ValidationResult<{
  message: string
  agentId?: string
  history: Array<{ id: string; role: "user" | "assistant" | "system"; content: string; timestamp: number }>
  enableTools: boolean
}> {
  // Check if body is an object
  if (!body || typeof body !== "object") {
    return { success: false, error: "Invalid request body" }
  }

  const req = body as Record<string, unknown>

  // Validate message
  if (typeof req.message !== "string") {
    return { success: false, error: "Message is required and must be a string" }
  }

  const message = sanitizeString(req.message)
  
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
    if (typeof req.agentId !== "string") {
      return { success: false, error: "Agent ID must be a string" }
    }
    agentId = sanitizeString(req.agentId).slice(0, 100)
    // Validate agent ID format (alphanumeric, hyphens, underscores)
    if (agentId && !/^[a-zA-Z0-9_-]+$/.test(agentId)) {
      return { success: false, error: "Invalid agent ID format" }
    }
  }

  // Validate history if provided
  const history: Array<{ id: string; role: "user" | "assistant" | "system"; content: string; timestamp: number }> = []
  
  if (req.history !== undefined) {
    if (!Array.isArray(req.history)) {
      return { success: false, error: "History must be an array" }
    }

    if (req.history.length > MAX_HISTORY_LENGTH) {
      return { 
        success: false, 
        error: `History exceeds maximum length of ${MAX_HISTORY_LENGTH} messages` 
      }
    }

    for (let i = 0; i < req.history.length; i++) {
      const msg = req.history[i]
      
      if (!msg || typeof msg !== "object") {
        return { success: false, error: `Invalid message at history index ${i}` }
      }

      const histMsg = msg as Record<string, unknown>

      if (typeof histMsg.id !== "string") {
        return { success: false, error: `Missing or invalid ID at history index ${i}` }
      }

      if (!["user", "assistant", "system"].includes(histMsg.role as string)) {
        return { success: false, error: `Invalid role at history index ${i}` }
      }

      if (typeof histMsg.content !== "string") {
        return { success: false, error: `Missing or invalid content at history index ${i}` }
      }

      const content = sanitizeString(histMsg.content)
      if (content.length > MAX_HISTORY_CONTENT) {
        return { 
          success: false, 
          error: `Message content at history index ${i} exceeds maximum length` 
        }
      }

      if (typeof histMsg.timestamp !== "number" || !Number.isFinite(histMsg.timestamp)) {
        return { success: false, error: `Invalid timestamp at history index ${i}` }
      }

      history.push({
        id: sanitizeString(histMsg.id).slice(0, 100),
        role: histMsg.role as "user" | "assistant" | "system",
        content,
        timestamp: histMsg.timestamp,
      })
    }
  }

  // Validate enableTools
  const enableTools = req.enableTools !== false // Default to true

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
