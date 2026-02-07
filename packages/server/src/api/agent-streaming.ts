import type { ChatMessage, AgentStreamEvent } from "@bibboy/shared"
import { createAgentServiceLive } from "../services/AgentService"
import { checkRateLimit, getRateLimitHeaders, streamRateLimiter } from "./rate-limiter"
import { validateAgentRequest, validationErrorResponse } from "./input-validation"
import { getGlobalConfig, hasGeminiApiKey } from "../config"
import { createResponsesStreamEmitter } from "../services/ResponsesStreamEmitter"
import { agentConfig } from "../agents/AgentConfig"
import { createToolRegistry } from "../tools"

// Load config at module level
const appConfig = getGlobalConfig()

// ============================================================================
// Agent Streaming Handler (SSE)
// ============================================================================

/**
 * Handle streaming agent request with SSE (Server-Sent Events).
 * This handler remains manual because HttpApi doesn't support streaming responses.
 *
 * Emits tool execution events and text deltas.
 * Includes IP-based rate limiting to prevent abuse.
 */
export async function handleAgentStream(request: Request): Promise<Response> {
  // Apply rate limiting (stricter for streaming)
  const rateLimitResponse = checkRateLimit(request, streamRateLimiter)
  if (rateLimitResponse) return rateLimitResponse

  if (!hasGeminiApiKey(appConfig)) {
    return new Response(
      JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  try {
    const rawBody = await request.json()

    // Validate and sanitize input
    const validation = validateAgentRequest(rawBody)
    if (!validation.success) {
      return validationErrorResponse(validation.error)
    }

    const { message, agentId, history, enableTools } = validation.data

    // Create agent service with session history and optional agent ID
    const agentService = createAgentServiceLive(() => history as ChatMessage[], agentId)

    // Create SSE stream
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const resolvedAgentId = agentId ?? agentConfig.getDefaultAgentId()
          const resolvedAgent =
            agentConfig.getAgent(resolvedAgentId) ??
            agentConfig.getAgent(agentConfig.getDefaultAgentId())
          const model = resolvedAgent?.model.primary ?? "gemini-3-flash-preview"
          const toolRegistry = resolvedAgent
            ? createToolRegistry(resolvedAgent, () => history as ChatMessage[])
            : null
          const toolDefs = toolRegistry?.getDefinitions() ?? []
          const enabledToolDefs = enableTools === false ? [] : toolDefs
          const toolChoice = enabledToolDefs.length > 0 ? ("auto" as const) : ("none" as const)

          const emitEvent = (event: unknown) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
          }

          const emitter = createResponsesStreamEmitter({
            model,
            emit: emitEvent,
            responseExtras: {
              tool_choice: toolChoice,
              tools: enabledToolDefs.length > 0 ? enabledToolDefs : undefined,
            },
          })

          emitter.start()

          const { Effect, Stream } = await import("effect")
          const streamEffect = agentService.runStream({
            message,
            agentId,
            history: history as ChatMessage[],
            enableTools,
          })

          await Effect.runPromise(
            Stream.runForEach(streamEffect, (event: AgentStreamEvent) =>
              Effect.sync(() => {
                switch (event.type) {
                  case "text_delta":
                    emitter.addTextDelta(event.delta)
                    break
                  case "tool_start":
                    emitter.addToolCall(event.toolCallId, event.toolName, event.arguments)
                    break
                  case "tool_end":
                    emitter.addToolResult(event.toolCallId, event.toolName, event.result)
                    break
                  case "done":
                    emitter.complete("completed")
                    break
                  case "error":
                    emitter.fail(event.error)
                    break
                }
              })
            )
          )

          controller.close()
        } catch (error) {
          const errorEvent = {
            type: "error",
            error: {
              code: "api_error",
              message: error instanceof Error ? error.message : "Unknown error",
            },
            sequence_number: 1,
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
          controller.close()
        }
      },
    })

    const rateLimitHeaders = getRateLimitHeaders(request, streamRateLimiter)
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        ...rateLimitHeaders,
      },
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
