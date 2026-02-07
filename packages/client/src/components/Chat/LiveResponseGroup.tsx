import type { ReactNode } from "react"
import { motion } from "framer-motion"
import { AgentIcon } from "./icons"
import { SMOOTH } from "./animation"

interface LiveResponseGroupProps {
  /** Whether the agent is actively processing (shows activity dots) */
  isActive: boolean
  /** Timestamp pinned when loading started */
  timestamp: number
  children: ReactNode
}

/**
 * Provides assistant identity (avatar + "Agent" + time + activity dots)
 * for the live response area. Mirrors ChatMessageGroup's header but
 * accepts children instead of a messages array, so thinking blocks,
 * tool cards, typing indicator, and streaming content all render
 * inside a single visually-owned group.
 */
export function LiveResponseGroup({
  isActive,
  timestamp,
  children,
}: LiveResponseGroupProps) {
  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, transition: { duration: 0.15 } }}
      transition={SMOOTH}
      className="message-group"
    >
      {/* Header: icon + role + timestamp + activity dots */}
      <motion.div
        className="flex items-center gap-2 mb-2"
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ ...SMOOTH, delay: 0.05 }}
      >
        <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-gradient-to-br from-ink-200 to-ink-300 text-ink-600">
          <AgentIcon />
        </div>
        <span className="text-[11px] font-semibold tracking-wide text-ink-500">
          Agent
        </span>
        <span className="text-[10px] text-ink-300">{timeStr}</span>

        {isActive && (
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
      <div className="pl-8">{children}</div>
    </motion.div>
  )
}
