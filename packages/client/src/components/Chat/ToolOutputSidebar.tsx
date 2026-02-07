import { useCallback, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChatContent } from "./ChatContent"
import { CloseIcon, CopyIcon, CheckIcon } from "./icons"
import { SMOOTH, SPRING } from "./animation"
import { useState } from "react"

// ============================================================================
// Types
// ============================================================================

export interface SidebarContent {
  /** Title for the sidebar header */
  title: string
  /** Raw text content (may be markdown) */
  content: string
  /** Optional error to display */
  error?: string | null
}

interface ToolOutputSidebarProps {
  /** Content to display, or null when closed */
  content: SidebarContent | null
  /** Close handler */
  onClose: () => void
  /** Current split ratio (0-1, portion for main content) */
  splitRatio?: number
  /** Callback when user drags the divider */
  onSplitRatioChange?: (ratio: number) => void
}

// ============================================================================
// Resizable Divider
// ============================================================================

function ResizableDivider({
  onDrag,
}: {
  onDrag: (deltaX: number) => void
}) {
  const dragging = useRef(false)
  const lastX = useRef(0)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      dragging.current = true
      lastX.current = e.clientX
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    },
    [],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      const dx = e.clientX - lastX.current
      lastX.current = e.clientX
      onDrag(dx)
    },
    [onDrag],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  return (
    <div
      className="flex-shrink-0 w-1.5 cursor-col-resize group relative"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="absolute inset-y-0 left-0 right-0 bg-paper-300 group-hover:bg-ink-300 group-active:bg-ink-400 transition-colors rounded-full" />
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Slide-in sidebar for viewing tool outputs, markdown content, etc.
 * Inspired by OpenClaw's markdown sidebar with resizable divider.
 */
export function ToolOutputSidebar({
  content,
  onClose,
  splitRatio = 0.6,
  onSplitRatioChange,
}: ToolOutputSidebarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Handle keyboard shortcut to close
  useEffect(() => {
    if (!content) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [content, onClose])

  const handleCopy = useCallback(async () => {
    if (!content?.content) return
    try {
      await navigator.clipboard.writeText(content.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [content?.content])

  const handleDrag = useCallback(
    (deltaX: number) => {
      if (!onSplitRatioChange || !containerRef.current) return
      const parentWidth = containerRef.current.parentElement?.clientWidth ?? 1
      const ratioDelta = deltaX / parentWidth
      const next = Math.max(0.3, Math.min(0.8, splitRatio + ratioDelta))
      onSplitRatioChange(next)
    },
    [splitRatio, onSplitRatioChange],
  )

  return (
    <AnimatePresence>
      {content && (
        <>
          <ResizableDivider onDrag={handleDrag} />
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 16 }}
            transition={SMOOTH}
            className="flex flex-col overflow-hidden"
            style={{ flex: `0 0 ${(1 - splitRatio) * 100}%` }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-paper-300">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">
                {content.title}
              </h3>
              <div className="flex items-center gap-1">
                <motion.button
                  onClick={handleCopy}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="p-1 rounded hover:bg-paper-200 text-ink-400 hover:text-ink-600 transition-colors"
                  title="Copy content"
                >
                  {copied ? (
                    <CheckIcon className="w-3.5 h-3.5" />
                  ) : (
                    <CopyIcon className="w-3.5 h-3.5" />
                  )}
                </motion.button>
                <button
                  onClick={onClose}
                  className="p-1 rounded hover:bg-paper-200 text-ink-400 hover:text-ink-600 transition-colors"
                  aria-label="Close sidebar"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Error */}
            {content.error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={SPRING}
                className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700"
              >
                {content.error}
              </motion.div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-y-auto pr-1">
              <div className="text-xs">
                <ChatContent content={content.content} />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default ToolOutputSidebar
