import { useState, useMemo, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { ToolExecutionCard } from "./ToolExecutionCard"
import { SPRING, SMOOTH } from "./animation"
import { ChevronIcon, CheckIcon } from "./icons"

// ============================================================================
// Types
// ============================================================================

interface ToolGroupProps {
  tools: ToolExecution[]
  /** Open tool output in sidebar */
  onOpenSidebar?: (title: string, content: string) => void
  /** Threshold for auto-collapsing (default: 3) */
  collapseThreshold?: number
}

// ============================================================================
// Component
// ============================================================================

/**
 * Collapsible group for completed tools.
 * Shows compact summary when collapsed, expandable to see individual tools.
 * Only collapses when all tools are done and count exceeds threshold.
 */
export function ToolGroup({
  tools,
  onOpenSidebar,
  collapseThreshold = 3,
}: ToolGroupProps) {
  const allDone = tools.every((t) => t.status !== "running")
  const shouldCollapse = allDone && tools.length > collapseThreshold
  
  const [isExpanded, setIsExpanded] = useState(!shouldCollapse)
  
  // Calculate summary stats
  const summary = useMemo(() => {
    const completed = tools.filter((t) => t.status === "completed").length
    const errors = tools.filter((t) => t.status === "error").length
    return { completed, errors, total: tools.length }
  }, [tools])

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev)
  }, [])

  // If still running or below threshold, show all tools normally
  if (!shouldCollapse) {
    return (
      <div className={allDone ? "flex flex-wrap gap-1.5" : "space-y-1.5"}>
        {tools.map((tool, index) => (
          <ToolExecutionCard
            key={tool.id}
            tool={tool}
            compact={allDone}
            staggerIndex={index}
            totalTools={tools.length}
            onOpenSidebar={onOpenSidebar}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Collapsed summary / toggle button */}
      <motion.button
        layout
        onClick={handleToggle}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border
          bg-emerald-500/10 border-emerald-500/20 text-emerald-400
          hover:bg-emerald-500/15 transition-colors cursor-pointer"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <CheckIcon className="w-3 h-3" />
        <span className="font-medium">
          {summary.total} tool{summary.total !== 1 ? "s" : ""} completed
        </span>
        {summary.errors > 0 && (
          <span className="text-red-400 opacity-80">
            ({summary.errors} error{summary.errors !== 1 ? "s" : ""})
          </span>
        )}
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={SPRING}
          className="ml-0.5"
        >
          <ChevronIcon className="w-3 h-3" />
        </motion.span>
      </motion.button>

      {/* Expanded tool list */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SMOOTH}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-1.5 pt-1">
              {tools.map((tool, index) => (
                <ToolExecutionCard
                  key={tool.id}
                  tool={tool}
                  compact
                  staggerIndex={index}
                  totalTools={tools.length}
                  onOpenSidebar={onOpenSidebar}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
