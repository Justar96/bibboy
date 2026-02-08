import { Effect, Stream, pipe } from "effect"
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
import { AgentError } from "@bibboy/shared"
import {
  GEMINI_DEFAULT_MODEL,
} from "@bibboy/agent-runtime"
import {
  createToolRegistry,
  type ToolRegistry,
  type CanvasToolRuntime,
  type ToolExecutionContext,
  createToolExecutionMetrics,
} from "../tools"
import {
  agentConfig,
  initializeAgentConfig,
  getThinkingBudget,
  type ResolvedAgentConfig,
} from "../agents/AgentConfig"
import { getGlobalConfig } from "../config"
import { sanitizeAssistantOutput } from "../text"
import {
  addTokenUsage,
  buildFinalSynthesisInstruction,
  buildGeminiInput,
  buildToolBudgetSystemInstruction,
  generateMessageId,
  streamToAsyncGenerator,
} from "./agent-service-helpers"
import {
  callGeminiWithRetry,
  getApiKey,
} from "./agent-service-gemini"
import {
  compactFunctionResponses,
  executeTools,
  toGeminiFunctionDeclarations,
} from "./agent-service-tool-execution"
import { orchestrateAgentStreamIterations } from "./agent-service-stream-orchestrator"
import { createToolResultGuard, repairTranscript } from "../tools/tool-result-guard"

// Load config and initialize agent config on module load
const appConfig = getGlobalConfig()
initializeAgentConfig()

// ============================================================================
// Constants
// ============================================================================

const MAX_TOOL_ITERATIONS = 30
const SOFT_LIMIT_ITERATIONS = 20
const MAX_OVERFLOW_COMPACTION_ATTEMPTS = 3
const DEFAULT_TOOL_TIMEOUT_MS = 30_000

// ============================================================================
// Agent Resolution
// ============================================================================

function resolveAgentFromRequest(request: AgentRequest): ResolvedAgentConfig {
  const { agentId } = request
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
        path: `${appConfig.homeDir}/.bibboy/state/memory/default.sqlite`,
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
    const apiKey = yield* getApiKey(appConfig)

    const history = [...(request.history ?? [])]
    const enableTools = request.enableTools !== false
    const model = agentConfigResolved.model.primary
    const fallbackModels = agentConfigResolved.model.fallbacks ?? []
    const thinkingBudget = getThinkingBudget(agentConfigResolved.thinkingLevel)

    const { systemInstruction, contents: initialContents } = yield* Effect.tryPromise({
      try: () =>
        buildGeminiInput(
          agentConfigResolved,
          history,
          request.message,
          toolRegistry,
          characterState
        ),
      catch: (error) => new AgentError({ reason: `Failed to build messages: ${error}` }),
    })

    const allToolCalls: ToolCall[] = []
    const allToolResults: ToolExecutionResult[] = []
    let finalContent = ""
    const currentContents = [...initialContents]

    // Aggregate token usage across iterations
    const accumulatedUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 }

    // Tool execution context with abort signal + metrics
    const metrics = createToolExecutionMetrics()
    const toolCtx: ToolExecutionContext = { timeoutMs: DEFAULT_TOOL_TIMEOUT_MS, metrics }

    // Tool result guard — tracks pending tool calls and synthesizes missing results
    // Ensures Gemini never sees orphaned function calls without responses
    const toolGuard = createToolResultGuard()

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      // Re-fetch tool defs each iteration (may grow via request_tools)
      const currentToolDefs = enableTools
        ? toGeminiFunctionDeclarations(toolRegistry.getDefinitions())
        : []

      // After soft limit, nudge the model to wrap up with usage context
      const remaining = MAX_TOOL_ITERATIONS - i
      let systemWithBudget = systemInstruction
      if (i >= SOFT_LIMIT_ITERATIONS) {
        systemWithBudget = buildToolBudgetSystemInstruction(
          systemInstruction,
          remaining,
          metrics.getSummary()
        )
      }

      // Context overflow recovery: retry with compaction (OpenClaw pattern)
      let apiResult: {
        text: string
        functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>
        usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
        modelUsed: string
      } | null = null
      let overflowAttempts = 0

      while (overflowAttempts <= MAX_OVERFLOW_COMPACTION_ATTEMPTS) {
        // Repair transcript before sending to Gemini (ensures no orphaned function calls)
        const repairedContents = repairTranscript(currentContents)
        // Update currentContents in-place with repaired version
        currentContents.length = 0
        currentContents.push(...repairedContents)

        const result = yield* pipe(
          callGeminiWithRetry(currentContents, systemWithBudget, currentToolDefs, apiKey, model, fallbackModels, thinkingBudget),
          Effect.map((r) => ({ success: true as const, value: r })),
          Effect.catchTag("ContextOverflowError", () =>
            Effect.succeed({ success: false as const, value: null })
          )
        )

        if (result.success) {
          apiResult = result.value
          break
        }

        overflowAttempts++
        if (overflowAttempts > MAX_OVERFLOW_COMPACTION_ATTEMPTS) break

        // Smarter auto-compact: prefer trimming text turns over tool result turns
        // This preserves tool execution context while reducing conversation bulk
        const trimCount = Math.min(4, Math.floor(currentContents.length / 3))
        if (trimCount > 0 && currentContents.length > 2) {
          // Find removable turns (prefer text-only turns over function response turns)
          let removed = 0
          for (let idx = 0; idx < currentContents.length && removed < trimCount; idx++) {
            const turn = currentContents[idx]
            const hasFunctionParts = turn.parts.some(
              (p) => p.functionCall || p.functionResponse
            )
            if (!hasFunctionParts) {
              currentContents.splice(idx, 1)
              removed++
              idx-- // Re-check same index after splice
            }
          }
          // If we couldn't remove enough text turns, trim from the start
          if (removed < trimCount) {
            const remaining = trimCount - removed
            currentContents.splice(0, Math.min(remaining, currentContents.length - 2))
          }
          // Ensure starts with user turn after trimming
          if (currentContents.length > 0 && currentContents[0].role === "model") {
            currentContents.unshift({ role: "user", parts: [{ text: "(earlier conversation compacted)" }] })
          }
        } else {
          break
        }
      }

      if (!apiResult) break

      // Track usage
      addTokenUsage(accumulatedUsage, apiResult.usage)

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

        // Track pending tool calls in the guard
        toolGuard.trackToolCalls(toolCallsWithIds)

        // Pass iteration context to tool wrappers
        const results = yield* executeTools(toolRegistry, toolCallsWithIds, {
          ...toolCtx,
          iteration: i,
        })

        // Mark all tool calls as resolved
        for (const tc of toolCallsWithIds) {
          toolGuard.markResolved(tc.id)
        }

        for (let j = 0; j < toolCallsWithIds.length; j++) {
          allToolCalls.push({ id: toolCallsWithIds[j].id, name: toolCallsWithIds[j].name, arguments: toolCallsWithIds[j].args })
          allToolResults.push(results[j])
        }

        // Add function responses as user turn (Gemini format)
        // Compact results to keep context small — full content saved to workspace files
        const compactedParts = yield* Effect.tryPromise({
          try: () =>
            compactFunctionResponses(toolCallsWithIds, results, agentConfigResolved.id, i),
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
      // Flush any pending (unresolved) tool calls before final synthesis
      const pendingResults = toolGuard.flushPending()
      if (pendingResults.length > 0) {
        currentContents.push({
          role: "user",
          parts: pendingResults.map((r) => ({ functionResponse: r })),
        })
      }

      const finalResult = yield* pipe(
        callGeminiWithRetry(
          currentContents,
          buildFinalSynthesisInstruction(systemInstruction, metrics.getSummary()),
          [],
          apiKey,
          model,
          fallbackModels,
          thinkingBudget
        ),
        Effect.catchTag("ContextOverflowError", () => Effect.succeed(null))
      )
      if (finalResult) {
        finalContent = finalResult.text
        addTokenUsage(accumulatedUsage, finalResult.usage)
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
      const apiKey = yield* getApiKey(appConfig)

      const history = [...(request.history ?? [])]
      const enableTools = request.enableTools !== false
      const model = agentConfigResolved.model.primary
      const thinkingBudget = getThinkingBudget(agentConfigResolved.thinkingLevel)

      const { systemInstruction, contents: initialContents } = yield* Effect.tryPromise({
        try: () =>
          buildGeminiInput(
            agentConfigResolved,
            history,
            request.message,
            toolRegistry,
            characterState
          ),
        catch: (error) => new AgentError({ reason: `Failed to build messages: ${error}` }),
      })

      return orchestrateAgentStreamIterations({
        apiKey,
        model,
        thinkingBudget,
        enableTools,
        toolRegistry,
        initialContents,
        systemInstruction,
        agentId: agentConfigResolved.id,
        maxToolIterations: MAX_TOOL_ITERATIONS,
        softLimitIterations: SOFT_LIMIT_ITERATIONS,
        toolTimeoutMs: DEFAULT_TOOL_TIMEOUT_MS,
      })
    })
  )

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
