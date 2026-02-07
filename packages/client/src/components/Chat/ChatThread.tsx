import { useRef, useEffect, useMemo, useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ChatMessage as ChatMessageType, ToolResult } from "@bibboy/shared"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { ChatMessageGroup } from "./ChatMessageGroup"
import { LiveResponseGroup } from "./LiveResponseGroup"
import { ChatBubble } from "./ChatBubble"
import { TypingIndicator } from "./TypingIndicator"
import { ToolCard } from "./ToolCard"
import { ToolExecutionCard } from "./ToolExecutionCard"
import { ThinkingBlock } from "./ThinkingBlock"
import { SPRING, SMOOTH, CROSSFADE } from "./animation"
import { extractThinking } from "@/utils/format"

// ============================================================================
// Types
// ============================================================================

/** Map of message ID to its associated tool executions */
type MessageToolsMap = Map<string, ToolExecution[]>

interface ChatThreadProps {
  messages: ChatMessageType[]
  isLoading: boolean
  stream?: string | null
  error?: string | null
  toolResults?: ToolResult[] | null
  messageToolsMap?: MessageToolsMap
  activeTools?: ToolExecution[]
  /** Open tool output in sidebar (OpenClaw pattern) */
  onOpenSidebar?: (title: string, content: string) => void
}

// ============================================================================
// Turn Grouping
// ============================================================================

/** A single conversational turn: user prompt + assistant reply */
interface ConversationTurn {
  id: string
  user: ChatMessageType[]
  assistant: ChatMessageType[]
  timestamp: number
}

/**
 * Group flat message list into user→assistant turns for block rendering.
 * System messages are skipped. Consecutive same-role messages merge into
 * the same slot of the current turn.
 */
function groupIntoTurns(messages: ChatMessageType[]): ConversationTurn[] {
  const turns: ConversationTurn[] = []
  let current: ConversationTurn | null = null

  for (const msg of messages) {
    if (msg.role === "system") continue

    if (msg.role === "user") {
      current = {
        id: `turn-${msg.id}`,
        user: [msg],
        assistant: [],
        timestamp: msg.timestamp,
      }
      turns.push(current)
    } else if (msg.role === "assistant") {
      if (!current) {
        // Orphan assistant message (e.g. greeting)
        current = {
          id: `turn-${msg.id}`,
          user: [],
          assistant: [msg],
          timestamp: msg.timestamp,
        }
        turns.push(current)
      } else {
        current.assistant.push(msg)
      }
    }
  }

  return turns
}

// ============================================================================
// Auto-scroll Hook
// ============================================================================

function useAutoScroll(deps: unknown[]) {
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRAF = useRef<number | null>(null)
  const [userScrolled, setUserScrolled] = useState(false)
  const lastScrollTop = useRef(0)

  const getScrollContainer = useCallback(
    () => containerRef.current?.closest(".overflow-y-auto") as HTMLElement | null,
    [],
  )

  const handleScroll = useCallback(() => {
    const el = getScrollContainer()
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100

    if (scrollTop < lastScrollTop.current - 10 && !isNearBottom) {
      setUserScrolled(true)
    } else if (isNearBottom) {
      setUserScrolled(false)
    }
    lastScrollTop.current = scrollTop
  }, [getScrollContainer])

  useEffect(() => {
    const el = getScrollContainer()
    if (!el) return
    el.addEventListener("scroll", handleScroll, { passive: true })
    return () => el.removeEventListener("scroll", handleScroll)
  }, [getScrollContainer, handleScroll])

  const scrollToBottom = useCallback(() => {
    if (userScrolled) return
    if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current)

    scrollRAF.current = requestAnimationFrame(() => {
      const el = getScrollContainer()
      if (!el) return
      const { scrollTop, scrollHeight, clientHeight } = el
      const target = scrollHeight - clientHeight
      const distance = target - scrollTop

      if (distance > 0 && distance < 500) {
        el.scrollTop = scrollTop + distance * 0.35
        if (target - el.scrollTop > 1) {
          scrollRAF.current = requestAnimationFrame(() => scrollToBottom())
        }
      } else if (distance > 0) {
        el.scrollTop = target
      }
    })
  }, [getScrollContainer, userScrolled])

  useEffect(() => {
    return () => {
      if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current)
    }
  }, [])

  // Re-run scroll when dependencies change
  // deps is intentionally passed as a spread to allow flexible caller control
  useEffect(() => scrollToBottom(), deps)

  return containerRef
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main chat thread with turn-based block rendering and auto-scroll.
 *
 * Messages are grouped into conversational turns (user prompt → assistant reply)
 * so each exchange is visually distinct. Active tool calls, thinking, and the
 * streaming response are rendered below the last completed turn.
 */
export function ChatThread({
  messages,
  isLoading,
  stream,
  error,
  toolResults,
  messageToolsMap,
  activeTools,
  onOpenSidebar,
}: ChatThreadProps) {
  const containerRef = useAutoScroll([messages, isLoading, stream, activeTools])

  const turns = useMemo(() => groupIntoTurns(messages), [messages])

  const streamThinking = useMemo(() => {
    if (!stream) return null
    return extractThinking(stream)
  }, [stream])

  const hasRunningTools = activeTools?.some((t) => t.status === "running") ?? false
  const allToolsDone = activeTools
    ? activeTools.every((t) => t.status !== "running")
    : true

  // Pin the live response timestamp when loading starts so the header
  // doesn't flicker as Date.now() changes during streaming.
  const liveTimestampRef = useRef(Date.now())
  const isLiveActive = isLoading || !!stream || (activeTools != null && activeTools.length > 0)
  if (isLiveActive && liveTimestampRef.current === 0) {
    liveTimestampRef.current = Date.now()
  } else if (!isLiveActive) {
    liveTimestampRef.current = 0
  }
  const liveTimestamp = liveTimestampRef.current || Date.now()

  return (
    <div
      ref={containerRef}
      className="min-h-[120px]"
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
    >
      <div className="space-y-0">
        {/* Completed turns */}
        <AnimatePresence mode="popLayout" initial={false}>
          {turns.map((turn, turnIdx) => {
            const lastAssistantId = turn.assistant[turn.assistant.length - 1]?.id
            const turnTools =
              lastAssistantId && messageToolsMap?.get(lastAssistantId)
                ? messageToolsMap.get(lastAssistantId)!
                : []

            return (
              <motion.div
                key={turn.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SMOOTH}
                className="chat-turn"
              >
                {turnIdx > 0 && (
                  <motion.div
                    className="chat-turn-divider"
                    initial={{ opacity: 0, scaleX: 0.3 }}
                    animate={{ opacity: 0.6, scaleX: 1 }}
                    transition={SMOOTH}
                    style={{ transformOrigin: "left" }}
                  />
                )}

                {turn.user.length > 0 && (
                  <div className="chat-turn-block">
                    <ChatMessageGroup role="user" messages={turn.user} />
                  </div>
                )}

                {turn.assistant.length > 0 && (
                  <div className="chat-turn-block">
                    <ChatMessageGroup
                      role="assistant"
                      messages={turn.assistant}
                      tools={turnTools}
                      onOpenSidebar={onOpenSidebar}
                    />
                  </div>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {/* Live response area — in-progress turn */}
        {(isLoading || stream || (activeTools && activeTools.length > 0)) && (
          <div className="chat-turn">
            {turns.length > 0 && (
              <motion.div
                className="chat-turn-divider"
                initial={{ opacity: 0, scaleX: 0.3 }}
                animate={{ opacity: 0.6, scaleX: 1 }}
                transition={SMOOTH}
                style={{ transformOrigin: "left" }}
              />
            )}

            <div className="chat-turn-block">
              <LiveResponseGroup
                isActive={isLoading || hasRunningTools}
                timestamp={liveTimestamp}
              >
                {/* Accumulating content: thinking, tools, tool results */}
                <AnimatePresence mode="sync">
                  {streamThinking && (
                    <motion.div
                      key="thinking"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={SMOOTH}
                      className="mb-2"
                    >
                      <ThinkingBlock content={streamThinking} isStreaming={isLoading} />
                    </motion.div>
                  )}

                  {activeTools && activeTools.length > 0 && (
                    <motion.div
                      key="active-tools"
                      layout
                      className={`mb-2 ${
                        allToolsDone ? "flex flex-wrap gap-2" : "space-y-2"
                      }`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={SMOOTH}
                    >
                      {activeTools.map((tool, index) => (
                        <ToolExecutionCard
                          key={tool.id}
                          tool={tool}
                          compact={allToolsDone}
                          staggerIndex={index}
                          totalTools={activeTools.length}
                          onOpenSidebar={onOpenSidebar}
                        />
                      ))}
                    </motion.div>
                  )}

                  {toolResults && toolResults.length > 0 && (
                    <motion.div
                      key="tool-results"
                      className="mb-2 space-y-3"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={SMOOTH}
                    >
                      {toolResults.map((result, index) => (
                        <ToolCard key={`tool-${index}`} result={result} />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Mutually exclusive states: typing indicator OR stream content */}
                <AnimatePresence mode="wait">
                  {isLoading && !stream && !hasRunningTools && (
                    <motion.div
                      key="typing"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={CROSSFADE}
                    >
                      <TypingIndicator />
                    </motion.div>
                  )}

                  {stream && (
                    <motion.div
                      key="stream"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={CROSSFADE}
                      className="chat-bubble-streaming"
                    >
                      <ChatBubble
                        content={stream}
                        isUser={false}
                        isStreaming
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </LiveResponseGroup>
            </div>
          </div>
        )}

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, x: -8, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -4 }}
              transition={SPRING}
              className="pl-8 border-l-2 border-accent-rust pl-4 py-2 text-sm text-accent-rust"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="h-4" />
    </div>
  )
}
