import { Effect } from "effect"
import type { ChatMessage, CompactingNotification } from "@bibboy/shared"
import {
  compactIfNeeded,
  shouldCompact,
  type CompactionResult,
} from "./ConversationMemory"

const SYSTEM_PROMPT_ESTIMATE_TOKENS = 2000

export interface MaybeCompactSessionMessagesParams {
  sessionId: string
  messageId: string
  model: string
  apiKey: string | null
  sessionMessages: ChatMessage[]
  sendCompactionNotification: (
    params: CompactingNotification["params"]
  ) => Effect.Effect<void, never>
  replaceSessionMessages: (messages: ChatMessage[]) => Effect.Effect<void, never>
  shouldCompactFn?: typeof shouldCompact
  compactIfNeededFn?: typeof compactIfNeeded
}

export const maybeCompactSessionMessages = (
  params: MaybeCompactSessionMessagesParams
): Effect.Effect<ChatMessage[], never> =>
  Effect.gen(function* () {
    const apiKey = params.apiKey
    if (!apiKey || params.sessionMessages.length === 0) {
      return params.sessionMessages
    }

    const shouldCompactImpl = params.shouldCompactFn ?? shouldCompact
    const compactIfNeededImpl = params.compactIfNeededFn ?? compactIfNeeded
    const needsCompact = shouldCompactImpl(
      SYSTEM_PROMPT_ESTIMATE_TOKENS,
      params.sessionMessages
    )

    if (needsCompact) {
      yield* params.sendCompactionNotification({
        messageId: params.messageId,
        phase: "start",
      })
    }

    const compactionResult = yield* Effect.tryPromise({
      try: () =>
        compactIfNeededImpl(
          params.sessionMessages,
          SYSTEM_PROMPT_ESTIMATE_TOKENS,
          apiKey,
          params.model
        ),
      catch: (error) => {
        console.error("[ChatProcessor] Compaction error:", error)
        return error instanceof Error ? error : new Error(String(error))
      },
    }).pipe(Effect.catchAll(() => Effect.succeed<CompactionResult | null>(null)))

    if (compactionResult?.compacted) {
      yield* params.replaceSessionMessages(compactionResult.messages)
      console.log(
        `[ChatProcessor] Session ${params.sessionId} compacted: ` +
          `${compactionResult.messagesCompacted} messages summarized, ` +
          `~${Math.round(compactionResult.tokensBefore / 1000)}K -> ` +
          `~${Math.round(compactionResult.tokensAfter / 1000)}K tokens`
      )

      yield* params.sendCompactionNotification({
        messageId: params.messageId,
        phase: "done",
        messagesCompacted: compactionResult.messagesCompacted,
      })

      return compactionResult.messages
    }

    if (needsCompact) {
      // Compaction was expected but didn't happen - clear indicator.
      yield* params.sendCompactionNotification({
        messageId: params.messageId,
        phase: "done",
      })
    }

    return params.sessionMessages
  })
