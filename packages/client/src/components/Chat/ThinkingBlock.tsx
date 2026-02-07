import { useState, useEffect, useRef, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { SPRING, SMOOTH } from "./animation"
import { ChevronIcon } from "./icons"

// ============================================================================
// Types
// ============================================================================

interface ThinkingBlockProps {
  content: string
  isStreaming?: boolean
  /** Auto-collapse after streaming finishes */
  autoCollapse?: boolean
}

// ============================================================================
// Sparkle Icon
// ============================================================================

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 11a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 11zm5-3a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM5 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 5 8zm6.354-3.354a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708-.708l1.5-1.5a.5.5 0 0 1 .708 0zm-8 5a.5.5 0 0 1 0 .708l-1.5 1.5a.5.5 0 0 1-.708-.708l1.5-1.5a.5.5 0 0 1 .708 0zm8 0a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 0 1 .708-.708l1.5 1.5a.5.5 0 0 1 0 .708zm-8-5a.5.5 0 0 1-.708 0l-1.5-1.5a.5.5 0 1 1 .708-.708l1.5 1.5a.5.5 0 0 1 0 .708z" />
    </svg>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Collapsible thinking/reasoning block with smooth animations.
 * Shows the AI's reasoning process in a subtle, non-intrusive way.
 */
export function ThinkingBlock({
  content,
  isStreaming,
  autoCollapse = true,
}: ThinkingBlockProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [wasStreaming, setWasStreaming] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  // Auto-collapse shortly after streaming ends
  useEffect(() => {
    if (isStreaming) {
      setWasStreaming(true)
      setIsExpanded(true)
    } else if (wasStreaming && autoCollapse) {
      const timer = setTimeout(() => setIsExpanded(false), 800)
      return () => clearTimeout(timer)
    }
  }, [isStreaming, wasStreaming, autoCollapse])

  const wordCount = useMemo(() => {
    return content.split(/\s+/).filter(Boolean).length
  }, [content])

  const collapsedPreview = useMemo(() => {
    const cleaned = content.replace(/\n+/g, " ").trim()
    if (cleaned.length <= 80) return cleaned
    return cleaned.slice(0, 80).trim() + "…"
  }, [content])

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={SPRING}
      className={`thinking-block ${isStreaming ? "thinking-block--streaming" : ""}`}
    >
      {/* Toggle header */}
      <motion.button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left group"
        whileTap={{ scale: 0.99 }}
      >
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className="text-ink-400 flex-shrink-0"
        >
          <ChevronIcon className="w-3 h-3" />
        </motion.span>

        <SparkleIcon className="w-3 h-3 text-ink-400 flex-shrink-0" />

        <span className="text-[11px] uppercase tracking-wider font-medium text-ink-400">
          Thinking
        </span>

        {isStreaming && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex gap-0.5 ml-1"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="w-1 h-1 rounded-full bg-ink-400"
                animate={{ opacity: [0.3, 0.8, 0.3] }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.1,
                  ease: "easeInOut",
                }}
              />
            ))}
          </motion.span>
        )}

        {!isExpanded && (
          <span className="text-[10px] text-ink-300 ml-auto">
            {wordCount} words
          </span>
        )}
      </motion.button>

      {/* Content */}
      <AnimatePresence mode="wait">
        {isExpanded ? (
          <motion.div
            key="expanded"
            ref={contentRef}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 pt-0.5">
              <p className="text-[12px] leading-relaxed text-ink-500 whitespace-pre-wrap">
                {content}
                {isStreaming && (
                  <motion.span
                    className="inline-block w-0.5 h-3 ml-0.5 bg-ink-400"
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                )}
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="collapsed"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 pt-0.5 relative">
              <p className="text-[12px] leading-relaxed text-ink-400 truncate">
                {collapsedPreview}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
