import { Effect, Stream, pipe } from "effect"
import type {
  AgentServiceError,
  AgentStreamEvent,
  CharacterState,
  ChatMessage,
} from "@bibboy/shared"
import {
  chatMessagesToGeminiContents,
  type GeminiContent,
} from "@bibboy/agent-runtime"
import type { ResolvedAgentConfig } from "../agents/AgentConfig"
import { buildAgentSystemPrompt } from "../agents/SystemPromptBuilder"
import type { ToolRegistry } from "../tools"
import {
  getWorkspaceDir,
  initializeWorkspace,
  loadContextFiles,
} from "../workspace"

const DEFAULT_HISTORY_TURN_LIMIT = 15

export type TokenUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Limit conversation history to the last N user turns (and their associated
 * assistant responses). Keeps complete exchanges intact rather than cutting
 * mid-conversation. Preserves system messages (e.g. compaction summaries)
 * which are always kept at the front. Adapted from OpenClaw's limitHistoryTurns.
 */
export function limitHistoryTurns(
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
  return [...systemMessages, ...trimmedConversation]
}

export function addTokenUsage(totals: TokenUsage, usage?: TokenUsage): void {
  if (!usage) return
  totals.promptTokens += usage.promptTokens
  totals.completionTokens += usage.completionTokens
  totals.totalTokens += usage.totalTokens
}

export function buildToolBudgetSystemInstruction(
  baseInstruction: string,
  remainingRounds: number,
  usageSummary: string
): string {
  const usageSuffix = usageSummary ? `\n\n${usageSummary}` : ""
  return `${baseInstruction}\n\n## Tool Budget\nYou have ${remainingRounds} tool-call rounds remaining. Start wrapping up - synthesize your findings into a response soon.${usageSuffix}`
}

export function buildFinalSynthesisInstruction(
  baseInstruction: string,
  usageSummary: string
): string {
  const usageSuffix = usageSummary ? `\n\n${usageSummary}` : ""
  return `${baseInstruction}\n\n## Tool Budget\nNo tool-call rounds remaining. Synthesize all gathered information into a final response now.${usageSuffix}`
}

export async function buildGeminiInput(
  agent: ResolvedAgentConfig,
  history: readonly ChatMessage[],
  userMessage: string,
  toolRegistry: ToolRegistry,
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

/**
 * Convert Stream to AsyncGenerator for backwards compatibility.
 */
export async function* streamToAsyncGenerator(
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
