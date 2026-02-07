import { Schema } from "effect"

const UnknownRecordSchema = Schema.Record({
  key: Schema.String,
  value: Schema.Unknown,
})

const decodeUnknownRecord = Schema.decodeUnknownEither(UnknownRecordSchema)

function toRecord(error: unknown): Record<string, unknown> | null {
  const decoded = decodeUnknownRecord(error)
  return decoded._tag === "Right" ? decoded.right : null
}

function getStringProp(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key]
  return typeof value === "string" ? value : undefined
}

function getFiniteNumberProp(
  record: Record<string, unknown>,
  key: string
): number | undefined {
  const value = record[key]
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

/** Extract the _tag from an Effect tagged error, or "unknown" */
export function extractErrorTag(error: unknown): string {
  const record = toRecord(error)
  if (!record) {
    return "unknown"
  }

  return getStringProp(record, "_tag") ?? "unknown"
}

/**
 * Extract a meaningful error message from an AgentServiceError.
 *
 * Effect's Data.TaggedError sets `.message` to "An error has occurred" by default.
 * The actual details live in tag-specific fields like `.reason`, `.provider`, etc.
 */
export function extractAgentErrorMessage(error: unknown): string {
  if (error == null) return "Unknown error"

  if (error instanceof Error && error.message !== "An error has occurred") {
    return error.message
  }

  const record = toRecord(error)
  if (!record) {
    const str = String(error)
    return str === "[object Object]" ? "Unknown error" : str
  }

  const tag = getStringProp(record, "_tag")

  if (tag) {
    switch (tag) {
      case "AgentError":
        return getStringProp(record, "reason") ?? "Agent error"
      case "ToolError":
        return `Tool '${getStringProp(record, "toolName") ?? "unknown"}' failed: ${getStringProp(record, "reason") ?? "unknown error"}`
      case "ApiKeyNotConfiguredError":
        return `API key not configured for provider: ${getStringProp(record, "provider") ?? "unknown"}`
      case "RateLimitExceededError": {
        const retryAfterMs = getFiniteNumberProp(record, "retryAfterMs")
        return `Rate limit exceeded${retryAfterMs ? ` (retry after ${retryAfterMs}ms)` : ""}`
      }
      case "ContextOverflowError": {
        const model = getStringProp(record, "model") ?? "unknown"
        const tokensUsed = getFiniteNumberProp(record, "tokensUsed")
        return `Context overflow for model ${model}${tokensUsed ? ` (${tokensUsed} tokens)` : ""}`
      }
      case "ApiTimeoutError":
        return `API request timed out after ${getFiniteNumberProp(record, "timeoutMs") ?? "unknown"}ms`
      case "ServiceOverloadedError": {
        const retryAfterMs = getFiniteNumberProp(record, "retryAfterMs")
        return `Service overloaded${retryAfterMs ? ` (retry after ${retryAfterMs}ms)` : ""}`
      }
      case "AuthenticationError":
        return `Authentication failed: ${getStringProp(record, "reason") ?? "unknown"}`
      case "BillingError":
        return `Billing error: ${getStringProp(record, "reason") ?? "unknown"}`
      case "NoResponseError":
        return "No response received from API"
      default: {
        const reason = getStringProp(record, "reason")
        if (reason) return reason
      }
    }
  }

  // Last resort
  const str = String(error)
  return str === "[object Object]" ? "Unknown error" : str
}
