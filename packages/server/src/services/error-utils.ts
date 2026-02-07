/** Extract the _tag from an Effect tagged error, or "unknown" */
export function extractErrorTag(error: unknown): string {
  if (error != null && typeof error === "object" && "_tag" in error) {
    return String((error as Record<string, unknown>)["_tag"])
  }
  return "unknown"
}

/**
 * Extract a meaningful error message from an AgentServiceError.
 *
 * Effect's Data.TaggedError sets `.message` to "An error has occurred" by default.
 * The actual details live in tag-specific fields like `.reason`, `.provider`, etc.
 */
export function extractAgentErrorMessage(error: unknown): string {
  if (error == null) return "Unknown error"

  // Fall back to standard Error message early for non-objects
  if (typeof error !== "object") {
    if (error instanceof Error && error.message !== "An error has occurred") {
      return error.message
    }
    const str = String(error)
    return str === "[object Object]" ? "Unknown error" : str
  }

  // Safe property accessor for tagged error fields
  const record = error as Record<string, unknown>
  const prop = (key: string): unknown => record[key]
  const tag = typeof prop("_tag") === "string" ? (prop("_tag") as string) : undefined

  if (tag) {
    switch (tag) {
      case "AgentError":
        return typeof prop("reason") === "string" ? prop("reason") as string : "Agent error"
      case "ToolError":
        return `Tool '${prop("toolName")}' failed: ${prop("reason")}`
      case "ApiKeyNotConfiguredError":
        return `API key not configured for provider: ${prop("provider")}`
      case "RateLimitExceededError":
        return `Rate limit exceeded${prop("retryAfterMs") ? ` (retry after ${prop("retryAfterMs")}ms)` : ""}`
      case "ContextOverflowError":
        return `Context overflow for model ${prop("model")}${prop("tokensUsed") ? ` (${prop("tokensUsed")} tokens)` : ""}`
      case "ApiTimeoutError":
        return `API request timed out after ${prop("timeoutMs")}ms`
      case "ServiceOverloadedError":
        return `Service overloaded${prop("retryAfterMs") ? ` (retry after ${prop("retryAfterMs")}ms)` : ""}`
      case "AuthenticationError":
        return `Authentication failed: ${prop("reason")}`
      case "BillingError":
        return `Billing error: ${prop("reason")}`
      case "NoResponseError":
        return "No response received from API"
      default:
        if (typeof prop("reason") === "string") return prop("reason") as string
    }
  }

  // Fall back to standard Error message
  if (error instanceof Error && error.message !== "An error has occurred") {
    return error.message
  }

  // Last resort
  const str = String(error)
  return str === "[object Object]" ? "Unknown error" : str
}
