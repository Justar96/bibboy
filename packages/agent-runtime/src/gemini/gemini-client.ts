import { Effect, Stream, Duration, pipe } from "effect"
import type { AgentStreamEvent } from "@bibboy/shared"

// ============================================================================
// Gemini API Types
// ============================================================================

/** Role for Gemini conversation messages */
type GeminiRole = "user" | "model"

/** A single part in a Gemini content message */
interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown }
  thoughtSignature?: string
}

/** A content item in the Gemini request */
interface GeminiContent {
  role: GeminiRole
  parts: GeminiPart[]
}

/** Tool function declaration for Gemini */
interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters?: Record<string, unknown>
}

/** Tool configuration for Gemini */
interface GeminiTool {
  functionDeclarations: GeminiFunctionDeclaration[]
}

/** Tool config mode */
interface GeminiToolConfig {
  functionCallingConfig?: {
    mode: "AUTO" | "ANY" | "NONE"
    allowedFunctionNames?: string[]
  }
}

/** Gemini generation config */
interface GeminiGenerationConfig {
  temperature?: number
  topP?: number
  topK?: number
  maxOutputTokens?: number
  stopSequences?: string[]
  thinkingConfig?: {
    thinkingBudget?: number
  }
}

/** Gemini API request body */
interface GeminiRequestBody {
  contents: GeminiContent[]
  systemInstruction?: { parts: GeminiPart[] }
  tools?: GeminiTool[]
  toolConfig?: GeminiToolConfig
  generationConfig?: GeminiGenerationConfig
}

/** A candidate in the Gemini response */
interface GeminiCandidate {
  content?: {
    parts: GeminiPart[]
    role: string
  }
  finishReason?: string
  index?: number
}

/** Gemini usage metadata */
interface GeminiUsageMetadata {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

/** Full Gemini generate response */
interface GeminiGenerateResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
}

// ============================================================================
// Public Request Interface
// ============================================================================

export interface GeminiRequest {
  apiKey: string
  model: string
  contents: GeminiContent[]
  systemInstruction?: string
  tools?: GeminiFunctionDeclaration[]
  toolConfig?: "auto" | "any" | "none"
  maxOutputTokens?: number
  temperature?: number
  thinkingBudget?: number
}

export interface GeminiResponse {
  text: string
  functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }>
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ============================================================================
// Constants
// ============================================================================

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MODEL = "gemini-3-flash-preview"

const TOOL_CONFIG_MODES: Record<string, "AUTO" | "ANY" | "NONE"> = {
  auto: "AUTO",
  any: "ANY",
  none: "NONE",
}

/** Coerce an unknown caught value to an Error instance */
function toError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error))
}

/** Validate that parsed JSON has the expected Gemini response shape */
function isGeminiGenerateResponse(data: unknown): data is GeminiGenerateResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "candidates" in data &&
    Array.isArray((data as { candidates: unknown }).candidates)
  )
}

// ============================================================================
// Helpers
// ============================================================================

function getGenerateUrl(model: string, apiKey: string, stream: boolean): string {
  const action = stream ? "streamGenerateContent" : "generateContent"
  const alt = stream ? "?alt=sse&key=" : "?key="
  return `${GEMINI_API_BASE}/models/${model}:${action}${alt}${apiKey}`
}

function buildRequestBody(params: GeminiRequest): GeminiRequestBody {
  const body: GeminiRequestBody = {
    contents: params.contents,
  }

  if (params.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: params.systemInstruction }],
    }
  }

  if (params.tools && params.tools.length > 0) {
    // Sanitize tool schemas for Gemini (strip unsupported JSON Schema keywords)
    const sanitized = params.tools.map(sanitizeFunctionDeclaration)
    body.tools = [{ functionDeclarations: sanitized }]

    const mode = TOOL_CONFIG_MODES[params.toolConfig ?? "auto"] ?? "AUTO"
    body.toolConfig = {
      functionCallingConfig: { mode },
    }
  }

  const genConfig: GeminiGenerationConfig = {}
  if (typeof params.maxOutputTokens === "number") {
    genConfig.maxOutputTokens = params.maxOutputTokens
  }
  if (typeof params.temperature === "number") {
    genConfig.temperature = params.temperature
  }
  if (typeof params.thinkingBudget === "number") {
    genConfig.thinkingConfig = { thinkingBudget: params.thinkingBudget }
  }
  if (Object.keys(genConfig).length > 0) {
    body.generationConfig = genConfig
  }

  return body
}

/**
 * Sanitize function declarations for Gemini.
 * Gemini rejects certain JSON Schema keywords (e.g. additionalProperties).
 * Inspired by reference OpenClaw google.ts sanitization.
 */
function sanitizeFunctionDeclaration(decl: GeminiFunctionDeclaration): GeminiFunctionDeclaration {
  return {
    name: decl.name,
    description: decl.description,
    parameters: decl.parameters ? sanitizeSchema(decl.parameters) : undefined,
  }
}

function sanitizeSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  // Keys Gemini doesn't support
  const UNSUPPORTED_KEYS = new Set([
    "additionalProperties",
    "$schema",
    "default",
    "examples",
    "id",
    "$id",
    "$ref",
    "definitions",
    "$defs",
    "patternProperties",
    "dependentRequired",
    "dependentSchemas",
    "if",
    "then",
    "else",
    "allOf",
    "anyOf",
    "oneOf",
    "not",
    "const",
    "title",
  ])

  for (const [key, value] of Object.entries(schema)) {
    if (UNSUPPORTED_KEYS.has(key)) continue

    if (key === "properties" && typeof value === "object" && value !== null) {
      const props: Record<string, unknown> = {}
      for (const [propKey, propVal] of Object.entries(value as Record<string, unknown>)) {
        if (typeof propVal === "object" && propVal !== null) {
          props[propKey] = sanitizeSchema(propVal as Record<string, unknown>)
        } else {
          props[propKey] = propVal
        }
      }
      result[key] = props
    } else if (key === "items" && typeof value === "object" && value !== null) {
      result[key] = sanitizeSchema(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }

  return result
}

/**
 * Parse the text and function calls from a Gemini response.
 */
function parseGeminiResponse(data: GeminiGenerateResponse): GeminiResponse {
  const candidate = data.candidates?.[0]
  if (!candidate) {
    return { text: "", functionCalls: [] }
  }

  let text = ""
  const functionCalls: Array<{ name: string; args: Record<string, unknown>; thoughtSignature?: string }> = []

  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      text += part.text
    }
    if (part.functionCall) {
      functionCalls.push({
        name: part.functionCall.name,
        args: part.functionCall.args ?? {},
        ...(part.thoughtSignature && { thoughtSignature: part.thoughtSignature }),
      })
    }
  }

  const usage = data.usageMetadata
    ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      }
    : undefined

  return { text, functionCalls, usage }
}

// ============================================================================
// Non-Streaming
// ============================================================================

/**
 * Make a non-streaming Gemini API call.
 */
export const createGeminiResponse = (
  params: GeminiRequest
): Effect.Effect<GeminiResponse, Error> =>
  Effect.gen(function* () {
    const url = getGenerateUrl(params.model || DEFAULT_MODEL, params.apiKey, false)
    const body = buildRequestBody(params)

    const response = yield* pipe(
      Effect.tryPromise({
        try: () =>
          fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
        catch: toError,
      }),
      Effect.timeout(Duration.millis(DEFAULT_TIMEOUT_MS))
    )

    if (!response.ok) {
      const errorText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: () => new Error(`HTTP ${response.status}`),
      })
      return yield* Effect.fail(
        new Error(`Gemini API error (${response.status}): ${errorText}`)
      )
    }

    const raw: unknown = yield* Effect.tryPromise({
      try: () => response.json(),
      catch: (error) => new Error(`Failed to parse Gemini response: ${String(error)}`),
    })

    if (!isGeminiGenerateResponse(raw)) {
      return yield* Effect.fail(new Error("Unexpected Gemini response shape"))
    }

    return parseGeminiResponse(raw)
  })

// ============================================================================
// Streaming
// ============================================================================

/**
 * Stream Gemini API responses as AgentStreamEvents.
 * Uses the Gemini SSE streaming format (streamGenerateContent with alt=sse).
 */
export const streamGemini = (
  params: GeminiRequest
): Stream.Stream<AgentStreamEvent, Error> =>
  Stream.async<AgentStreamEvent, Error>((emit) => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)
    const url = getGenerateUrl(params.model || DEFAULT_MODEL, params.apiKey, true)
    const body = buildRequestBody(params)

    let fullText = ""

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text()
          await emit.fail(
            new Error(`Gemini API error (${response.status}): ${errorText}`)
          )
          return
        }

        const reader = response.body?.getReader()
        if (!reader) {
          await emit.fail(new Error("No response body"))
          return
        }

        const decoder = new TextDecoder()
        let buffer = ""

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            // Gemini SSE format: data: {json}\r\n\r\n (or \n\n)
            const chunks = buffer.split(/\r?\n\r?\n/)
            buffer = chunks.pop() || ""

            for (const chunk of chunks) {
              const lines = chunk.split("\n")
              for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed.startsWith("data:")) continue

                const payload = trimmed.slice(5).trim()
                if (!payload || payload === "[DONE]") continue

                try {
                  const parsed: unknown = JSON.parse(payload)
                  if (!isGeminiGenerateResponse(parsed)) continue
                  const candidate = parsed.candidates[0]
                  if (!candidate) continue

                  for (const part of candidate.content?.parts ?? []) {
                    // Text delta
                    if (part.text) {
                      fullText += part.text
                      await emit.single({
                        type: "text_delta",
                        delta: part.text,
                      })
                    }

                    // Function call (emitted as tool_start; execution handled by caller)
                    if (part.functionCall) {
                      const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
                      await emit.single({
                        type: "tool_start",
                        toolCallId: callId,
                        toolName: part.functionCall.name,
                        arguments: part.functionCall.args ?? {},
                        ...(part.thoughtSignature && { thoughtSignature: part.thoughtSignature }),
                      })
                    }
                  }
                } catch {
                  // Ignore malformed chunks
                }
              }
            }
          }

          // Emit done event
          await emit.single({
            type: "done",
            message: {
              id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
              role: "assistant",
              content: fullText,
              timestamp: Date.now(),
            },
          })
          await emit.end()
        } catch (error) {
          await emit.fail(toError(error))
        }
      })
      .catch(async (error) => {
        await emit.fail(toError(error))
      })
      .finally(() => {
        clearTimeout(timeoutId)
      })
  })

// ============================================================================
// Conversion Helpers (ChatMessage → Gemini Contents)
// ============================================================================

export type { GeminiContent, GeminiFunctionDeclaration, GeminiRole }

/**
 * Convert ChatMessage history to Gemini contents format.
 * Gemini requires strict user/model alternation.
 * System messages containing conversation summaries are injected as context
 * in the first user turn to preserve compacted conversation history.
 */
export function chatMessagesToGeminiContents(
  messages: ReadonlyArray<{ role: "user" | "assistant" | "system"; content: string }>
): GeminiContent[] {
  const contents: GeminiContent[] = []

  // Collect system messages (conversation summaries) for context injection
  const systemParts: string[] = []

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content)
      continue
    }

    const role: GeminiRole = msg.role === "assistant" ? "model" : "user"
    const last = contents[contents.length - 1]

    // Gemini requires alternating user/model turns.
    // Merge consecutive same-role messages.
    if (last && last.role === role) {
      last.parts.push({ text: msg.content })
    } else {
      contents.push({ role, parts: [{ text: msg.content }] })
    }
  }

  // Inject system context (summaries) at the beginning as a user turn
  if (systemParts.length > 0) {
    const contextText = systemParts.join("\n\n")

    if (contents.length > 0 && contents[0].role === "user") {
      // Prepend to existing first user turn
      contents[0].parts.unshift({ text: contextText })
    } else {
      // Insert a new user turn at the start
      contents.unshift({ role: "user", parts: [{ text: contextText }] })
    }
  }

  // Gemini requires the conversation to start with a user turn
  if (contents.length > 0 && contents[0].role === "model") {
    contents.unshift({ role: "user", parts: [{ text: "(conversation context)" }] })
  }

  return contents
}

export { DEFAULT_MODEL as GEMINI_DEFAULT_MODEL }
