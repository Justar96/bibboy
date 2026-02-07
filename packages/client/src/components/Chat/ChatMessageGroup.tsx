import { memo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ChatMessage as ChatMessageType } from "@bibboy/shared"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { ChatBubble } from "./ChatBubble"
import { ToolExecutionCard } from "./ToolExecutionCard"
import { SPRING, SMOOTH, STAGGER_DELAY } from "./animation"
import { UserIcon, AgentIcon } from "./icons"

// ============================================================================
// Types
// ============================================================================

interface ChatMessageGroupProps {
  role: "user" | "assistant"
  messages: ChatMessageType[]
  isStreaming?: boolean
  tools?: ToolExecution[]
  /** Open tool output in sidebar */
  onOpenSidebar?: (title: string, content: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * A group of consecutive messages from the same sender.
 * Tools are shown above the response text (they ran first).
 * Memoized to prevent unnecessary re-renders during streaming.
 */
export const ChatMessageGroup = memo(function ChatMessageGroup({
  role,
  messages,
  isStreaming = false,
  tools = [],
  onOpenSidebar,
}: ChatMessageGroupProps) {
  const isUser = role === "user"
  const timestamp = messages[0]?.timestamp ?? Date.now()

  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  const hasTools = tools.length > 0
  const allToolsDone = tools.every((t) => t.status !== "running")

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={SPRING}
      className="message-group"
    >
      {/* Header: icon + role + timestamp */}
      <motion.div
        className="flex items-center gap-2 mb-2"
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SMOOTH, delay: 0.05 }}
      >
        <div
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
            isUser
              ? "bg-ink-700 text-white"
              : "bg-gradient-to-br from-ink-200 to-ink-300 text-ink-600"
          }`}
        >
          {isUser ? <UserIcon /> : <AgentIcon />}
        </div>
        <span
          className={`text-[11px] font-semibold tracking-wide ${
            isUser ? "text-ink-700" : "text-ink-500"
          }`}
        >
          {isUser ? "You" : "Agent"}
        </span>
        <span className="text-[10px] text-ink-300">{timeStr}</span>

        {isStreaming && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-0.5 ml-0.5"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-ink-400"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.15,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.span>
        )}
      </motion.div>

      {/* Content — indented to align with header text */}
      <div className="pl-8">
        {/* Tools (rendered before message text since they executed first) */}
        <AnimatePresence mode="popLayout">
          {hasTools && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={SMOOTH}
              className={`mb-2.5 ${
                allToolsDone ? "flex flex-wrap gap-1.5" : "space-y-1.5"
              }`}
            >
              {tools.map((tool, index) => (
                <ToolExecutionCard
                  key={tool.id}
                  tool={tool}
                  compact={allToolsDone}
                  staggerIndex={index}
                  totalTools={tools.length}
                  onOpenSidebar={onOpenSidebar}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Messages — staggered entrance */}
        <div className="space-y-1">
          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...SMOOTH,
                delay: hasTools
                  ? 0.1 + index * STAGGER_DELAY
                  : index * STAGGER_DELAY,
              }}
            >
              <ChatBubble
                content={message.content}
                isUser={isUser}
                isStreaming={isStreaming && index === messages.length - 1}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
})
