import { Duration, Effect, pipe, Ref, Schedule } from "effect"
import type { AgentServiceError } from "@bibboy/shared"
import {
  AgentError,
  ApiKeyNotConfiguredError,
  ApiTimeoutError,
  AuthenticationError,
  BillingError,
  ContextOverflowError,
  RateLimitExceededError,
  ServiceOverloadedError,
} from "@bibboy/shared"
import {
  createGeminiResponse,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiResponse,
} from "@bibboy/agent-runtime"
import {
  isAuthError,
  isBillingError,
  isContextOverflowError,
  isOverloadedError,
  isRateLimitError,
  isTimeoutError,
} from "../agents/agent-errors"
import type { AppConfigData } from "../config"
import { getGeminiApiKeyValue, hasGeminiApiKey } from "../config"
import { extractAgentErrorMessage } from "./error-utils"

const DEFAULT_TIMEOUT_MS = 120_000

export type GeminiResponseWithModel = GeminiResponse & {
  modelUsed: string
}

export function classifyToTaggedError(
  error: unknown,
  model: string
): AgentServiceError {
  const message = extractAgentErrorMessage(error)

  if (isContextOverflowError(message)) return new ContextOverflowError({ model })
  if (isRateLimitError(message)) {
    return new RateLimitExceededError({ retryAfterMs: 30000 })
  }
  if (isAuthError(message)) return new AuthenticationError({ reason: message })
  if (isBillingError(message)) return new BillingError({ reason: message })
  if (isTimeoutError(message)) {
    return new ApiTimeoutError({ timeoutMs: DEFAULT_TIMEOUT_MS })
  }
  if (isOverloadedError(message)) {
    return new ServiceOverloadedError({ retryAfterMs: 10000 })
  }

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

const createRetrySchedule = () =>
  pipe(
    Schedule.exponential(Duration.seconds(2), 2),
    Schedule.jittered,
    Schedule.intersect(Schedule.recurs(3)),
    Schedule.whileInput((error: AgentServiceError) => isRetryableError(error))
  )

export const getApiKey = (
  appConfig: AppConfigData
): Effect.Effect<string, ApiKeyNotConfiguredError> =>
  Effect.gen(function* () {
    if (!hasGeminiApiKey(appConfig)) {
      return yield* Effect.fail(
        new ApiKeyNotConfiguredError({ provider: "gemini" })
      )
    }

    const apiKey = getGeminiApiKeyValue(appConfig)
    if (!apiKey) {
      return yield* Effect.fail(
        new ApiKeyNotConfiguredError({ provider: "gemini" })
      )
    }

    return apiKey
  })

export const callGemini = (
  contents: GeminiContent[],
  systemInstruction: string,
  tools: GeminiFunctionDeclaration[],
  apiKey: string,
  model: string,
  thinkingBudget?: number
): Effect.Effect<GeminiResponse, AgentServiceError> =>
  pipe(
    createGeminiResponse({
      apiKey,
      model,
      contents,
      systemInstruction,
      tools: tools.length > 0 ? tools : undefined,
      toolConfig: tools.length > 0 ? "auto" : "none",
      maxOutputTokens: 8192,
      thinkingBudget,
    }),
    Effect.catchAll((error) => Effect.fail(classifyToTaggedError(error, model))),
    Effect.timeout(Duration.millis(DEFAULT_TIMEOUT_MS)),
    Effect.catchTag("TimeoutException", () =>
      Effect.fail(new ApiTimeoutError({ timeoutMs: DEFAULT_TIMEOUT_MS }))
    )
  )

export const callGeminiWithRetry = (
  contents: GeminiContent[],
  systemInstruction: string,
  tools: GeminiFunctionDeclaration[],
  apiKey: string,
  model: string,
  fallbackModels: string[],
  thinkingBudget?: number
): Effect.Effect<GeminiResponseWithModel, AgentServiceError> =>
  Effect.gen(function* () {
    const allModels = [model, ...fallbackModels]
    const modelIndexRef = yield* Ref.make(0)

    const tryWithModel = Effect.gen(function* () {
      const modelIndex = yield* Ref.get(modelIndexRef)
      const currentModel = allModels[modelIndex] ?? model

      return yield* pipe(
        callGemini(
          contents,
          systemInstruction,
          tools,
          apiKey,
          currentModel,
          thinkingBudget
        ),
        Effect.map((response) => ({ ...response, modelUsed: currentModel })),
        Effect.catchTag("ContextOverflowError", (error) =>
          Effect.gen(function* () {
            if (modelIndex < allModels.length - 1) {
              yield* Ref.update(modelIndexRef, (index) => index + 1)
            }
            return yield* Effect.fail(error)
          })
        )
      )
    })

    return yield* pipe(tryWithModel, Effect.retry(createRetrySchedule()))
  })
