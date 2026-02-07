import { Schema } from "effect"

// ============================================================================
// API Error Schemas (for HTTP responses)
// ============================================================================

/**
 * Generic error response schema for API errors.
 */
export const ErrorResponseSchema = Schema.Struct({
  error: Schema.String,
  message: Schema.String,
  timestamp: Schema.String,
})

export type ErrorResponse = Schema.Schema.Type<typeof ErrorResponseSchema>

// ============================================================================
// Error Response Helper
// ============================================================================

/**
 * Creates a structured error response object.
 * Used for consistent error formatting across all API endpoints.
 */
export const createErrorResponse = (
  error: string,
  message: string
): ErrorResponse => ({
  error,
  message,
  timestamp: new Date().toISOString(),
})
