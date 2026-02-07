import { Effect, Stream, pipe, Schedule, Duration, Ref } from "effect"
import type {
  AgentRequest,
  AgentResponse,
  AgentPose,
  CharacterState,
  ChatMessage,
  ToolCall,
  ToolExecutionResult,
  AgentStreamEvent,
  AgentServiceError,
} from "@bibboy/shared"
import {
  AgentError,
  ToolError,
  ApiKeyNotConfiguredError,
  RateLimitExceededError,
  ContextOverflowError,
  ApiTimeoutError,
  ServiceOverloadedError,
  AuthenticationError,
  BillingError,
} from "@bibboy/shared"
import {
  createGeminiResponse,
  streamGemini,
  chatMessagesToGeminiContents,
  GEMINI_DEFAULT_MODEL,
  type GeminiContent,
  type GeminiFunctionDeclaration,
} from "@bibboy/agent-runtime"
import {
  createToolRegistry,
  type ToolRegistry,
  type FunctionToolDefinition,
  type CanvasToolRuntime,
} from "../tools"
import type { SoulToolRuntime } from "./SoulStateService"
import {
  agentConfig,
  initializeAgentConfig,
  type ResolvedAgentConfig,
} from "../agents/AgentConfig"
import { buildAgentSystemPrompt } from "../agents/SystemPromptBuilder"
import { loadContextFiles, initializeWorkspace, getWorkspaceDir } from "../workspace"
import {
  isContextOverflowError,
  isRateLimitError,
  isAuthError,
  isBillingError,
  isTimeoutError,
  isOverloadedError,
} from "../agents/agent-errors"
import { getGlobalConfig, getGeminiApiKeyValue, hasGeminiApiKey } from "../config"
import { extractAgentErrorMessage } from "./error-utils"
import { sanitizeAssistantOutput } from "../text"
import { compactToolResult } from "../tools/tool-result-store"

// Load config and initialize agent config on module load
const appConfig = getGlobalConfig()
initializeAgentConfig()

// ============================================================================
// Constants
// ============================================================================

const MAX_TOOL_ITERATIONS = 10
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_HISTORY_TURN_LIMIT = 15

// ============================================================================
// Helper Functions
// ============================================================================

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Limit conversation history to the last N user turns (and their associated
 * assistant responses). Keeps complete exchanges intact rather than cutting
 * mid-conversation. Preserves system messages (e.g. compaction summaries)
 * which are always kept at the front. Adapted from OpenClaw's limitHistoryTurns.
 */
function limitHistoryTurns(
  messages: readonly ChatMessage[],
  limit: number = DEFAULT_HISTORY_TURN_LIMIT
): ChatMessage[] {
  if (limit <= 0 || messages.length === 0) {
    return [...messages]
  }

  // Separate system messages (summaries) from conversational messages
  const systemMessages = messages.filter((m) => m.role === "system")
  const conversationMessages = messages.filter((m) => m.role !== "system")

  let userCount = 0
  let cutIndex = 0

  for (let i = conversationMessages.length - 1; i >= 0; i--) {
    if (conversationMessages[i].role === "user") {
      userCount++
      if (userCount > limit) {
        cutIndex = i + 1
        break
      }
    }
  }

  const trimmedConversation = conversationMessages.slice(cutIndex)

  // Prepend system messages (summaries) before conversation
  return [...systemMessages, ...trimmedConversation] as ChatMessage[]
}

function resolveAgentFromRequest(request: AgentRequest): ResolvedAgentConfig {
  const agentId = (request as { agentId?: string }).agentId
  if (agentId) {
    const resolved = agentConfig.getAgent(agentId)
    if (resolved) return resolved
  }

  const defaultId = agentConfig.getDefaultAgentId()
  const defaultResolved = agentConfig.getAgent(defaultId)
  if (defaultResolved) return defaultResolved

  return {
    id: "default",
    name: "Assistant",
    model: { primary: GEMINI_DEFAULT_MODEL, fallbacks: [] },
    memorySearch: {
      enabled: true,
      sources: ["memory"],
      extraPaths: [],
      provider: "gemini",
      remote: undefined,
      experimental: { sessionMemory: false },
      fallback: "none",
      model: "gemini-embedding-001",
      local: {},
      store: {
        driver: "sqlite",
        path: `${appConfig.homeDir}/.portfolio/state/memory/default.sqlite`,
        vector: { enabled: true },
      },
      chunking: { tokens: 400, overlap: 80 },
      sync: {
        onSessionStart: true,
        onSearch: true,
        watch: true,
        watchDebounceMs: 1500,
        intervalMinutes: 0,
        sessions: { deltaBytes: 100000, deltaMessages: 50 },
      },
      query: {
        maxResults: 6,
        minScore: 0.35,
        hybrid: {
          enabled: true,
          vectorWeight: 0.7,
          textWeight: 0.3,
          candidateMultiplier: 4,
        },
      },
      cache: { enabled: true },
    },
    tools: { profile: null, allow: [], alsoAllow: [], deny: [], byProvider: {} },
    thinkingLevel: "off",
    timeFormat: "auto",
  }
}

// Removed: crude char-budget approach replaced by ConversationMemory token management

/**
 * Convert function tool definitions to Gemini function declarations.
 */
function toGeminiFunctionDeclarations(
  tools: FunctionToolDefinition[]
): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as Record<string, unknown>,
  }))
}

async function buildGeminiInput(
  agent: ResolvedAgentConfig,
  history: readonly ChatMessage[],
  userMessage: string,
  toolRegistry: ToolRegistry,
  _hasTools: boolean,
  characterState?: CharacterState
): Promise<{ systemInstruction: string; contents: GeminiContent[] }> {
  await initializeWorkspace(agent.id)
  const contextFiles = await loadContextFiles(agent.id)
  const workspaceDir = getWorkspaceDir(agent.id)

  const systemPrompt = buildAgentSystemPrompt({
    agentConfig: agent,
    toolRegistry,
    workspaceDir,
    contextFiles,
    runtimeInfo: {
      agentId: agent.id,
      model: agent.model.primary,
    },
    characterState,
  })

  // Use turn-based limiting (keeps complete exchanges + system summaries)
  const historyLimited = limitHistoryTurns(history)
  const allMessages = [
    ...historyLimited,
    { role: "user" as const, content: userMessage },
  ]

  const contents = chatMessagesToGeminiContents(allMessages)

  // Ensure starts with user turn (Gemini requirement)
  if (contents.length > 0 && contents[0].role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(conversation context)" }] })
  }

  return { systemInstruction: systemPrompt, contents }
}

// ============================================================================
// Error Classification
// ============================================================================

function classifyToTaggedError(error: unknown, model: string): AgentServiceError {
  const message = extractAgentErrorMessage(error)

  if (isContextOverflowError(message)) return new ContextOverflowError({ model })
  if (isRateLimitError(message)) return new RateLimitExceededError({ retryAfterMs: 30000 })
  if (isAuthError(message)) return new AuthenticationError({ reason: message })
  if (isBillingError(message)) return new BillingError({ reason: message })
  if (isTimeoutError(message)) return new ApiTimeoutError({ timeoutMs: DEFAULT_TIMEOUT_MS })
  if (isOverloadedError(message)) return new ServiceOverloadedError({ retryAfterMs: 10000 })

  return new AgentError({ reason: message })
}

function isRetryableError(error: AgentServiceError): boolean {
  return (
    error._tag === "RateLimitExceededError" ||
    error._tag === "ApiTimeoutError" ||
    error._tag === "ServiceOverloadedError" ||
    error._tag === "AgentError"
  )
}

// ============================================================================
// Retry Schedule
// ============================================================================

const createRetrySchedule = () =>
  pipe(
    Schedule.exponential(Duration.seconds(2), 2),
    Schedule.jittered,
    Schedule.intersect(Schedule.recurs(3)),
    Schedule.whileInput((error: AgentServiceError) => isRetryableError(error))
  )

// ============================================================================
// Gemini API Effects
// ============================================================================

const getApiKey = Effect.gen(function* () {
  if (!hasGeminiApiKey(appConfig)) {
    return yield* Effect.fail(new ApiKeyNotConfiguredError({ provider: "gemini" }))
  }
  return getGeminiApiKeyValue(appConfig) as string
})

const callGemini = (
  contents: GeminiContent[],
  systemInstruction: string,
  tools: GeminiFunctionDeclaration[],
  apiKey: string,
  model: string
): Effect.Effect<
  {
    text: string
    functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  },
  AgentServiceError
> =>
  pipe(
    createGeminiResponse({
      apiKey,
      model,
      contents,
      systemInstruction,
      tools: tools.length > 0 ? tools : undefined,
      toolConfig: tools.length > 0 ? "auto" : "none",
      maxOutputTokens: 8192,
    }),
    Effect.catchAll((error) => Effect.fail(classifyToTaggedError(error, model))),
    Effect.timeout(Duration.millis(DEFAULT_TIMEOUT_MS)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new ApiTimeoutError({ timeoutMs: DEFAULT_TIMEOUT_MS }))
    )
  )

const callGeminiWithRetry = (
  contents: GeminiContent[],
  systemInstruction: string,
  tools: GeminiFunctionDeclaration[],
  apiKey: string,
  model: string,
  fallbackModels: string[]
): Effect.Effect<
  {
    text: string
    functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>
    usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
    modelUsed: string
  },
  AgentServiceError
> =>
  Effect.gen(function* () {
    const allModels = [model, ...fallbackModels]
    const modelIndexRef = yield* Ref.make(0)

    const tryWithModel = Effect.gen(function* () {
      const modelIndex = yield* Ref.get(modelIndexRef)
      const currentModel = allModels[modelIndex] ?? model

      return yield* pipe(
        callGemini(contents, systemInstruction, tools, apiKey, currentModel),
        Effect.map((response) => ({ ...response, modelUsed: currentModel })),
        Effect.catchTag("ContextOverflowError", (error) =>
          Effect.gen(function* () {
            if (modelIndex < allModels.length - 1) {
              yield* Ref.update(modelIndexRef, (i) => i + 1)
            }
            return yield* Effect.fail(error as AgentServiceError)
          })
        )
      )
    })

    const retrySchedule = createRetrySchedule()
    return yield* pipe(tryWithModel, Effect.retry(retrySchedule))
  })

// ============================================================================
// Tool Execution
// ============================================================================

const executeTool = (
  toolRegistry: ToolRegistry,
  tc: { id: string; name: string; args: Record<string, unknown> }
): Effect.Effect<ToolExecutionResult, never> =>
  Effect.gen(function* () {
    const tool = toolRegistry.get(tc.name)

    if (!tool) {
      return {
        toolCallId: tc.id,
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown tool: ${tc.name}` }) }],
        error: `Unknown tool: ${tc.name}`,
      }
    }

    const result = yield* Effect.tryPromise({
      try: async () => tool.execute(tc.id, tc.args),
      catch: (error) =>
        new ToolError({
          toolName: tc.name,
          reason: error instanceof Error ? error.message : "Unknown error",
        }),
    }).pipe(
      Effect.catchAll((toolError) =>
        Effect.succeed({
          toolCallId: tc.id,
          content: [{ type: "text" as const, text: JSON.stringify({ error: toolError.reason }) }],
          error: toolError.reason,
        })
      )
    )

    return { ...result, toolCallId: tc.id }
  })

const executeTools = (
  toolRegistry: ToolRegistry,
  toolCalls: Array<{ id: string; name: string; args: Record<string, unknown> }>
): Effect.Effect<ToolExecutionResult[], never> =>
  Effect.forEach(toolCalls, (tc) => executeTool(toolRegistry, tc), {
    concurrency: "unbounded",
  })

// ============================================================================
// Non-Streaming Agent
// ============================================================================

const runAgent = (
  request: AgentRequest,
  agentConfigResolved: ResolvedAgentConfig,
  toolRegistry: ToolRegistry,
  characterState?: CharacterState
): Effect.Effect<AgentResponse, AgentServiceError> =>
  Effect.gen(function* () {
    const apiKey = yield* getApiKey

    const history = [...(request.history ?? [])]
    const enableTools = request.enableTools !== false
    const model = agentConfigResolved.model.primary
    const fallbackModels = agentConfigResolved.model.fallbacks ?? []

    const { systemInstruction, contents: initialContents } = yield* Effect.tryPromise({
      try: () =>
        buildGeminiInput(agentConfigResolved, history, request.message, toolRegistry, enableTools, characterState),
      catch: (error) => new AgentError({ reason: `Failed to build messages: ${error}` }),
    })

    const toolDefs = enableTools ? toGeminiFunctionDeclarations(toolRegistry.getDefinitions()) : []

    const allToolCalls: ToolCall[] = []
    const allToolResults: ToolExecutionResult[] = []
    let finalContent = ""
    const currentContents = [...initialContents]

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const apiResult = yield* pipe(
        callGeminiWithRetry(currentContents, systemInstruction, toolDefs, apiKey, model, fallbackModels),
        Effect.catchTag("ContextOverflowError", () => Effect.succeed(null))
      )

      if (!apiResult) break

      if (apiResult.functionCalls.length > 0) {
        // Add model function call response to conversation
        currentContents.push({
          role: "model",
          parts: apiResult.functionCalls.map((fc) => ({
            functionCall: { name: fc.name, args: fc.args },
            ...(fc.thoughtSignature && { thoughtSignature: fc.thoughtSignature }),
          })),
        })

        const toolCallsWithIds = apiResult.functionCalls.map((fc) => ({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: fc.name,
          args: fc.args,
        }))

        const results = yield* executeTools(toolRegistry, toolCallsWithIds)

        for (let j = 0; j < toolCallsWithIds.length; j++) {
          allToolCalls.push({ id: toolCallsWithIds[j].id, name: toolCallsWithIds[j].name, arguments: toolCallsWithIds[j].args })
          allToolResults.push(results[j])
        }

        // Add function responses as user turn (Gemini format)
        // Compact results to keep context small — full content saved to workspace files
        const compactedParts = yield* Effect.tryPromise({
          try: async () => {
            const parts = []
            for (let k = 0; k < toolCallsWithIds.length; k++) {
              const rawText = results[k].content[0]?.text ?? ""
              const compacted = await compactToolResult(
                toolCallsWithIds[k].name,
                rawText,
                agentConfigResolved.id
              )
              parts.push({
                functionResponse: {
                  name: toolCallsWithIds[k].name,
                  response: { result: compacted },
                },
              })
            }
            return parts
          },
          catch: () => new AgentError({ reason: "Failed to compact tool results" }),
        })

        currentContents.push({
          role: "user",
          parts: compactedParts,
        })
        continue
      }

      finalContent = apiResult.text
      break
    }

    // If all iterations were consumed by tool calls, make one final text-only call
    // so the model can synthesize a response from the gathered tool results
    if (!finalContent && allToolCalls.length > 0) {
      const finalResult = yield* pipe(
        callGeminiWithRetry(currentContents, systemInstruction, [], apiKey, model, fallbackModels),
        Effect.catchTag("ContextOverflowError", () => Effect.succeed(null))
      )
      if (finalResult) {
        finalContent = finalResult.text
      }
    }

    // Sanitize output before returning to user (matching OpenClaw's extractAssistantText pipeline)
    const sanitizedContent = sanitizeAssistantOutput(finalContent)

    return {
      message: {
        id: generateMessageId(),
        role: "assistant" as const,
        content: sanitizedContent,
        timestamp: Date.now(),
      },
      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
      toolResults: allToolResults.length > 0 ? allToolResults : undefined,
    }
  })

// ============================================================================
// Streaming Agent
// ============================================================================

const runAgentStream = (
  request: AgentRequest,
  agentConfigResolved: ResolvedAgentConfig,
  toolRegistry: ToolRegistry,
  characterState?: CharacterState
): Stream.Stream<AgentStreamEvent, AgentServiceError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const apiKey = yield* getApiKey

      const history = [...(request.history ?? [])]
      const enableTools = request.enableTools !== false
      const model = agentConfigResolved.model.primary

      const { systemInstruction, contents: initialContents } = yield* Effect.tryPromise({
        try: () =>
          buildGeminiInput(agentConfigResolved, history, request.message, toolRegistry, enableTools, characterState),
        catch: (error) => new AgentError({ reason: `Failed to build messages: ${error}` }),
      })
      const toolDefs = enableTools ? toGeminiFunctionDeclarations(toolRegistry.getDefinitions()) : []

      const processIteration = (
        currentContents: GeminiContent[],
        iteration: number,
        allToolCalls: ToolCall[],
        fullContent: string
      ): Stream.Stream<AgentStreamEvent, AgentServiceError> => {
        if (iteration >= MAX_TOOL_ITERATIONS) {
          // All iterations consumed by tool calls — make a final text-only call
          // so the model can synthesize a response from the gathered tool results
          if (!fullContent && allToolCalls.length > 0) {
            let finalIterContent = ""
            return pipe(
              streamGemini({
                apiKey,
                model,
                contents: currentContents,
                systemInstruction,
                maxOutputTokens: 8192,
              }).pipe(Stream.mapError((error) => classifyToTaggedError(error, model))),
              Stream.catchTag("ContextOverflowError", () => Stream.empty),
              Stream.mapConcat((event): AgentStreamEvent[] => {
                if (event.type === "text_delta") {
                  finalIterContent += event.delta
                  return [{ type: "text_delta", delta: event.delta }]
                }
                // Skip done and tool events from raw stream
                return []
              }),
              Stream.concat(
                Stream.unwrap(
                  Effect.sync(() =>
                    Stream.succeed<AgentStreamEvent>({
                      type: "done",
                      message: {
                        id: generateMessageId(),
                        role: "assistant",
                        content: sanitizeAssistantOutput(fullContent + finalIterContent),
                        timestamp: Date.now(),
                      },
                      toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
                    })
                  )
                )
              )
            )
          }

          return Stream.succeed<AgentStreamEvent>({
            type: "done",
            message: {
              id: generateMessageId(),
              role: "assistant",
              content: fullContent,
              timestamp: Date.now(),
            },
            toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
          })
        }

        let iterationContent = ""
        const pendingFunctionCalls: Array<{ id: string; name: string; args: Record<string, unknown>; thoughtSignature?: string }> = []

        return pipe(
          streamGemini({
            apiKey,
            model,
            contents: currentContents,
            systemInstruction,
            tools: toolDefs.length > 0 ? toolDefs : undefined,
            toolConfig: toolDefs.length > 0 ? "auto" : "none",
            maxOutputTokens: 8192,
          }).pipe(Stream.mapError((error) => classifyToTaggedError(error, model))),
          Stream.catchTag("ContextOverflowError", () => Stream.empty),
          Stream.mapConcat((event): AgentStreamEvent[] => {
            const events: AgentStreamEvent[] = []

            if (event.type === "text_delta") {
              iterationContent += event.delta
              events.push({ type: "text_delta", delta: event.delta })
            } else if (event.type === "tool_start") {
              pendingFunctionCalls.push({
                id: event.toolCallId,
                name: event.toolName,
                args: event.arguments,
                ...(event.thoughtSignature && { thoughtSignature: event.thoughtSignature }),
              })
              events.push(event)
            } else if (event.type === "error") {
              events.push(event)
            }
            // Skip "done" from the raw stream — we handle it ourselves
            return events
          }),
          Stream.concat(
            Stream.unwrap(
              Effect.gen(function* () {
                if (pendingFunctionCalls.length > 0) {
                  const toolEvents: AgentStreamEvent[] = []
                  const toolResults: ToolExecutionResult[] = []

                  currentContents.push({
                    role: "model" as const,
                    parts: pendingFunctionCalls.map((fc) => ({
                      functionCall: { name: fc.name, args: fc.args },
                      ...(fc.thoughtSignature && { thoughtSignature: fc.thoughtSignature }),
                    })),
                  })

                  for (const tc of pendingFunctionCalls) {
                    const result = yield* executeTool(toolRegistry, tc)

                    toolEvents.push({
                      type: "tool_end",
                      toolCallId: tc.id,
                      toolName: tc.name,
                      result,
                    })

                    toolResults.push(result)
                    allToolCalls.push({ id: tc.id, name: tc.name, arguments: tc.args })
                  }

                  // Compact results to keep context small — full content saved to workspace files
                  const compactedParts = yield* Effect.tryPromise({
                    try: async () => {
                      const parts = []
                      for (let k = 0; k < pendingFunctionCalls.length; k++) {
                        const rawText = toolResults[k].content[0]?.text ?? ""
                        const compacted = await compactToolResult(
                          pendingFunctionCalls[k].name,
                          rawText,
                          agentConfigResolved.id
                        )
                        parts.push({
                          functionResponse: {
                            name: pendingFunctionCalls[k].name,
                            response: { result: compacted },
                          },
                        })
                      }
                      return parts
                    },
                    catch: () => new AgentError({ reason: "Failed to compact tool results" }),
                  })

                  currentContents.push({
                    role: "user" as const,
                    parts: compactedParts,
                  })

                  return Stream.concat(
                    Stream.fromIterable(toolEvents),
                    processIteration(currentContents, iteration + 1, allToolCalls, fullContent + iterationContent)
                  ) as Stream.Stream<AgentStreamEvent, AgentServiceError>
                }

                return Stream.succeed<AgentStreamEvent>({
                  type: "done",
                  message: {
                    id: generateMessageId(),
                    role: "assistant",
                    content: sanitizeAssistantOutput(fullContent + iterationContent),
                    timestamp: Date.now(),
                  },
                  toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
                }) as Stream.Stream<AgentStreamEvent, AgentServiceError>
              }) as Effect.Effect<Stream.Stream<AgentStreamEvent, AgentServiceError>>
            )
          )
        )
      }

      return processIteration(initialContents, 0, [], "")
    })
  )

/**
 * Convert Stream to AsyncGenerator for backwards compatibility.
 */
async function* streamToAsyncGenerator(
  stream: Stream.Stream<AgentStreamEvent, AgentServiceError>
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  const events = await Effect.runPromise(
    pipe(
      stream,
      Stream.runCollect,
      Effect.map((chunk) => [...chunk])
    )
  )

  for (const event of events) {
    yield event
  }
}

// ============================================================================
// AgentService Interface
// ============================================================================

export interface AgentServiceInterface {
  readonly run: (request: AgentRequest) => Effect.Effect<AgentResponse, AgentServiceError>
  readonly runStream: (request: AgentRequest) => Stream.Stream<AgentStreamEvent, AgentServiceError>
  /** @deprecated Use runStream */
  readonly runStreamLegacy?: (request: AgentRequest) => AsyncGenerator<AgentStreamEvent, void, unknown>
}

// ============================================================================
// AgentService (Effect.Service)
// ============================================================================

export class AgentService extends Effect.Service<AgentService>()("AgentService", {
  sync: () => {
    const getSessionMessages = () => [] as ChatMessage[]
    const getResolvedConfig = (request: AgentRequest) => resolveAgentFromRequest(request)

    return {
      run: (request: AgentRequest): Effect.Effect<AgentResponse, AgentServiceError> => {
        const resolvedConfig = getResolvedConfig(request)
        const toolRegistry = createToolRegistry(resolvedConfig, getSessionMessages)
        return runAgent(request, resolvedConfig, toolRegistry)
      },

      runStream: (request: AgentRequest): Stream.Stream<AgentStreamEvent, AgentServiceError> => {
        const resolvedConfig = getResolvedConfig(request)
        const toolRegistry = createToolRegistry(resolvedConfig, getSessionMessages)
        return runAgentStream(request, resolvedConfig, toolRegistry)
      },

      runStreamLegacy: (request: AgentRequest): AsyncGenerator<AgentStreamEvent, void, unknown> => {
        const resolvedConfig = getResolvedConfig(request)
        const toolRegistry = createToolRegistry(resolvedConfig, getSessionMessages)
        return streamToAsyncGenerator(runAgentStream(request, resolvedConfig, toolRegistry))
      },
    } satisfies AgentServiceInterface
  },
}) {}

// ============================================================================
// Session-Scoped Factory
// ============================================================================

export function createAgentServiceLive(
  getSessionMessages: () => ChatMessage[],
  agentId?: string,
  characterState?: CharacterState,
  sendPoseChange?: (pose: AgentPose) => void,
  canvasRuntime?: CanvasToolRuntime,
  soulRuntime?: SoulToolRuntime
): AgentServiceInterface {
  const getResolvedConfig = (request: AgentRequest) =>
    agentId
      ? agentConfig.getAgent(agentId) ?? resolveAgentFromRequest(request)
      : resolveAgentFromRequest(request)

  return {
    run: (request: AgentRequest) => {
      const resolvedConfig = getResolvedConfig(request)
      const toolRegistry = createToolRegistry(
        resolvedConfig,
        getSessionMessages,
        sendPoseChange,
        canvasRuntime,
        soulRuntime
      )
      return runAgent(request, resolvedConfig, toolRegistry, characterState)
    },
    runStream: (request: AgentRequest) => {
      const resolvedConfig = getResolvedConfig(request)
      const toolRegistry = createToolRegistry(
        resolvedConfig,
        getSessionMessages,
        sendPoseChange,
        canvasRuntime,
        soulRuntime
      )
      return runAgentStream(request, resolvedConfig, toolRegistry, characterState)
    },
    runStreamLegacy: (request: AgentRequest) => {
      const resolvedConfig = getResolvedConfig(request)
      const toolRegistry = createToolRegistry(
        resolvedConfig,
        getSessionMessages,
        sendPoseChange,
        canvasRuntime,
        soulRuntime
      )
      return streamToAsyncGenerator(runAgentStream(request, resolvedConfig, toolRegistry, characterState))
    },
  }
}

export const AgentServiceLive = AgentService.Default

export function listAvailableAgents(): Array<{ id: string; name: string }> {
  const ids = agentConfig.listAgentIds()
  return ids.map((id) => {
    const agent = agentConfig.getAgent(id)
    return { id, name: agent?.name ?? id }
  })
}
