/**
 * ConversationMemory — simple multi-turn memory with LLM-based compaction.
 *
 * Inspired by OpenClaw's compaction.ts pattern:
 *  - Token estimation with safety margin
 *  - Threshold-based compaction triggering
 *  - Multi-stage summarization (chunk → summarize → merge)
 *  - Keeps recent turns intact for conversational coherence
 *
 * Designed for in-session use only — no persistence across sessions.
 * Context window capped at 128K tokens.
 */
import { Effect } from "effect"
import type { ChatMessage } from "@bibboy/shared"
import { createGeminiResponse, type GeminiContent } from "@bibboy/agent-runtime"

// ============================================================================
// Constants (adapted from OpenClaw compaction.ts)
// ============================================================================

/** Hard context window limit for Gemini */
const CONTEXT_WINDOW_TOKENS = 128_000

/** Trigger compaction when estimated usage exceeds this share of context window */
const COMPACTION_THRESHOLD = 0.75

/** Safety margin for token estimation inaccuracy (OpenClaw uses 1.2) */
const SAFETY_MARGIN = 1.2

/**
 * Rough chars-per-token ratio.
 * GPT/Gemini tokenizers average ~4 chars/token for English text.
 * We use a conservative 3.5 to slightly overestimate (safer).
 */
const CHARS_PER_TOKEN = 3.5

/** Per-message overhead for role, metadata, separators */
const MESSAGE_OVERHEAD_TOKENS = 10

/** Keep last N user turns (and their responses) intact during compaction */
const RECENT_TURNS_TO_KEEP = 4

/**
 * Max tokens for the summarization chunk sent to the model.
 * Keeps summarization requests well under context limits.
 * Roughly 40% of context (adapted from OpenClaw BASE_CHUNK_RATIO).
 */
const SUMMARIZATION_CHUNK_MAX_TOKENS = Math.floor(CONTEXT_WINDOW_TOKENS * 0.4)

/** Reserve tokens for the summarization prompt + response */
const SUMMARIZATION_RESERVE_TOKENS = 4_000

/** Minimum messages before we even consider compaction */
const MIN_MESSAGES_FOR_COMPACTION = 6

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count from a text string.
 * Conservative estimate using chars/token ratio with ceiling.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate tokens for a single ChatMessage (content + role overhead).
 */
export function estimateMessageTokens(message: ChatMessage): number {
  return estimateTokens(message.content) + MESSAGE_OVERHEAD_TOKENS
}

/**
 * Sum token estimates for an array of messages.
 * Equivalent to OpenClaw's estimateMessagesTokens.
 */
export function estimateMessagesTokens(messages: readonly ChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0)
}

// ============================================================================
// Compaction Detection
// ============================================================================

/**
 * Check whether the conversation should be compacted.
 *
 * Returns true when the estimated total tokens (system prompt + messages)
 * with safety margin exceeds the compaction threshold of the context window.
 */
export function shouldCompact(
  systemPromptTokens: number,
  messages: readonly ChatMessage[],
  contextLimit: number = CONTEXT_WINDOW_TOKENS
): boolean {
  if (messages.length < MIN_MESSAGES_FOR_COMPACTION) return false

  const messagesTokens = estimateMessagesTokens(messages)
  const totalEstimate = (systemPromptTokens + messagesTokens) * SAFETY_MARGIN
  const threshold = contextLimit * COMPACTION_THRESHOLD

  return totalEstimate > threshold
}

/**
 * Get current context usage info for debugging/logging.
 */
export function getContextUsage(
  systemPromptTokens: number,
  messages: readonly ChatMessage[],
  contextLimit: number = CONTEXT_WINDOW_TOKENS
): {
  estimatedTokens: number
  contextLimit: number
  usagePercent: number
  shouldCompact: boolean
} {
  const messagesTokens = estimateMessagesTokens(messages)
  const estimatedTokens = Math.floor((systemPromptTokens + messagesTokens) * SAFETY_MARGIN)
  const usagePercent = Math.round((estimatedTokens / contextLimit) * 100)

  return {
    estimatedTokens,
    contextLimit,
    usagePercent,
    shouldCompact: estimatedTokens > contextLimit * COMPACTION_THRESHOLD,
  }
}

// ============================================================================
// Message Splitting (adapted from OpenClaw)
// ============================================================================

/**
 * Split messages into "to compact" (older) and "to keep" (recent).
 * Keeps the last RECENT_TURNS_TO_KEEP user turns and all their
 * associated responses intact for conversational coherence.
 */
function splitForCompaction(
  messages: readonly ChatMessage[]
): { toCompact: ChatMessage[]; toKeep: ChatMessage[] } {
  let keepFromIndex = 0
  let userCount = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++
      if (userCount >= RECENT_TURNS_TO_KEEP) {
        keepFromIndex = i
        break
      }
    }
  }

  // If we can't find enough turns, keep everything
  if (userCount < RECENT_TURNS_TO_KEEP) {
    return { toCompact: [], toKeep: [...messages] }
  }

  return {
    toCompact: messages.slice(0, keepFromIndex) as ChatMessage[],
    toKeep: messages.slice(keepFromIndex) as ChatMessage[],
  }
}

/**
 * Chunk messages by max token budget (OpenClaw's chunkMessagesByMaxTokens).
 * Ensures no single chunk exceeds the given token limit.
 */
function chunkMessagesByMaxTokens(
  messages: readonly ChatMessage[],
  maxTokens: number
): ChatMessage[][] {
  if (messages.length === 0) return []

  const chunks: ChatMessage[][] = []
  let currentChunk: ChatMessage[] = []
  let currentTokens = 0

  for (const msg of messages) {
    const msgTokens = estimateMessageTokens(msg)

    if (currentChunk.length > 0 && currentTokens + msgTokens > maxTokens) {
      chunks.push(currentChunk)
      currentChunk = []
      currentTokens = 0
    }

    currentChunk.push(msg)
    currentTokens += msgTokens

    // Oversized single message — push immediately to avoid unbounded growth
    if (msgTokens > maxTokens) {
      chunks.push(currentChunk)
      currentChunk = []
      currentTokens = 0
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

// ============================================================================
// Summarization Prompts
// ============================================================================

const SUMMARIZATION_SYSTEM_PROMPT = `You are a conversation summarizer. Your task is to produce a concise summary of a conversation between a user and an AI assistant.

Rules:
- Preserve key facts the user shared about themselves (name, interests, preferences, context)
- Keep track of important topics discussed and conclusions reached
- Note any decisions, preferences, or requests the user made
- Maintain any ongoing context needed for future conversation
- Be concise but comprehensive — aim for ~20% of original length
- Write in third person ("The user asked about...", "The assistant explained...")
- Organize by topic, not chronologically
- If previous summary context is provided, merge it with the new information`

const SUMMARIZATION_USER_PROMPT = (
  conversationText: string,
  previousSummary?: string
): string => {
  const parts: string[] = []

  if (previousSummary) {
    parts.push(`Previous conversation summary:\n${previousSummary}\n`)
  }

  parts.push(`Conversation to summarize:\n${conversationText}`)
  parts.push(`\nProduce a concise summary preserving all important context, facts, and decisions.`)

  return parts.join("\n")
}

const MERGE_SUMMARIES_PROMPT = `Merge these partial conversation summaries into a single cohesive summary.
Preserve all key facts, decisions, user preferences, and ongoing context.
Remove redundancy and organize by topic.`

// ============================================================================
// Summarization via Gemini
// ============================================================================

/**
 * Format messages into a readable conversation transcript for summarization.
 */
function formatMessagesForSummary(messages: readonly ChatMessage[]): string {
  return messages
    .map((msg) => {
      const role = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System"
      // Truncate very long messages to keep summarization manageable
      const content =
        msg.content.length > 8000
          ? msg.content.slice(0, 8000) + "\n[...truncated...]"
          : msg.content
      return `${role}: ${content}`
    })
    .join("\n\n")
}

/**
 * Summarize a chunk of messages using the Gemini model.
 * Uses the same model the agent is using for consistency.
 */
async function summarizeChunk(
  messages: readonly ChatMessage[],
  apiKey: string,
  model: string,
  previousSummary?: string
): Promise<string> {
  const transcript = formatMessagesForSummary(messages)
  const userPrompt = SUMMARIZATION_USER_PROMPT(transcript, previousSummary)

  const contents: GeminiContent[] = [
    { role: "user", parts: [{ text: userPrompt }] },
  ]

  const result = await Effect.runPromise(
    createGeminiResponse({
      apiKey,
      model,
      contents,
      systemInstruction: SUMMARIZATION_SYSTEM_PROMPT,
      maxOutputTokens: SUMMARIZATION_RESERVE_TOKENS,
      temperature: 0.3, // Low temperature for factual summarization
    })
  )

  return result.text || "No summary generated."
}

/**
 * Summarize messages in stages — chunk large histories, summarize each chunk,
 * then merge partial summaries. Adapted from OpenClaw's summarizeInStages.
 */
async function summarizeInStages(
  messages: readonly ChatMessage[],
  apiKey: string,
  model: string,
  previousSummary?: string
): Promise<string> {
  if (messages.length === 0) {
    return previousSummary ?? "No prior conversation."
  }

  const totalTokens = estimateMessagesTokens(messages)

  // If small enough, summarize in one pass
  if (totalTokens <= SUMMARIZATION_CHUNK_MAX_TOKENS) {
    return await summarizeChunk(messages, apiKey, model, previousSummary)
  }

  // Split into chunks and summarize each
  const chunks = chunkMessagesByMaxTokens(messages, SUMMARIZATION_CHUNK_MAX_TOKENS)
  const partialSummaries: string[] = []

  for (const chunk of chunks) {
    try {
      const summary = await summarizeChunk(chunk, apiKey, model)
      partialSummaries.push(summary)
    } catch (error) {
      // Fallback: create a basic note about skipped content
      const tokens = estimateMessagesTokens(chunk)
      partialSummaries.push(
        `[${chunk.length} messages (~${Math.round(tokens / 1000)}K tokens) — summarization failed]`
      )
      console.warn(
        `[ConversationMemory] Chunk summarization failed:`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  if (partialSummaries.length === 1) {
    // Merge with previous summary if present
    if (previousSummary) {
      return await summarizeChunk(
        [
          { id: "prev", role: "system", content: previousSummary, timestamp: 0 },
          { id: "new", role: "system", content: partialSummaries[0], timestamp: 0 },
        ],
        apiKey,
        model
      )
    }
    return partialSummaries[0]
  }

  // Merge partial summaries
  const mergeMessages: ChatMessage[] = [
    ...(previousSummary
      ? [{ id: "prev", role: "system" as const, content: `Previous context:\n${previousSummary}`, timestamp: 0 }]
      : []),
    ...partialSummaries.map((s, i) => ({
      id: `partial_${i}`,
      role: "system" as const,
      content: `Part ${i + 1}:\n${s}`,
      timestamp: 0,
    })),
  ]

  const mergeTranscript = formatMessagesForSummary(mergeMessages)
  const mergeContents: GeminiContent[] = [
    {
      role: "user",
      parts: [{ text: `${MERGE_SUMMARIES_PROMPT}\n\n${mergeTranscript}` }],
    },
  ]

  try {
    const mergeResult = await Effect.runPromise(
      createGeminiResponse({
        apiKey,
        model,
        contents: mergeContents,
        systemInstruction: SUMMARIZATION_SYSTEM_PROMPT,
        maxOutputTokens: SUMMARIZATION_RESERVE_TOKENS,
        temperature: 0.3,
      })
    )
    return mergeResult.text || partialSummaries.join("\n\n")
  } catch {
    // If merge fails, concatenate partial summaries
    return partialSummaries.join("\n\n")
  }
}

// ============================================================================
// Main API
// ============================================================================

/** Result of compaction — contains the new message array for the session */
export interface CompactionResult {
  /** Whether compaction was performed */
  compacted: boolean
  /** Updated messages array (with summary replacing old messages) */
  messages: ChatMessage[]
  /** Tokens before compaction */
  tokensBefore: number
  /** Tokens after compaction */
  tokensAfter: number
  /** Number of messages removed by compaction */
  messagesCompacted: number
}

/**
 * Compact conversation history if it exceeds the context threshold.
 *
 * This is the main entry point. It:
 * 1. Checks if compaction is needed
 * 2. Splits messages into old (to summarize) and recent (to keep)
 * 3. Summarizes old messages using the same Gemini model
 * 4. Returns updated message array with summary replacing old messages
 *
 * The returned messages should be stored back into the session.
 */
export async function compactIfNeeded(
  messages: readonly ChatMessage[],
  systemPromptTokens: number,
  apiKey: string,
  model: string,
  contextLimit: number = CONTEXT_WINDOW_TOKENS
): Promise<CompactionResult> {
  const tokensBefore = estimateMessagesTokens(messages)

  if (!shouldCompact(systemPromptTokens, messages, contextLimit)) {
    return {
      compacted: false,
      messages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      messagesCompacted: 0,
    }
  }

  console.log(
    `[ConversationMemory] Compaction triggered — ` +
    `${messages.length} messages, ~${Math.round(tokensBefore / 1000)}K estimated tokens ` +
    `(threshold: ${Math.round((contextLimit * COMPACTION_THRESHOLD) / 1000)}K)`
  )

  const { toCompact, toKeep } = splitForCompaction(messages)

  if (toCompact.length === 0) {
    console.log(`[ConversationMemory] Nothing to compact (all messages are recent)`)
    return {
      compacted: false,
      messages: [...messages],
      tokensBefore,
      tokensAfter: tokensBefore,
      messagesCompacted: 0,
    }
  }

  // Check if there's already a summary in the messages to compact
  const existingSummary = toCompact.find(
    (msg) => msg.role === "system" && msg.content.startsWith("[Conversation Summary]")
  )
  const previousSummary = existingSummary
    ? existingSummary.content.replace("[Conversation Summary]\n", "")
    : undefined
  const messagesToSummarize = existingSummary
    ? toCompact.filter((msg) => msg !== existingSummary)
    : toCompact

  try {
    const summary = await summarizeInStages(
      messagesToSummarize,
      apiKey,
      model,
      previousSummary
    )

    const summaryMessage: ChatMessage = {
      id: `summary_${Date.now()}`,
      role: "system",
      content: `[Conversation Summary]\n${summary}`,
      timestamp: Date.now(),
    }

    const newMessages = [summaryMessage, ...toKeep]
    const tokensAfter = estimateMessagesTokens(newMessages)

    console.log(
      `[ConversationMemory] Compaction complete — ` +
      `${toCompact.length} messages → 1 summary, ` +
      `~${Math.round(tokensBefore / 1000)}K → ~${Math.round(tokensAfter / 1000)}K tokens ` +
      `(${Math.round(((tokensBefore - tokensAfter) / tokensBefore) * 100)}% reduction)`
    )

    return {
      compacted: true,
      messages: newMessages,
      tokensBefore,
      tokensAfter,
      messagesCompacted: toCompact.length,
    }
  } catch (error) {
    console.error(
      `[ConversationMemory] Compaction failed, keeping original messages:`,
      error instanceof Error ? error.message : String(error)
    )

    // Fallback: just do aggressive turn limiting
    const fallbackMessages = limitHistoryTurnsFallback(messages, RECENT_TURNS_TO_KEEP + 2)
    const tokensAfter = estimateMessagesTokens(fallbackMessages)

    return {
      compacted: true,
      messages: fallbackMessages,
      tokensBefore,
      tokensAfter,
      messagesCompacted: messages.length - fallbackMessages.length,
    }
  }
}

/**
 * Fallback turn limiting when LLM compaction fails.
 * Keeps only the most recent N user turns and their responses.
 */
function limitHistoryTurnsFallback(
  messages: readonly ChatMessage[],
  limit: number
): ChatMessage[] {
  if (messages.length === 0 || limit <= 0) return [...messages]

  let userCount = 0
  let cutIndex = 0

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      userCount++
      if (userCount > limit) {
        cutIndex = i + 1
        break
      }
    }
  }

  return messages.slice(cutIndex) as ChatMessage[]
}

// ============================================================================
// Exports
// ============================================================================

export {
  CONTEXT_WINDOW_TOKENS,
  COMPACTION_THRESHOLD,
  SAFETY_MARGIN,
  RECENT_TURNS_TO_KEEP,
}
