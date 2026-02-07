import { HttpApiBuilder, HttpServerRequest, OpenApi } from "@effect/platform"
import { Effect } from "effect"
import { api } from "./api"
import { AgentService, listAvailableAgents } from "../services/AgentService"
import { listWorkspaceFiles, readWorkspaceFile, initializeWorkspace } from "../workspace"
import { getGlobalConfig, hasGeminiApiKey, getGeminiApiKeyValue } from "../config"
import { chatRateLimiter } from "./rate-limiter"
import {
  ApiKeyNotConfiguredError,
  ValidationError,
  FileNotFoundError,
  RateLimitError,
} from "@bibboy/shared"
import {
  extractSuggestionPayloadFromGemini,
  parseSuggestionsArray,
} from "./suggestions-helpers"

// ============================================================================
// API Handlers Implementation
// ============================================================================

/**
 * Implementation of all API group handlers
 * Note: Agent endpoints are handled separately in agent-streaming.ts
 */
export const apiGroupLive = HttpApiBuilder.group(api, "api", (handlers) =>
  handlers
    // Health endpoint handler
    .handle("health", () =>
      Effect.succeed({
        status: "ok" as const,
        timestamp: new Date().toISOString(),
      })
    )
    // OpenAPI docs endpoint handler
    .handle("docs", () =>
      Effect.succeed(OpenApi.fromApi(api))
    )
    // ========================================================================
    // Agent Handlers
    // ========================================================================
    // List available agents
    .handle("agents", () =>
      Effect.sync(() => {
        const agents = listAvailableAgents()
        return { agents }
      })
    )
    // Get prompt suggestions
    .handle("suggestions", () =>
      Effect.gen(function* () {
        const appConfig = getGlobalConfig()
        const apiKey = getGeminiApiKeyValue(appConfig)

        const fallbackSuggestions = [
          "Tell me about yourself",
          "What do you do?",
          "What's your background?",
        ]

        if (!apiKey) {
          // Return fallback suggestions when no API key
          return { suggestions: fallbackSuggestions }
        }

        // Try to generate dynamic suggestions via Gemini, fallback on any error
        const result = yield* Effect.tryPromise({
          try: async () => {
            // Load SOUL.md for context
            await initializeWorkspace("default")
            const soulFile = await readWorkspaceFile("default", "SOUL.md")
            const soulContent = soulFile?.content ?? ""

            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [
                        {
                          text: `You are helping generate conversation starters for a soul companion chat. Based on the persona below, generate 3 short, interesting questions a visitor might ask. Keep each under 40 characters. Return ONLY a JSON array of strings, no explanation.

Persona:
${soulContent.slice(0, 1500)}

Generate 3 unique conversation starters.`,
                        },
                      ],
                    },
                  ],
                  generationConfig: {
                    maxOutputTokens: 150,
                    responseMimeType: "application/json",
                  },
                }),
              }
            )

            if (!response.ok) {
              throw new Error("Gemini API error")
            }

            const data: unknown = await response.json()
            const content = extractSuggestionPayloadFromGemini(data)
            if (!content) {
              throw new Error("Unexpected Gemini suggestion response shape")
            }

            const parsed = parseSuggestionsArray(content)
            if (!parsed) {
              throw new Error("Unexpected Gemini suggestion payload")
            }

            return { suggestions: parsed.slice(0, 3) }
          },
          catch: () => ({ suggestions: fallbackSuggestions }),
        }).pipe(
          // Convert error to success with fallback
          Effect.catchAll(() => Effect.succeed({ suggestions: fallbackSuggestions }))
        )

        return result
      })
    )
    // Non-streaming agent run
    .handle("agentRun", ({ payload }) =>
      Effect.gen(function* () {
        // Apply rate limiting by extracting client IP from request headers
        const serverRequest = yield* HttpServerRequest.HttpServerRequest
        const headers = serverRequest.headers

        // Extract client IP (same logic as rate-limiter.ts)
        const clientIP =
          headers["cf-connecting-ip"] ||
          (headers["x-forwarded-for"]?.split(",")[0]?.trim()) ||
          headers["x-real-ip"] ||
          "unknown"

        const rateLimitResult = chatRateLimiter.check(clientIP)
        if (!rateLimitResult.allowed) {
          return yield* Effect.fail(
            new RateLimitError({ retryAfter: rateLimitResult.retryAfter })
          )
        }

        const appConfig = getGlobalConfig()

        // Check for API key
        if (!hasGeminiApiKey(appConfig)) {
          return yield* Effect.fail(
            new ApiKeyNotConfiguredError({ provider: "gemini" })
          )
        }

        // Validate request
        const { message, agentId, history, enableTools } = payload

        if (!message || message.trim().length === 0) {
          return yield* Effect.fail(
            new ValidationError({ error: "Message cannot be empty" })
          )
        }

        // Run agent
        const agentService = yield* AgentService
        const result = yield* agentService.run({
          message,
          agentId,
          history,
          enableTools,
        }).pipe(
          // Convert agent service errors to API errors
          Effect.catchTag("ApiKeyNotConfiguredError", (e) =>
            Effect.fail(new ApiKeyNotConfiguredError({ provider: e.provider }))
          ),
          Effect.catchAll((e) =>
            Effect.fail(new ValidationError({ error: e._tag === "AgentError" ? e.reason : String(e) }))
          )
        )

        return result
      }).pipe(Effect.provide(AgentService.Default))
    )
    // ========================================================================
    // Workspace Handlers
    // ========================================================================
    // List workspace files
    .handle("workspaceFiles", ({ urlParams }) =>
      Effect.gen(function* () {
        const rawAgentId = urlParams.agentId || "default"

        // Validate agent ID
        if (!/^[a-zA-Z0-9_-]+$/.test(rawAgentId) || rawAgentId.length > 100) {
          return yield* Effect.fail(
            new ValidationError({ error: "Invalid agent ID format" })
          )
        }

        const agentId = rawAgentId

        // Ensure workspace is initialized
        yield* Effect.promise(() => initializeWorkspace(agentId))

        const files = yield* Effect.promise(() => listWorkspaceFiles(agentId))

        return { files }
      })
    )
    // Get single workspace file
    .handle("workspaceFile", ({ urlParams }) =>
      Effect.gen(function* () {
        const rawAgentId = urlParams.agentId || "default"
        const rawFilename = urlParams.filename || "SOUL.md"

        // Validate agent ID
        if (!/^[a-zA-Z0-9_-]+$/.test(rawAgentId) || rawAgentId.length > 100) {
          return yield* Effect.fail(
            new ValidationError({ error: "Invalid agent ID format" })
          )
        }
        const agentId = rawAgentId

        // Validate filename to prevent path traversal
        const sanitizedFilename = rawFilename.trim()

        if (
          sanitizedFilename.includes("..") ||
          sanitizedFilename.includes("/") ||
          sanitizedFilename.includes("\\")
        ) {
          return yield* Effect.fail(
            new ValidationError({
              error: "Invalid filename: path traversal not allowed",
            })
          )
        }

        if (sanitizedFilename.length > 255) {
          return yield* Effect.fail(
            new ValidationError({ error: "Filename too long" })
          )
        }

        if (!/\.[a-zA-Z0-9]+$/.test(sanitizedFilename)) {
          return yield* Effect.fail(
            new ValidationError({
              error: "Invalid filename: must have extension",
            })
          )
        }

        const filename = sanitizedFilename

        // Ensure workspace is initialized
        yield* Effect.promise(() => initializeWorkspace(agentId))

        const file = yield* Effect.promise(() =>
          readWorkspaceFile(agentId, filename)
        )

        if (!file) {
          return yield* Effect.fail(
            new FileNotFoundError({ filename })
          )
        }

        return { file }
      })
    )
)
