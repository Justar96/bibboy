// ============================================================================
// Agent Error Classification (matching reference implementation)
// ============================================================================

/**
 * Failover reason types.
 */
export type FailoverReason =
  | "auth"
  | "billing"
  | "rate_limit"
  | "context_overflow"
  | "timeout"
  | "overloaded"
  | "unknown"

/**
 * Error classification result.
 */
export interface ClassifiedError {
  reason: FailoverReason
  message: string
  retryable: boolean
  retryDelayMs?: number
}

/**
 * Check if error is a context overflow error.
 */
export function isContextOverflowError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("request_too_large") ||
    lower.includes("request exceeds the maximum size") ||
    lower.includes("context length exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("prompt is too long") ||
    lower.includes("exceeds model context window") ||
    lower.includes("exceeds the context window") ||
    lower.includes("context overflow") ||
    (lower.includes("413") && lower.includes("too large")) ||
    (lower.includes("request size exceeds") && lower.includes("context window"))
  )
}

/**
 * Check if error is a rate limit error.
 */
export function isRateLimitError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("too many requests") ||
    lower.includes("429") ||
    lower.includes("quota exceeded") ||
    lower.includes("tokens per minute") ||
    lower.includes("requests per minute")
  )
}

/**
 * Check if error is an auth error.
 */
export function isAuthError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("invalid api key") ||
    lower.includes("invalid_api_key") ||
    lower.includes("authentication") ||
    lower.includes("forbidden") ||
    lower.includes("permission denied")
  )
}

/**
 * Check if error is a billing error.
 */
export function isBillingError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("billing") ||
    lower.includes("payment") ||
    lower.includes("credit") ||
    lower.includes("insufficient funds") ||
    lower.includes("quota") ||
    lower.includes("budget exceeded")
  )
}

/**
 * Check if error is a timeout error.
 */
export function isTimeoutError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("504") ||
    lower.includes("gateway timeout") ||
    lower.includes("deadline exceeded")
  )
}

/**
 * Check if error is an overloaded error.
 */
export function isOverloadedError(errorMessage?: string): boolean {
  if (!errorMessage) {
    return false
  }
  const lower = errorMessage.toLowerCase()
  return (
    lower.includes("overloaded") ||
    lower.includes("503") ||
    lower.includes("service unavailable") ||
    lower.includes("capacity") ||
    lower.includes("too busy")
  )
}

/**
 * Classify an error and determine retry strategy.
 */
export function classifyError(error: unknown): ClassifiedError {
  const message = error instanceof Error ? error.message : String(error)

  if (isContextOverflowError(message)) {
    return {
      reason: "context_overflow",
      message,
      retryable: false, // Need compaction first
    }
  }

  if (isRateLimitError(message)) {
    return {
      reason: "rate_limit",
      message,
      retryable: true,
      retryDelayMs: 30000, // Wait 30s for rate limits
    }
  }

  if (isAuthError(message)) {
    return {
      reason: "auth",
      message,
      retryable: false, // Can't fix auth issues automatically
    }
  }

  if (isBillingError(message)) {
    return {
      reason: "billing",
      message,
      retryable: false,
    }
  }

  if (isTimeoutError(message)) {
    return {
      reason: "timeout",
      message,
      retryable: true,
      retryDelayMs: 5000, // Short delay for timeouts
    }
  }

  if (isOverloadedError(message)) {
    return {
      reason: "overloaded",
      message,
      retryable: true,
      retryDelayMs: 10000, // Wait 10s for overloaded
    }
  }

  return {
    reason: "unknown",
    message,
    retryable: true, // Default to retryable for unknown errors
    retryDelayMs: 2000, // Short backoff
  }
}

/**
 * Calculate retry delay with exponential backoff.
 */
export function calculateRetryDelay(
  baseDelayMs: number,
  attempt: number,
  maxDelayMs: number = 60000
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt)
  const jitter = Math.random() * 1000 // Add up to 1s jitter
  return Math.min(exponentialDelay + jitter, maxDelayMs)
}

/**
 * Check if we should retry based on classification and attempt count.
 */
export function shouldRetry(
  classification: ClassifiedError,
  attempt: number,
  maxAttempts: number = 3
): boolean {
  if (!classification.retryable) {
    return false
  }
  return attempt < maxAttempts
}

/**
 * Format error for user display.
 */
export function formatErrorForUser(classification: ClassifiedError): string {
  switch (classification.reason) {
    case "context_overflow":
      return "The conversation is too long. Please start a new conversation or clear history."
    case "rate_limit":
      return "Rate limit reached. Please wait a moment and try again."
    case "auth":
      return "Authentication error. Please check your API key configuration."
    case "billing":
      return "Billing issue detected. Please check your account status."
    case "timeout":
      return "Request timed out. Please try again."
    case "overloaded":
      return "The service is temporarily overloaded. Please try again shortly."
    default:
      return classification.message || "An unexpected error occurred."
  }
}
