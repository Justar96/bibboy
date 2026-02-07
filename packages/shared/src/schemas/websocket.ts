import { Schema, Data } from "effect"
import { ChatMessageSchema } from "./chat"
import { ToolExecutionResultSchema, StringKeyedMap } from "./agent"
import { AgentPoseSchema, CharacterStateSchema } from "./character"
import {
  CanvasStatePatchSchema,
  CanvasStateSnapshotSchema,
} from "./canvas"
import {
  SoulStageChangePayloadSchema,
  SoulStateSnapshotPayloadSchema,
} from "./soul"

// ============================================================================
// JSON-RPC 2.0 Base
// ============================================================================

/**
 * Base fields for JSON-RPC 2.0 messages
 */
export const JsonRpcVersionSchema = Schema.Literal("2.0")

// ============================================================================
// Client → Server Requests
// ============================================================================

/**
 * Request to send a chat message
 */
export const ChatSendRequestSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  id: Schema.String,
  method: Schema.Literal("chat.send"),
  params: Schema.Struct({
    message: Schema.String,
    agentId: Schema.optional(Schema.String),
    characterState: Schema.optional(CharacterStateSchema),
  }),
})

export type ChatSendRequest = Schema.Schema.Type<typeof ChatSendRequestSchema>

/**
 * Request to cancel current message generation
 */
export const ChatCancelRequestSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  id: Schema.String,
  method: Schema.Literal("chat.cancel"),
})

export type ChatCancelRequest = Schema.Schema.Type<typeof ChatCancelRequestSchema>

/**
 * Ping request for connection keep-alive
 */
export const PingRequestSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  id: Schema.String,
  method: Schema.Literal("ping"),
})

export type PingRequest = Schema.Schema.Type<typeof PingRequestSchema>

/**
 * Union of all client messages
 */
export const ClientMessageSchema = Schema.Union(
  ChatSendRequestSchema,
  ChatCancelRequestSchema,
  PingRequestSchema
)

export type ClientMessage = Schema.Schema.Type<typeof ClientMessageSchema>

// ============================================================================
// Server → Client Responses (with id)
// ============================================================================

/**
 * Success response to a request
 */
export const JsonRpcSuccessResponseSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  id: Schema.String,
  result: Schema.Unknown,
})

export type JsonRpcSuccessResponse = Schema.Schema.Type<typeof JsonRpcSuccessResponseSchema>

/**
 * Error response to a request
 */
export const JsonRpcErrorResponseSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  id: Schema.String,
  error: Schema.Struct({
    code: Schema.Number,
    message: Schema.String,
    data: Schema.optional(Schema.Unknown),
  }),
})

export type JsonRpcErrorResponse = Schema.Schema.Type<typeof JsonRpcErrorResponseSchema>

// ============================================================================
// Server → Client Notifications (no id)
// ============================================================================

/**
 * Typing states for the agent
 */
export const TypingStateSchema = Schema.Union(
  Schema.Literal("thinking"),
  Schema.Literal("tool_executing"),
  Schema.Literal("streaming")
)

export type TypingState = Schema.Schema.Type<typeof TypingStateSchema>

/**
 * Notification that agent started typing/processing
 */
export const TypingStartNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.typing_start"),
  params: Schema.Struct({
    messageId: Schema.String,
    state: TypingStateSchema,
  }),
})

export type TypingStartNotification = Schema.Schema.Type<typeof TypingStartNotificationSchema>

/**
 * Notification that agent stopped typing
 */
export const TypingStopNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.typing_stop"),
  params: Schema.Struct({
    messageId: Schema.String,
  }),
})

export type TypingStopNotification = Schema.Schema.Type<typeof TypingStopNotificationSchema>

/**
 * Streaming text delta notification
 */
export const TextDeltaNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.text_delta"),
  params: Schema.Struct({
    messageId: Schema.String,
    delta: Schema.String,
  }),
})

export type TextDeltaNotification = Schema.Schema.Type<typeof TextDeltaNotificationSchema>

/**
 * Tool execution started notification
 */
export const ToolStartNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.tool_start"),
  params: Schema.Struct({
    toolCallId: Schema.String,
    toolName: Schema.String,
    arguments: StringKeyedMap,
  }),
})

export type ToolStartNotification = Schema.Schema.Type<typeof ToolStartNotificationSchema>

/**
 * Tool execution completed notification
 */
export const ToolEndNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.tool_end"),
  params: Schema.Struct({
    toolCallId: Schema.String,
    toolName: Schema.String,
    result: ToolExecutionResultSchema,
  }),
})

export type ToolEndNotification = Schema.Schema.Type<typeof ToolEndNotificationSchema>

/**
 * Message generation completed notification
 */
export const MessageCompleteNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.complete"),
  params: Schema.Struct({
    messageId: Schema.String,
    content: Schema.String,
    toolCalls: Schema.optional(Schema.Array(Schema.Struct({
      toolCallId: Schema.String,
      toolName: Schema.String,
      arguments: StringKeyedMap,
      result: Schema.optional(ToolExecutionResultSchema),
    }))),
  }),
})

export type MessageCompleteNotification = Schema.Schema.Type<typeof MessageCompleteNotificationSchema>

/**
 * Error notification (not in response to a request)
 */
export const ErrorNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.error"),
  params: Schema.Struct({
    code: Schema.Number,
    message: Schema.String,
    fatal: Schema.optional(Schema.Boolean),
  }),
})

export type ErrorNotification = Schema.Schema.Type<typeof ErrorNotificationSchema>

/**
 * Context compaction started notification
 */
export const CompactingNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("chat.compacting"),
  params: Schema.Struct({
    messageId: Schema.String,
    phase: Schema.Union(
      Schema.Literal("start"),
      Schema.Literal("done")
    ),
    messagesCompacted: Schema.optional(Schema.Number),
  }),
})

export type CompactingNotification = Schema.Schema.Type<typeof CompactingNotificationSchema>

/**
 * Session resumed notification (after reconnect)
 */
export const SessionResumedNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("session.resumed"),
  params: Schema.Struct({
    sessionId: Schema.String,
    messageCount: Schema.Number,
  }),
})

export type SessionResumedNotification = Schema.Schema.Type<typeof SessionResumedNotificationSchema>

/**
 * Character pose change notification (agent → client)
 */
export const PoseChangeNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("character.pose_change"),
  params: Schema.Struct({
    pose: AgentPoseSchema,
  }),
})

export type PoseChangeNotification = Schema.Schema.Type<typeof PoseChangeNotificationSchema>

/**
 * Canvas state patch notification (agent canvas tool mutation)
 */
export const CanvasStatePatchNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("canvas.state_patch"),
  params: CanvasStatePatchSchema,
})

export type CanvasStatePatchNotification = Schema.Schema.Type<typeof CanvasStatePatchNotificationSchema>

/**
 * Canvas state snapshot notification (session restore/reconnect)
 */
export const CanvasStateSnapshotNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("canvas.state_snapshot"),
  params: CanvasStateSnapshotSchema,
})

export type CanvasStateSnapshotNotification = Schema.Schema.Type<typeof CanvasStateSnapshotNotificationSchema>

/**
 * Soul stage change notification (soul evolution event)
 */
export const SoulStageChangeNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("soul.stage_change"),
  params: SoulStageChangePayloadSchema,
})

export type SoulStageChangeNotification = Schema.Schema.Type<typeof SoulStageChangeNotificationSchema>

/**
 * Soul state snapshot notification (session restore/reconnect)
 */
export const SoulStateSnapshotNotificationSchema = Schema.Struct({
  jsonrpc: JsonRpcVersionSchema,
  method: Schema.Literal("soul.state_snapshot"),
  params: SoulStateSnapshotPayloadSchema,
})

export type SoulStateSnapshotNotification = Schema.Schema.Type<typeof SoulStateSnapshotNotificationSchema>

/**
 * Union of all server notifications
 */
export const ServerNotificationSchema = Schema.Union(
  TypingStartNotificationSchema,
  TypingStopNotificationSchema,
  TextDeltaNotificationSchema,
  ToolStartNotificationSchema,
  ToolEndNotificationSchema,
  MessageCompleteNotificationSchema,
  ErrorNotificationSchema,
  CompactingNotificationSchema,
  SessionResumedNotificationSchema,
  PoseChangeNotificationSchema,
  CanvasStatePatchNotificationSchema,
  CanvasStateSnapshotNotificationSchema,
  SoulStageChangeNotificationSchema,
  SoulStateSnapshotNotificationSchema
)

export type ServerNotification = Schema.Schema.Type<typeof ServerNotificationSchema>

/**
 * Union of all server messages (responses + notifications)
 */
export const ServerMessageSchema = Schema.Union(
  JsonRpcSuccessResponseSchema,
  JsonRpcErrorResponseSchema,
  ServerNotificationSchema
)

export type ServerMessage = Schema.Schema.Type<typeof ServerMessageSchema>

// ============================================================================
// Session Types (for server-side session management)
// ============================================================================

/**
 * Tool call data stored in session
 */
export const SessionToolCallSchema = Schema.Struct({
  toolCallId: Schema.String,
  toolName: Schema.String,
  arguments: StringKeyedMap,
  result: Schema.optional(ToolExecutionResultSchema),
  startedAt: Schema.Number,
  completedAt: Schema.optional(Schema.Number),
})

export type SessionToolCall = Schema.Schema.Type<typeof SessionToolCallSchema>

/**
 * Chat session state stored on server
 */
export const ChatSessionSchema = Schema.Struct({
  sessionId: Schema.String,
  connectedAt: Schema.Number,
  lastActivity: Schema.Number,
  messages: Schema.Array(ChatMessageSchema),
  activeMessageId: Schema.NullOr(Schema.String),
  isStreaming: Schema.Boolean,
  disconnectedAt: Schema.NullOr(Schema.Number),
})

export type ChatSession = Schema.Schema.Type<typeof ChatSessionSchema>

// ============================================================================
// WebSocket Errors (Tagged Error Types for Effect)
// ============================================================================

/**
 * Error when session is not found
 */
export class SessionNotFoundError extends Data.TaggedError("SessionNotFoundError")<{
  readonly sessionId: string
}> {}

/**
 * Error when WebSocket message is invalid
 */
export class InvalidMessageError extends Data.TaggedError("InvalidMessageError")<{
  readonly reason: string
}> {}

/**
 * Error when session has expired (past grace period)
 */
export class SessionExpiredError extends Data.TaggedError("SessionExpiredError")<{
  readonly sessionId: string
}> {}

/**
 * Union of WebSocket-related errors
 */
export type WebSocketError =
  | SessionNotFoundError
  | InvalidMessageError
  | SessionExpiredError

// ============================================================================
// JSON-RPC Error Codes
// ============================================================================

export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom error codes (application-specific)
  SESSION_NOT_FOUND: -32000,
  SESSION_EXPIRED: -32001,
  RATE_LIMITED: -32002,
  AGENT_ERROR: -32003,
} as const
