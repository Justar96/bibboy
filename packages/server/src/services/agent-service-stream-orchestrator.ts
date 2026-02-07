import { Effect, Stream, pipe } from "effect"
import type {
  AgentServiceError,
  AgentStreamEvent,
  ToolCall,
} from "@bibboy/shared"
import { AgentError } from "@bibboy/shared"
import {
  streamGemini,
  type GeminiContent,
} from "@bibboy/agent-runtime"
import {
  createToolExecutionMetrics,
  type ToolExecutionContext,
  type ToolRegistry,
} from "../tools/types"
import { sanitizeAssistantOutput } from "../text"
import {
  buildFinalSynthesisInstruction,
  buildToolBudgetSystemInstruction,
  generateMessageId,
} from "./agent-service-helpers"
import { classifyToTaggedError } from "./agent-service-gemini"
import {
  compactFunctionResponses,
  executeTools,
  toGeminiFunctionDeclarations,
} from "./agent-service-tool-execution"

interface PendingFunctionCall {
  id: string
  name: string
  args: Record<string, unknown>
  thoughtSignature?: string
}

interface StreamOrchestratorDeps {
  readonly streamGeminiFn?: typeof streamGemini
  readonly executeToolsFn?: typeof executeTools
  readonly compactFunctionResponsesFn?: typeof compactFunctionResponses
  readonly toGeminiFunctionDeclarationsFn?: typeof toGeminiFunctionDeclarations
  readonly classifyToTaggedErrorFn?: typeof classifyToTaggedError
  readonly generateMessageIdFn?: typeof generateMessageId
}

export interface StreamOrchestratorParams {
  readonly apiKey: string
  readonly model: string
  readonly thinkingBudget?: number
  readonly enableTools: boolean
  readonly toolRegistry: ToolRegistry
  readonly initialContents: GeminiContent[]
  readonly systemInstruction: string
  readonly agentId: string
  readonly maxToolIterations: number
  readonly softLimitIterations: number
  readonly toolTimeoutMs: number
  readonly deps?: StreamOrchestratorDeps
}

function createDoneEvent(
  content: string,
  allToolCalls: ToolCall[],
  generateMessageIdFn: () => string
): AgentStreamEvent {
  return {
    type: "done",
    message: {
      id: generateMessageIdFn(),
      role: "assistant",
      content,
      timestamp: Date.now(),
    },
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
  }
}

export function orchestrateAgentStreamIterations(
  params: StreamOrchestratorParams
): Stream.Stream<AgentStreamEvent, AgentServiceError> {
  const metrics = createToolExecutionMetrics()
  const toolCtx: ToolExecutionContext = {
    timeoutMs: params.toolTimeoutMs,
    metrics,
  }

  const streamGeminiFn = params.deps?.streamGeminiFn ?? streamGemini
  const executeToolsFn = params.deps?.executeToolsFn ?? executeTools
  const compactFunctionResponsesFn =
    params.deps?.compactFunctionResponsesFn ?? compactFunctionResponses
  const toGeminiFunctionDeclarationsFn =
    params.deps?.toGeminiFunctionDeclarationsFn ?? toGeminiFunctionDeclarations
  const classifyToTaggedErrorFn =
    params.deps?.classifyToTaggedErrorFn ?? classifyToTaggedError
  const generateMessageIdFn = params.deps?.generateMessageIdFn ?? generateMessageId

  const processIteration = (
    currentContents: GeminiContent[],
    iteration: number,
    allToolCalls: ToolCall[],
    fullContent: string
  ): Stream.Stream<AgentStreamEvent, AgentServiceError> => {
    const currentToolDefs = params.enableTools
      ? toGeminiFunctionDeclarationsFn(params.toolRegistry.getDefinitions())
      : []

    const remaining = params.maxToolIterations - iteration
    let currentSystemInstruction = params.systemInstruction
    if (iteration >= params.softLimitIterations) {
      currentSystemInstruction = buildToolBudgetSystemInstruction(
        params.systemInstruction,
        remaining,
        metrics.getSummary()
      )
    }

    if (iteration >= params.maxToolIterations) {
      if (!fullContent && allToolCalls.length > 0) {
        let finalIterContent = ""
        return pipe(
          streamGeminiFn({
            apiKey: params.apiKey,
            model: params.model,
            contents: currentContents,
            systemInstruction: buildFinalSynthesisInstruction(
              params.systemInstruction,
              metrics.getSummary()
            ),
            maxOutputTokens: 8192,
            thinkingBudget: params.thinkingBudget,
          }).pipe(
            Stream.mapError((error) =>
              classifyToTaggedErrorFn(error, params.model)
            )
          ),
          Stream.catchTag("ContextOverflowError", () => Stream.empty),
          Stream.mapConcat((event): AgentStreamEvent[] => {
            if (event.type === "text_delta") {
              finalIterContent += event.delta
              return [{ type: "text_delta", delta: event.delta }]
            }
            return []
          }),
          Stream.concat(
            Stream.succeed<AgentStreamEvent>(
              createDoneEvent(
                sanitizeAssistantOutput(fullContent + finalIterContent),
                allToolCalls,
                generateMessageIdFn
              )
            )
          )
        )
      }

      return Stream.succeed<AgentStreamEvent>(
        createDoneEvent(fullContent, allToolCalls, generateMessageIdFn)
      )
    }

    let iterationContent = ""
    const pendingFunctionCalls: PendingFunctionCall[] = []

    return pipe(
      streamGeminiFn({
        apiKey: params.apiKey,
        model: params.model,
        contents: currentContents,
        systemInstruction: currentSystemInstruction,
        tools: currentToolDefs.length > 0 ? currentToolDefs : undefined,
        toolConfig: currentToolDefs.length > 0 ? "auto" : "none",
        maxOutputTokens: 8192,
        thinkingBudget: params.thinkingBudget,
      }).pipe(
        Stream.mapError((error) => classifyToTaggedErrorFn(error, params.model))
      ),
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
            ...(event.thoughtSignature && {
              thoughtSignature: event.thoughtSignature,
            }),
          })
          events.push(event)
        } else if (event.type === "error") {
          events.push(event)
        }

        return events
      }),
      Stream.concat(
        Stream.unwrap(
          Effect.gen(function* () {
            if (pendingFunctionCalls.length > 0) {
              currentContents.push({
                role: "model",
                parts: pendingFunctionCalls.map((functionCall) => ({
                  functionCall: {
                    name: functionCall.name,
                    args: functionCall.args,
                  },
                  ...(functionCall.thoughtSignature && {
                    thoughtSignature: functionCall.thoughtSignature,
                  }),
                })),
              })

              const toolResults = yield* executeToolsFn(
                params.toolRegistry,
                pendingFunctionCalls,
                { ...toolCtx, iteration }
              )

              const toolEvents: AgentStreamEvent[] = []
              for (
                let toolIndex = 0;
                toolIndex < pendingFunctionCalls.length;
                toolIndex++
              ) {
                const pendingCall = pendingFunctionCalls[toolIndex]
                const toolResult = toolResults[toolIndex]
                toolEvents.push({
                  type: "tool_end",
                  toolCallId: pendingCall.id,
                  toolName: pendingCall.name,
                  result: toolResult,
                })
                allToolCalls.push({
                  id: pendingCall.id,
                  name: pendingCall.name,
                  arguments: pendingCall.args,
                })
              }

              const compactedParts = yield* Effect.tryPromise({
                try: () =>
                  compactFunctionResponsesFn(
                    pendingFunctionCalls,
                    toolResults,
                    params.agentId,
                    iteration
                  ),
                catch: () =>
                  new AgentError({ reason: "Failed to compact tool results" }),
              })

              currentContents.push({
                role: "user",
                parts: compactedParts,
              })

              return Stream.concat(
                Stream.fromIterable(toolEvents),
                processIteration(
                  currentContents,
                  iteration + 1,
                  allToolCalls,
                  fullContent + iterationContent
                )
              )
            }

            return Stream.succeed<AgentStreamEvent>(
              createDoneEvent(
                sanitizeAssistantOutput(fullContent + iterationContent),
                allToolCalls,
                generateMessageIdFn
              )
            )
          })
        )
      )
    )
  }

  return processIteration([...params.initialContents], 0, [], "")
}
