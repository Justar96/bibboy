import { Schema, Data } from "effect"

// ============================================================================
// Tool System Types (OpenClaw-inspired)
// ============================================================================

/** Reusable schema for string-keyed argument/property maps */
export const StringKeyedMap = Schema.Record({ key: Schema.String, value: Schema.Unknown })

/**
 * JSON Schema for tool parameters.
 */
export const ToolParameterSchema = Schema.Struct({
  type: Schema.Literal("object"),
  properties: StringKeyedMap,
  required: Schema.optional(Schema.Array(Schema.String)),
})

export type ToolParameter = Schema.Schema.Type<typeof ToolParameterSchema>

/**
 * Tool definition for the agent.
 */
export const ToolDefinitionSchema = Schema.Struct({
  name: Schema.String,
  label: Schema.String,
  description: Schema.String,
  parameters: ToolParameterSchema,
})

export type ToolDefinition = Schema.Schema.Type<typeof ToolDefinitionSchema>

/**
 * Tool call requested by the LLM.
 */
export const ToolCallSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  arguments: StringKeyedMap,
})

export type ToolCall = Schema.Schema.Type<typeof ToolCallSchema>

/**
 * Content block in tool result.
 */
export const ToolContentBlockSchema = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.String,
})

export type ToolContentBlock = Schema.Schema.Type<typeof ToolContentBlockSchema>

/**
 * Result of tool execution.
 */
export const ToolExecutionResultSchema = Schema.Struct({
  toolCallId: Schema.String,
  content: Schema.Array(ToolContentBlockSchema),
  details: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.String),
})

export type ToolExecutionResult = Schema.Schema.Type<typeof ToolExecutionResultSchema>

// ============================================================================
// Streaming Event Types
// ============================================================================

/**
 * Tool execution started event.
 */
export const ToolStartEventSchema = Schema.Struct({
  type: Schema.Literal("tool_start"),
  toolCallId: Schema.String,
  toolName: Schema.String,
  arguments: StringKeyedMap,
  thoughtSignature: Schema.optional(Schema.String),
})

export type ToolStartEvent = Schema.Schema.Type<typeof ToolStartEventSchema>

/**
 * Tool execution completed event.
 */
export const ToolEndEventSchema = Schema.Struct({
  type: Schema.Literal("tool_end"),
  toolCallId: Schema.String,
  toolName: Schema.String,
  result: ToolExecutionResultSchema,
})

export type ToolEndEvent = Schema.Schema.Type<typeof ToolEndEventSchema>

/**
 * Text delta event (streaming text).
 */
export const TextDeltaEventSchema = Schema.Struct({
  type: Schema.Literal("text_delta"),
  delta: Schema.String,
})

export type TextDeltaEvent = Schema.Schema.Type<typeof TextDeltaEventSchema>

/**
 * Agent run completed event.
 */
export const AgentDoneEventSchema = Schema.Struct({
  type: Schema.Literal("done"),
  message: Schema.Struct({
    id: Schema.String,
    role: Schema.Literal("assistant"),
    content: Schema.String,
    timestamp: Schema.Number,
  }),
  toolCalls: Schema.optional(Schema.Array(ToolCallSchema)),
  usage: Schema.optional(Schema.Struct({
    promptTokens: Schema.Number,
    completionTokens: Schema.Number,
    totalTokens: Schema.Number,
  })),
})

export type AgentDoneEvent = Schema.Schema.Type<typeof AgentDoneEventSchema>

/**
 * Error event.
 */
export const AgentErrorEventSchema = Schema.Struct({
  type: Schema.Literal("error"),
  error: Schema.String,
})

export type AgentErrorEvent = Schema.Schema.Type<typeof AgentErrorEventSchema>

/**
 * Union of all streaming events.
 */
export const AgentStreamEventSchema = Schema.Union(
  ToolStartEventSchema,
  ToolEndEventSchema,
  TextDeltaEventSchema,
  AgentDoneEventSchema,
  AgentErrorEventSchema
)

export type AgentStreamEvent = Schema.Schema.Type<typeof AgentStreamEventSchema>

// ============================================================================
// Agent Request/Response
// ============================================================================

/**
 * Request to run the agent.
 */
export const AgentRequestSchema = Schema.Struct({
  message: Schema.String,
  agentId: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  history: Schema.optional(Schema.Array(Schema.Struct({
    id: Schema.String,
    role: Schema.Union(
      Schema.Literal("user"),
      Schema.Literal("assistant"),
      Schema.Literal("system")
    ),
    content: Schema.String,
    timestamp: Schema.Number,
  }))),
  enableTools: Schema.optional(Schema.Boolean),
})

export type AgentRequest = Schema.Schema.Type<typeof AgentRequestSchema>

/**
 * Non-streaming agent response.
 */
export const AgentResponseSchema = Schema.Struct({
  message: Schema.Struct({
    id: Schema.String,
    role: Schema.Literal("assistant"),
    content: Schema.String,
    timestamp: Schema.Number,
  }),
  toolCalls: Schema.optional(Schema.Array(ToolCallSchema)),
  toolResults: Schema.optional(Schema.Array(ToolExecutionResultSchema)),
})

export type AgentResponse = Schema.Schema.Type<typeof AgentResponseSchema>

// ============================================================================
// Agent Errors (Tagged Error Types for Effect)
// ============================================================================

/**
 * Error when agent execution fails (generic agent error).
 */
export class AgentError extends Data.TaggedError("AgentError")<{
  readonly reason: string
}> {}

/**
 * Error when tool execution fails.
 */
export class ToolError extends Data.TaggedError("ToolError")<{
  readonly toolName: string
  readonly reason: string
}> {}

/**
 * Error when API key is not configured.
 */
export class ApiKeyNotConfiguredError extends Data.TaggedError("ApiKeyNotConfiguredError")<{
  readonly provider: string
}> {}

/**
 * Error when rate limit is exceeded.
 */
export class RateLimitExceededError extends Data.TaggedError("RateLimitExceededError")<{
  readonly retryAfterMs?: number
}> {}

/**
 * Error when context (token limit) is exceeded.
 */
export class ContextOverflowError extends Data.TaggedError("ContextOverflowError")<{
  readonly model: string
  readonly tokensUsed?: number
}> {}

/**
 * Error when API request times out.
 */
export class ApiTimeoutError extends Data.TaggedError("ApiTimeoutError")<{
  readonly timeoutMs: number
}> {}

/**
 * Error when service is overloaded.
 */
export class ServiceOverloadedError extends Data.TaggedError("ServiceOverloadedError")<{
  readonly retryAfterMs?: number
}> {}

/**
 * Error when authentication fails.
 */
export class AuthenticationError extends Data.TaggedError("AuthenticationError")<{
  readonly reason: string
}> {}

/**
 * Error when there's a billing issue.
 */
export class BillingError extends Data.TaggedError("BillingError")<{
  readonly reason: string
}> {}

/**
 * Error when no response is returned from API.
 */
export class NoResponseError extends Data.TaggedError("NoResponseError")<Record<string, never>> {}

/**
 * Union type of all agent-related errors.
 */
export type AgentServiceError =
  | AgentError
  | ToolError
  | ApiKeyNotConfiguredError
  | RateLimitExceededError
  | ContextOverflowError
  | ApiTimeoutError
  | ServiceOverloadedError
  | AuthenticationError
  | BillingError
  | NoResponseError

// ============================================================================
// API Response Schemas (for HttpApi endpoints)
// ============================================================================

/**
 * Schema for a single agent info item.
 */
export const AgentInfoSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})

export type AgentInfo = Schema.Schema.Type<typeof AgentInfoSchema>

/**
 * Schema for list agents API response.
 */
export const AgentListResponseSchema = Schema.Struct({
  agents: Schema.Array(AgentInfoSchema),
})

export type AgentListResponse = Schema.Schema.Type<typeof AgentListResponseSchema>

/**
 * Schema for prompt suggestions API response.
 */
export const SuggestionsResponseSchema = Schema.Struct({
  suggestions: Schema.Array(Schema.String),
})

export type SuggestionsResponse = Schema.Schema.Type<typeof SuggestionsResponseSchema>

/**
 * Schema for workspace file info.
 */
export const WorkspaceFileSchema = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  content: Schema.String,
})

export type WorkspaceFileInfo = Schema.Schema.Type<typeof WorkspaceFileSchema>

/**
 * Schema for workspace files list API response.
 */
export const WorkspaceFilesResponseSchema = Schema.Struct({
  files: Schema.Array(WorkspaceFileSchema),
})

export type WorkspaceFilesResponse = Schema.Schema.Type<typeof WorkspaceFilesResponseSchema>

/**
 * Schema for single workspace file API response.
 */
export const WorkspaceFileResponseSchema = Schema.Struct({
  file: WorkspaceFileSchema,
})

export type WorkspaceFileResponse = Schema.Schema.Type<typeof WorkspaceFileResponseSchema>

// ============================================================================
// API Error Schemas
// ============================================================================

/**
 * Schema for API key not configured error response.
 */
export const ApiKeyNotConfiguredErrorSchema = Schema.Struct({
  _tag: Schema.Literal("ApiKeyNotConfiguredError"),
  provider: Schema.String,
})

export type ApiKeyNotConfiguredErrorSchemaType = Schema.Schema.Type<typeof ApiKeyNotConfiguredErrorSchema>

/**
 * Schema for validation error response.
 */
export const ValidationErrorSchema = Schema.Struct({
  _tag: Schema.Literal("ValidationError"),
  error: Schema.String,
})

export type ValidationErrorSchemaType = Schema.Schema.Type<typeof ValidationErrorSchema>

/**
 * Schema for file not found error response.
 */
export const FileNotFoundErrorSchema = Schema.Struct({
  _tag: Schema.Literal("FileNotFoundError"),
  filename: Schema.String,
})

export type FileNotFoundErrorSchemaType = Schema.Schema.Type<typeof FileNotFoundErrorSchema>

/**
 * Tagged error for file not found.
 */
export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly filename: string
}> {}

/**
 * Tagged error for validation failures.
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly error: string
}> {}
