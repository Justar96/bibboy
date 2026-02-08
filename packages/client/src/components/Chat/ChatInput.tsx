import { useState, useRef, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { SendIcon, CloseIcon } from "./icons"
import { SMOOTH, SPRING } from "./animation"

// ============================================================================
// Types
// ============================================================================

export type ConnectionState =
  | "connecting"
  | "connected"
  | "disconnected"
  | "reconnecting"

export interface ChatQueueItem {
  id: string
  text: string
  createdAt: number
}

interface ChatInputProps {
  onSend: (message: string) => void
  disabled?: boolean
  placeholder?: string
  /** Whether the agent is currently streaming/processing */
  isBusy?: boolean
  /** Abort the current generation */
  onAbort?: () => void
  /** Connection state for status display */
  connectionState?: ConnectionState
  /** Reconnect handler */
  onReconnect?: () => void
  /** Queued messages (sent while busy) */
  queue?: ChatQueueItem[]
  /** Remove a queued message */
  onQueueRemove?: (id: string) => void
}

// ============================================================================
// Component
// ============================================================================

/**
 * Chat input with auto-resize textarea and send button.
 * Automatically re-focuses after a response finishes (disabled→enabled transition)
 * using a short delay so the DOM settles first.
 */
export function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  isBusy = false,
  onAbort,
  connectionState = "connected",
  onReconnect,
  queue = [],
  onQueueRemove,
}: ChatInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const prevDisabledRef = useRef(disabled)

  // Re-focus on response finish (disabled: true → false)
  useEffect(() => {
    const wasDisabled = prevDisabledRef.current
    prevDisabledRef.current = disabled

    if (wasDisabled && !disabled) {
      // Short delay lets the browser settle any pending layout/scroll work
      const timer = setTimeout(() => {
        textareaRef.current?.focus({ preventScroll: true })
      }, 80)
      return () => clearTimeout(timer)
    }
  }, [disabled])

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return

    onSend(trimmed)
    setValue("")

    // Reset height and keep focus for rapid follow-ups
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
      textareaRef.current.focus({ preventScroll: true })
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const hasValue = value.trim().length > 0
  const canAbort = isBusy && onAbort
  const isDisconnected = connectionState !== "connected"

  const composePlaceholder = isDisconnected
    ? "Reconnect to start chatting…"
    : isBusy
      ? "Queue a follow-up… (↩ to queue)"
      : placeholder ?? "Write something..."

  return (
    <div className="relative">
      {/* Connection status bar */}
      <AnimatePresence>
        {isDisconnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SMOOTH}
            className="mb-2"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded text-[11px] text-amber-400">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="flex-1">
                {connectionState === "connecting" && "Connecting…"}
                {connectionState === "reconnecting" && "Reconnecting…"}
                {connectionState === "disconnected" && "Disconnected"}
              </span>
              {connectionState === "disconnected" && onReconnect && (
                <button
                  onClick={onReconnect}
                  className="font-medium hover:underline"
                >
                  Reconnect
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Message queue */}
      <AnimatePresence>
        {queue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SMOOTH}
            className="mb-2"
          >
            <div className="border border-paper-300 rounded-md overflow-hidden">
              <div className="px-3 py-1.5 bg-paper-100 border-b border-paper-300">
                <span className="text-[10px] font-medium uppercase tracking-wider text-ink-400">
                  Queued ({queue.length})
                </span>
              </div>
              <div className="divide-y divide-paper-200">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-1.5"
                  >
                    <span className="flex-1 text-xs text-ink-600 truncate">
                      {item.text}
                    </span>
                    {onQueueRemove && (
                      <button
                        onClick={() => onQueueRemove(item.id)}
                        className="flex-shrink-0 p-0.5 rounded hover:bg-paper-200 text-ink-400 hover:text-ink-600 transition-colors"
                        aria-label="Remove queued message"
                      >
                        <CloseIcon className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compose area */}
      <div className="flex items-end gap-2 border-b-2 border-paper-400 focus-within:border-ink-500 transition-colors duration-200">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={composePlaceholder}
          rows={1}
          className="flex-1 resize-none bg-transparent py-3 text-left text-ink-700 placeholder:text-left placeholder:text-gray-400 caret-gray-400 focus:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:outline-none focus:shadow-none disabled:opacity-50 disabled:cursor-not-allowed leading-relaxed"
        />

        <div className="flex items-center gap-1 mb-1.5">
          {/* Abort button (when busy) */}
          <AnimatePresence>
            {canAbort && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={SPRING}
                onClick={onAbort}
                className="flex-shrink-0 p-2 text-ink-400 hover:text-accent-rust transition-colors rounded-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-400 focus-visible:ring-offset-2"
                aria-label="Stop generation"
                title="Stop generation"
              >
                <StopIcon />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Send button */}
          <motion.button
            initial={false}
            animate={{ opacity: hasValue ? 1 : 0.3 }}
            whileHover={hasValue ? { y: -1 } : {}}
            whileTap={hasValue ? { y: 0 } : {}}
            onClick={handleSubmit}
            disabled={disabled || !hasValue}
            className="flex-shrink-0 p-2 text-ink-500 hover:text-ink-700 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ink-400 focus-visible:ring-offset-2 rounded-paper transition-colors"
            aria-label={isBusy ? "Queue message" : "Send message"}
          >
            <SendIcon />
          </motion.button>
        </div>
      </div>

      {/* Keyboard hint */}
      {hasValue && (
        <div className="mt-1 text-[10px] text-ink-300 text-right">
          {isBusy ? "↩ to queue" : "↩ send · ⇧↩ newline"}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Stop Icon
// ============================================================================

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  )
}
