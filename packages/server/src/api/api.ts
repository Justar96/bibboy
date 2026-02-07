import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
} from "@effect/platform"
import { Schema } from "effect"
import {
  HealthResponseSchema,
  ErrorResponseSchema,
  // Agent-related schemas
  AgentListResponseSchema,
  SuggestionsResponseSchema,
  WorkspaceFilesResponseSchema,
  WorkspaceFileResponseSchema,
  AgentRequestSchema,
  AgentResponseSchema,
  ApiKeyNotConfiguredErrorSchema,
  ValidationErrorSchema,
  FileNotFoundErrorSchema,
  RateLimitErrorSchema,
} from "@bibboy/shared"

// ============================================================================
// API Endpoints
// ============================================================================

/**
 * Health check endpoint at /api/health
 */
const healthEndpoint = HttpApiEndpoint.get("health", "/api/health")
  .addSuccess(HealthResponseSchema)

/**
 * OpenAPI documentation endpoint at /api/docs
 */
const docsEndpoint = HttpApiEndpoint.get("docs", "/api/docs")
  .addSuccess(Schema.Unknown)

// ============================================================================
// Agent Endpoints
// ============================================================================

/**
 * List available agents endpoint at /api/agents
 */
const agentsEndpoint = HttpApiEndpoint.get("agents", "/api/agents")
  .addSuccess(AgentListResponseSchema)

/**
 * Get prompt suggestions endpoint at /api/suggestions
 */
const suggestionsEndpoint = HttpApiEndpoint.get("suggestions", "/api/suggestions")
  .addSuccess(SuggestionsResponseSchema)

/**
 * Non-streaming agent run endpoint at /api/agent
 */
const agentRunEndpoint = HttpApiEndpoint.post("agentRun", "/api/agent")
  .setPayload(AgentRequestSchema)
  .addSuccess(AgentResponseSchema)
  .addError(ApiKeyNotConfiguredErrorSchema, { status: 500 })
  .addError(ValidationErrorSchema, { status: 400 })
  .addError(RateLimitErrorSchema, { status: 429 })

// ============================================================================
// Workspace Endpoints
// ============================================================================

/**
 * List workspace files endpoint at /api/workspace/files
 */
const workspaceFilesEndpoint = HttpApiEndpoint.get("workspaceFiles", "/api/workspace/files")
  .setUrlParams(Schema.Struct({
    agentId: Schema.optional(Schema.String),
  }))
  .addSuccess(WorkspaceFilesResponseSchema)
  .addError(ValidationErrorSchema, { status: 400 })

/**
 * Get single workspace file endpoint at /api/workspace/file
 */
const workspaceFileEndpoint = HttpApiEndpoint.get("workspaceFile", "/api/workspace/file")
  .setUrlParams(Schema.Struct({
    agentId: Schema.optional(Schema.String),
    filename: Schema.optional(Schema.String),
  }))
  .addSuccess(WorkspaceFileResponseSchema)
  .addError(ValidationErrorSchema, { status: 400 })
  .addError(FileNotFoundErrorSchema, { status: 404 })

// ============================================================================
// API Group
// ============================================================================

/**
 * API group containing all endpoints
 * Note: Streaming endpoint (/api/agent/stream) is handled separately
 * in agent-streaming.ts with custom SSE streaming since HttpApi
 * doesn't support streaming responses.
 */
export const apiGroup = HttpApiGroup.make("api")
  .add(healthEndpoint)
  .add(docsEndpoint)
  // Agent endpoints
  .add(agentsEndpoint)
  .add(suggestionsEndpoint)
  .add(agentRunEndpoint)
  // Workspace endpoints
  .add(workspaceFilesEndpoint)
  .add(workspaceFileEndpoint)

// ============================================================================
// API Definition
// ============================================================================

/**
 * The complete API definition
 */
export const api = HttpApi.make("bibboy-api")
  .add(apiGroup)
  .addError(ErrorResponseSchema)
