import { Schema, Data } from "effect"

// ============================================================================
// Chat Messages
// ============================================================================

/**
 * Role of a message sender.
 */
export const MessageRoleSchema = Schema.Union(
  Schema.Literal("user"),
  Schema.Literal("assistant"),
  Schema.Literal("system")
)

export type MessageRole = Schema.Schema.Type<typeof MessageRoleSchema>

/**
 * A single chat message.
 */
export const ChatMessageSchema = Schema.Struct({
  id: Schema.String,
  role: MessageRoleSchema,
  content: Schema.String,
  timestamp: Schema.Number,
})

export type ChatMessage = Schema.Schema.Type<typeof ChatMessageSchema>

// ============================================================================
// Tool Calls (for web search, etc.)
// ============================================================================

/**
 * Web search result from Brave/Perplexity.
 */
export const SearchResultSchema = Schema.Struct({
  title: Schema.String,
  url: Schema.String,
  description: Schema.String,
})

export type SearchResult = Schema.Schema.Type<typeof SearchResultSchema>

/**
 * Tool call result included in response.
 */
export const ToolResultSchema = Schema.Struct({
  tool: Schema.Literal("web_search"),
  query: Schema.String,
  results: Schema.Array(SearchResultSchema),
})

export type ToolResult = Schema.Schema.Type<typeof ToolResultSchema>

// ============================================================================
// API Request/Response
// ============================================================================

/**
 * Request to send a chat message.
 */
export const ChatRequestSchema = Schema.Struct({
  message: Schema.String,
  history: Schema.optional(Schema.Array(ChatMessageSchema)),
  enableSearch: Schema.optional(Schema.Boolean),
})

export type ChatRequest = Schema.Schema.Type<typeof ChatRequestSchema>

/**
 * Response from chat endpoint.
 */
export const ChatResponseSchema = Schema.Struct({
  message: ChatMessageSchema,
  toolResults: Schema.optional(Schema.Array(ToolResultSchema)),
})

export type ChatResponse = Schema.Schema.Type<typeof ChatResponseSchema>

// ============================================================================
// Chat Errors
// ============================================================================

/**
 * Error when chat request fails.
 */
export class ChatError extends Data.TaggedError("ChatError")<{
  readonly reason: string
}> {}

/**
 * Error when rate limit is exceeded.
 */
export class RateLimitError extends Data.TaggedError("RateLimitError")<{
  readonly retryAfter: number
}> {}

/**
 * Schema for ChatError API response.
 */
export const ChatErrorSchema = Schema.Struct({
  _tag: Schema.Literal("ChatError"),
  reason: Schema.String,
})

export type ChatErrorSchemaType = Schema.Schema.Type<typeof ChatErrorSchema>

/**
 * Schema for RateLimitError API response.
 */
export const RateLimitErrorSchema = Schema.Struct({
  _tag: Schema.Literal("RateLimitError"),
  retryAfter: Schema.Number,
})

export type RateLimitErrorSchemaType = Schema.Schema.Type<typeof RateLimitErrorSchema>
