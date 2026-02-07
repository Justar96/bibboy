import { Schema } from "effect"

// ============================================================================
// Health Response Schema
// ============================================================================

/**
 * Schema for health check API response.
 */
export const HealthResponseSchema = Schema.Struct({
  status: Schema.Literal("ok", "error"),
  timestamp: Schema.String,
})

/**
 * Type for health check response.
 */
export type HealthResponse = Schema.Schema.Type<typeof HealthResponseSchema>
