import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { getToolStatusColor, resolveToolDisplay, type ToolExecutionResult } from "@bibboy/shared"
import { getTruncatedPreview, formatToolOutput, formatDurationMs, extractTextContent, type SearchResult } from "@/utils/format"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { SPRING, SPRING_GENTLE, SMOOTH, STAGGER_DELAY } from "./animation"
import { CheckIcon, ErrorIcon, SpinnerIcon } from "./icons"

// ============================================================================
// Types
// ============================================================================

interface ToolExecutionCardProps {
  tool: ToolExecution
  compact?: boolean
  onClick?: () => void
  isSelected?: boolean
  staggerIndex?: number
  totalTools?: number
  /** Open tool output in sidebar (OpenClaw pattern) */
  onOpenSidebar?: (title: string, content: string) => void
}

// ============================================================================
// Hooks
// ============================================================================

/** Live elapsed time counter for running tools */
function useElapsedTime(startedAt?: number, isRunning?: boolean): number {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!startedAt || !isRunning) {
      if (startedAt && !isRunning) {
        setElapsed(Date.now() - startedAt)
      }
      return
    }

    setElapsed(Date.now() - startedAt)
    const interval = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 100)

    return () => clearInterval(interval)
  }, [startedAt, isRunning])

  return elapsed
}

// ============================================================================
// Helpers
// ============================================================================

function formatToolResultCompact(
  toolName: string,
  result: ToolExecutionResult,
): string {
  const textContent = extractTextContent(result)
  if (!textContent) return ""

  try {
    const data = JSON.parse(textContent)
    if (toolName === "web_search" && Array.isArray(data.results))
      return `(${data.results.length})`
    if (toolName === "memory_search" && Array.isArray(data.matches))
      return `(${data.matches.length})`
  } catch {
    /* ignore */
  }
  return ""
}

// ============================================================================
// Sub-components
// ============================================================================

function ToolResultContent({
  toolName,
  result,
}: {
  toolName: string
  result: ToolExecutionResult
}) {
  const textContent = extractTextContent(result)
  if (!textContent) return <span>No results</span>

  try {
    const data = JSON.parse(textContent)

    if (toolName === "web_search" && Array.isArray(data.results)) {
      const results = data.results as SearchResult[]
      if (results.length === 0) return <span>No results found</span>

      return (
        <div className="space-y-1.5">
          {results.slice(0, 3).map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              {r.url ? (
                <LinkPreview
                  url={r.url}
                  className="text-accent-teal hover:underline font-medium"
                >
                  {r.title || new URL(r.url).hostname}
                </LinkPreview>
              ) : (
                <span className="font-medium">{r.title || "Result"}</span>
              )}
            </div>
          ))}
          {results.length > 3 && (
            <span className="text-ink-400">+{results.length - 3} more</span>
          )}
        </div>
      )
    }

    if (toolName === "web_fetch" && data.url) {
      return (
        <LinkPreview
          url={data.url}
          className="text-accent-teal hover:underline"
        >
          {data.title || new URL(data.url).hostname}
        </LinkPreview>
      )
    }

    if (toolName === "memory_search" && Array.isArray(data.matches)) {
      const count = data.matches.length
      return (
        <span>
          {count === 1 ? "Found 1 match" : `Found ${count} matches`}
        </span>
      )
    }

    return <span>{getTruncatedPreview(formatToolOutput(textContent))}</span>
  } catch {
    return <span>{getTruncatedPreview(textContent)}</span>
  }
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Visual card showing tool execution status (running -> completed -> error).
 * Config-driven display via resolveToolDisplay from shared package.
 */
export function ToolExecutionCard({
  tool,
  compact,
  onClick,
  isSelected,
  staggerIndex = 0,
  totalTools,
  onOpenSidebar,
}: ToolExecutionCardProps) {
  const [wasRunning, setWasRunning] = useState(tool.status === "running")
  const [showCheckmark, setShowCheckmark] = useState(false)

  const display = resolveToolDisplay({ name: tool.name, args: tool.arguments })
  const statusColor = getToolStatusColor(tool.name, tool.status)
  const elapsed = useElapsedTime(tool.startedAt, tool.status === "running")

  // Animate checkmark on running->completed transition
  useEffect(() => {
    if (tool.status === "running") {
      setWasRunning(true)
      setShowCheckmark(false)
    } else if (wasRunning && tool.status === "completed") {
      setShowCheckmark(true)
      const timer = setTimeout(() => setShowCheckmark(false), 1500)
      return () => clearTimeout(timer)
    }
  }, [tool.status, wasRunning])

  const staggerDelay = staggerIndex * STAGGER_DELAY

  // Build click handler: prefer sidebar, fall back to onClick
  const handleClick = useCallback(() => {
    if (onOpenSidebar && tool.status === "completed" && tool.result) {
      const textContent = extractTextContent(tool.result)
      const formatted = textContent ? formatToolOutput(textContent) : "No output — tool completed successfully."
      onOpenSidebar(display.label, formatted)
      return
    }
    onClick?.()
  }, [onOpenSidebar, onClick, tool.status, tool.result, display.label])

  const isClickable = Boolean(onClick || (onOpenSidebar && tool.status === "completed"))

  const elapsedLabel = elapsed > 0 ? formatDurationMs(elapsed) : null
  const stepLabel = totalTools && totalTools > 1 && staggerIndex !== undefined
    ? `${staggerIndex + 1}/${totalTools}`
    : null

  // ------------------------------------------------------------------
  // Compact chip (inline, for completed tool groups)
  // ------------------------------------------------------------------
  if (compact) {
    return (
      <motion.button
        layout
        layoutId={`tool-${tool.id}`}
        initial={{ opacity: 0, scale: 0.9, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -2 }}
        transition={{ ...SPRING, delay: staggerDelay }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        className={`tool-chip inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors
          ${statusColor}
          ${isClickable ? "cursor-pointer" : "cursor-default"}
          ${isSelected ? "ring-2 ring-offset-1 ring-ink-400" : ""}`}
      >
        <motion.span
          className="flex-shrink-0"
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          transition={SPRING}
        >
          {display.emoji}
        </motion.span>
        <span className="font-medium">{display.label}</span>
        {display.detail && (
          <span className="opacity-70 truncate max-w-[120px]">
            {display.detail}
          </span>
        )}

        <AnimatePresence>
          {showCheckmark && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={SPRING}
              className="text-green-600"
            >
              <CheckIcon className="w-3 h-3" />
            </motion.span>
          )}
        </AnimatePresence>

        {tool.status === "completed" && !showCheckmark && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.2 }}
            className="opacity-60 flex items-center gap-1"
          >
            {tool.result && formatToolResultCompact(tool.name, tool.result)}
            {elapsedLabel && (
              <span className="text-[10px] opacity-70">{elapsedLabel}</span>
            )}
          </motion.span>
        )}

        {stepLabel && (
          <span className="text-[10px] opacity-50 ml-0.5">{stepLabel}</span>
        )}
      </motion.button>
    )
  }

  // ------------------------------------------------------------------
  // Expanded card (for running / freshly completed tools)
  // ------------------------------------------------------------------
  return (
    <motion.div
      layout
      layoutId={`tool-${tool.id}`}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ ...SPRING_GENTLE, delay: staggerDelay }}
      onClick={handleClick}
      className={`tool-card w-full text-left border rounded-lg overflow-hidden transition-colors
        ${statusColor}
        ${isClickable ? "cursor-pointer hover:brightness-[0.97]" : "cursor-default"}
        ${isSelected ? "ring-2 ring-offset-1 ring-ink-400" : ""}
        ${tool.status === "running" ? "tool-card--running" : ""}`}
    >
      {/* Header */}
      <div className="px-3 py-2 flex items-center gap-2">
        <motion.span
          className="flex-shrink-0 text-sm"
          animate={
            tool.status === "running" ? { scale: [1, 1.1, 1] } : {}
          }
          transition={{
            duration: 1,
            repeat: tool.status === "running" ? Infinity : 0,
          }}
        >
          {display.emoji}
        </motion.span>
        <span className="text-xs font-semibold">{display.label}</span>

        {stepLabel && (
          <span className="text-[10px] text-ink-400 opacity-70">{stepLabel}</span>
        )}

        {tool.status === "running" && (
          <motion.span
            className="flex-shrink-0"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={SPRING}
          >
            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
          </motion.span>
        )}

        {display.detail && (
          <motion.span
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 0.7, x: 0 }}
            transition={{ ...SMOOTH, delay: 0.1 }}
            className="text-xs opacity-70 truncate flex-1"
          >
            {display.detail}
          </motion.span>
        )}

        {/* Elapsed time */}
        {elapsedLabel && (
          <span className="text-[10px] text-ink-400 opacity-60 ml-auto tabular-nums">
            {elapsedLabel}
          </span>
        )}

        {tool.status !== "running" && (
          <motion.span
            className={`flex-shrink-0 opacity-60${!elapsedLabel ? " ml-auto" : ""}`}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 0.6 }}
            transition={SPRING}
          >
            {tool.status === "completed" ? (
              <CheckIcon className="w-3.5 h-3.5" />
            ) : (
              <ErrorIcon className="w-3.5 h-3.5" />
            )}
          </motion.span>
        )}
      </div>

      {/* Raw arguments preview while running */}
      <AnimatePresence>
        {tool.status === "running" && tool.rawArguments && tool.rawArguments.length > 2 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="px-3 py-1.5 border-t border-current/10 bg-white/30">
              <pre className="text-[11px] leading-snug text-ink-500 font-mono truncate whitespace-pre overflow-hidden max-h-[3rem]">
                {tool.rawArguments.length > 200
                  ? tool.rawArguments.slice(0, 200) + "…"
                  : tool.rawArguments}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Result body */}
      <AnimatePresence>
        {tool.status === "completed" && tool.result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-current/10 bg-white/50 text-xs">
              <ToolResultContent toolName={tool.name} result={tool.result} />
            </div>
          </motion.div>
        )}

        {tool.status === "error" && tool.result?.error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="px-3 py-2 border-t border-current/10 bg-white/50 text-xs text-red-600">
              {tool.result.error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
