import { motion } from "framer-motion"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { getToolDisplay } from "@bibboy/shared"
import { ChatContent } from "./ChatContent"
import { CloseIcon, SpinnerIcon, ToolIcon } from "./icons"

// ============================================================================
// Types
// ============================================================================

interface ToolDetailPanelProps {
  tool: ToolExecution
  onClose: () => void
}

// ============================================================================
// Helpers
// ============================================================================

function truncateValue(value: string, maxLen: number): string {
  return value.length <= maxLen ? value : value.slice(0, maxLen) + "..."
}

function formatResultForDisplay(toolName: string, text?: string): string {
  if (!text) return ""

  try {
    const data = JSON.parse(text)

    if (toolName === "web_search" && Array.isArray(data.results)) {
      return data.results
        .slice(0, 10)
        .map(
          (r: { title?: string; url?: string; snippet?: string }) =>
            `- **${r.title || "Result"}**${r.url ? ` - [${new URL(r.url).hostname}](${r.url})` : ""}\n  ${r.snippet || ""}`,
        )
        .join("\n")
    }

    if (toolName === "web_fetch") {
      let result = ""
      if (data.title) result += `# ${data.title}\n\n`
      if (data.url) result += `[${new URL(data.url).hostname}](${data.url})\n\n`
      if (data.content || data.markdown || data.text) {
        const content = data.content || data.markdown || data.text
        result +=
          typeof content === "string"
            ? content.slice(0, 2000)
            : JSON.stringify(content)
      }
      return result
    }

    if (toolName === "memory_search" && Array.isArray(data.matches)) {
      if (data.matches.length === 0) return "No matches found."
      return data.matches
        .slice(0, 5)
        .map(
          (m: { content?: string; score?: number }, i: number) =>
            `${i + 1}. ${m.content?.slice(0, 200) || "Match"}${m.score ? ` (${(m.score * 100).toFixed(0)}%)` : ""}`,
        )
        .join("\n\n")
    }

    return (
      "```json\n" +
      JSON.stringify(data, null, 2).slice(0, 2000) +
      "\n```"
    )
  } catch {
    return text.slice(0, 2000)
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Expanded detail view for a selected tool execution.
 * Shows full arguments and result content.
 */
export function ToolDetailPanel({ tool, onClose }: ToolDetailPanelProps) {
  const config = getToolDisplay(tool.name)

  const statusBadge = {
    running: { label: "Running", cls: "bg-amber-100 text-amber-700" },
    completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
    error: { label: "Error", cls: "bg-red-100 text-red-700" },
  }[tool.status]

  const resultText = tool.result?.content
    ?.filter(
      (b): b is { type: "text"; text: string } => b.type === "text",
    )
    .map((b) => b.text)
    .join("\n")

  const formattedResult = formatResultForDisplay(tool.name, resultText)

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.15 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-ink-100">
        <div className="flex items-center gap-2">
          <ToolIcon name={config.icon} className="w-4 h-4 text-ink-500" />
          <h3 className="text-sm font-medium text-ink-700">{config.label}</h3>
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusBadge.cls}`}
          >
            {statusBadge.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-ink-100 transition-colors text-ink-400 hover:text-ink-600"
          aria-label="Close detail panel"
        >
          <CloseIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Arguments */}
      <div className="mb-4">
        <h4 className="text-[11px] font-medium text-ink-400 uppercase tracking-wide mb-2">
          Arguments
        </h4>
        <div className="bg-ink-50 rounded-md p-3 text-xs font-mono overflow-x-auto">
          {Object.entries(tool.arguments).map(([key, value]) => (
            <div key={key} className="flex gap-2 mb-1 last:mb-0">
              <span className="text-ink-500 flex-shrink-0">{key}:</span>
              <span className="text-ink-700 break-all">
                {typeof value === "string"
                  ? truncateValue(value, 200)
                  : JSON.stringify(value)}
              </span>
            </div>
          ))}
          {Object.keys(tool.arguments).length === 0 && (
            <span className="text-ink-400 italic">No arguments</span>
          )}
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-auto">
        <h4 className="text-[11px] font-medium text-ink-400 uppercase tracking-wide mb-2">
          Result
        </h4>

        {tool.status === "running" && (
          <div className="flex items-center gap-2 text-sm text-ink-500">
            <SpinnerIcon className="w-4 h-4 animate-spin" />
            <span>Executing...</span>
          </div>
        )}

        {tool.status === "error" && tool.result?.error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
            {tool.result.error}
          </div>
        )}

        {tool.status === "completed" && formattedResult && (
          <div className="bg-white border border-ink-100 rounded-md p-3 text-xs overflow-auto max-h-[400px]">
            <div className="chat-content prose prose-sm max-w-none">
              <ChatContent content={formattedResult} />
            </div>
          </div>
        )}

        {tool.status === "completed" && !formattedResult && (
          <div className="text-sm text-ink-400 italic">No result data</div>
        )}
      </div>
    </motion.div>
  )
}

export default ToolDetailPanel
