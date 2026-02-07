import { motion } from "framer-motion"
import type { ToolResult } from "@bibboy/shared"

const ANIMATION = {
  duration: 0.2,
  ease: [0.25, 0.1, 0.25, 1],
} as const

interface ToolCardProps {
  result: ToolResult
  onExpand?: () => void
}

/**
 * Visual card showing tool execution results (like web search).
 */
export function ToolCard({ result, onExpand }: ToolCardProps) {
  if (result.tool === "web_search") {
    return <WebSearchCard result={result} onExpand={onExpand} />
  }

  return null
}

interface WebSearchCardProps {
  result: ToolResult
  onExpand?: () => void
}

function WebSearchCard({ result, onExpand }: WebSearchCardProps) {
  const { query, results } = result

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: ANIMATION.duration, ease: ANIMATION.ease }}
      className="bg-paper-50 border border-paper-400 rounded-paper-lg overflow-hidden shadow-paper"
    >
      {/* Header */}
      <div className="px-3 py-2 bg-paper-200 border-b border-paper-400 flex items-center gap-2">
        <SearchIcon className="w-4 h-4 text-ink-500" />
        <span className="text-xs font-medium text-ink-600">Web Search</span>
        <span className="text-xs text-ink-400 truncate flex-1">"{query}"</span>
        {onExpand && (
          <button
            onClick={onExpand}
            className="text-xs text-ink-400 hover:text-ink-600 transition-colors"
          >
            Expand
          </button>
        )}
      </div>

      {/* Results */}
      <div className="divide-y divide-paper-300">
        {results.slice(0, 3).map((item, index) => (
          <a
            key={index}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block px-3 py-2 hover:bg-paper-100 transition-colors"
          >
            <div className="text-xs font-medium text-ink-700 truncate">
              {item.title}
            </div>
            <div className="text-xs text-accent-sage truncate">
              {new URL(item.url).hostname}
            </div>
            <div className="text-xs text-ink-500 line-clamp-2 mt-0.5">
              {item.description}
            </div>
          </a>
        ))}
      </div>

      {/* Footer - show count if more results */}
      {results.length > 3 && (
        <div className="px-3 py-1.5 bg-paper-100 border-t border-paper-300 text-center">
          <span className="text-xs text-ink-400">
            +{results.length - 3} more results
          </span>
        </div>
      )}
    </motion.div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
