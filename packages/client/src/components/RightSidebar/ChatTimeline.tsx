import { memo, useState, useRef, useCallback, useEffect } from "react"
import type { ChatMessage } from "@bibboy/shared"
import { useChatData } from "./sidebarContext"

// ============================================================================
// Types
// ============================================================================

interface TooltipState {
  readonly visible: boolean
  readonly content: string
  readonly role: "user" | "assistant" | "system"
  readonly y: number
}

// ============================================================================
// Constants
// ============================================================================

const MAX_PREVIEW_LENGTH = 120
const DOT_SPACING = 36
/**
 * Top offset for the first dot – matches center column's paper-card
 * internal padding (lg:py-10 = 40px) so the timeline aligns with content.
 */
const TIMELINE_TOP_OFFSET = 40

/** Right edge of the dot center from the container's right edge */
const TIMELINE_RIGHT = 20
/** Dot diameter */
const DOT_SIZE = 10
/** Connector line width */
const CONNECTOR_W = 24

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + "…"
}

// ============================================================================
// Component
// ============================================================================

export const ChatTimeline = memo(function ChatTimeline() {
  const { messages, isTyping } = useChatData()
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    content: "",
    role: "user",
    y: 0,
  })
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleMouseEnter = useCallback(
    (msg: ChatMessage, index: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      setTooltip({
        visible: true,
        content: truncate(msg.content, MAX_PREVIEW_LENGTH),
        role: msg.role as "user" | "assistant",
        y: TIMELINE_TOP_OFFSET + index * DOT_SPACING,
      })
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setTooltip((prev) => ({ ...prev, visible: false }))
    }, 150)
  }, [])

  const timelineHeight =
    TIMELINE_TOP_OFFSET +
    messages.length * DOT_SPACING +
    (isTyping ? DOT_SPACING : 0) +
    20

  if (messages.length === 0 && !isTyping) {
    return (
      <div className="flex flex-col items-end pr-6 pt-6 h-full opacity-40">
        <span className="font-mono text-[9px] text-[#AAAAAA] uppercase tracking-[0.15em]">
          Timeline
        </span>
        <div className="mt-4 mr-[14px] w-px h-12 bg-[#E8E8E8]" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative h-full">
      {/* Label — right-aligned with timeline axis */}
      <span
        className="absolute font-mono text-[9px] text-[#AAAAAA] uppercase tracking-[0.15em]"
        style={{
          right: TIMELINE_RIGHT - DOT_SIZE / 2,
          top: TIMELINE_TOP_OFFSET - 22,
        }}
      >
        Timeline
      </span>

      {/* Timeline vertical line — centered on dot axis */}
      <div
        className="absolute w-px bg-[#E8E8E8]"
        style={{
          right: TIMELINE_RIGHT,
          top: TIMELINE_TOP_OFFSET,
          height: timelineHeight - TIMELINE_TOP_OFFSET,
        }}
      />

      {/* Message dots */}
      {messages.map((msg, i) => {
        const isUser = msg.role === "user"
        const dotY = TIMELINE_TOP_OFFSET + i * DOT_SPACING

        return (
          <div
            key={msg.id}
            className="absolute group cursor-pointer"
            style={{ top: dotY - DOT_SIZE / 2, right: 0 }}
            onMouseEnter={() => handleMouseEnter(msg, i)}
            onMouseLeave={handleMouseLeave}
          >
            {/* Dot — centered on timeline axis */}
            <div
              className={`absolute rounded-full border-2 transition-all duration-200 ${
                isUser
                  ? "border-[#0066CC] bg-[#0066CC]"
                  : "border-[#CCCCCC] bg-white"
              } group-hover:border-[#0066CC] group-hover:scale-125 group-hover:shadow-[0_0_6px_rgba(0,102,204,0.3)]`}
              style={{
                width: DOT_SIZE,
                height: DOT_SIZE,
                right: TIMELINE_RIGHT - DOT_SIZE / 2,
                top: 0,
              }}
            />

            {/* Horizontal connector line — extends left from the dot */}
            <div
              className={`absolute h-px transition-all duration-200 ${
                isUser ? "bg-[#0066CC]/30" : "bg-[#E8E8E8]"
              } group-hover:bg-[#0066CC]/60`}
              style={{
                width: CONNECTOR_W,
                right: TIMELINE_RIGHT + DOT_SIZE / 2 + 2,
                top: DOT_SIZE / 2,
              }}
            />
          </div>
        )
      })}

      {/* Typing indicator dot */}
      {isTyping && (
        <div
          className="absolute"
          style={{
            top: TIMELINE_TOP_OFFSET + messages.length * DOT_SPACING - DOT_SIZE / 2,
            right: TIMELINE_RIGHT - DOT_SIZE / 2,
          }}
        >
          <div
            className="rounded-full border-2 border-[#0066CC]/40 bg-[#0066CC]/20 animate-pulse"
            style={{ width: DOT_SIZE, height: DOT_SIZE }}
          />
        </div>
      )}

      {/* Hover tooltip */}
      <div
        className={`absolute max-w-[180px] pointer-events-none transition-all duration-200 ${
          tooltip.visible
            ? "opacity-100 translate-x-0"
            : "opacity-0 translate-x-1"
        }`}
        style={{
          top: tooltip.y - 8,
          right: TIMELINE_RIGHT + DOT_SIZE / 2 + CONNECTOR_W + 10,
        }}
      >
        <div className="bg-white border border-[#E8E8E8] shadow-[0_2px_8px_rgba(0,0,0,0.08)] px-3 py-2 rounded-sm">
          {/* Role label */}
          <span
            className={`font-mono text-[8px] uppercase tracking-[0.15em] block mb-1 ${
              tooltip.role === "user" ? "text-[#0066CC]" : "text-[#999999]"
            }`}
          >
            {tooltip.role}
          </span>
          {/* Message preview */}
          <p className="text-[11px] text-[#444444] leading-[1.5] break-words">
            {tooltip.content}
          </p>
        </div>
        {/* Arrow pointing right */}
        <div className="absolute right-[-4px] top-3 w-2 h-2 bg-white border-r border-b border-[#E8E8E8] rotate-[-45deg]" />
      </div>
    </div>
  )
})
