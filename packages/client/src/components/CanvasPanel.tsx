import { memo, useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import type { ToolExecution } from "@/hooks/useWebSocketChat"
import { getToolDisplay } from "@bibboy/shared"
import { LinkPreview } from "@/components/ui/LinkPreview"
import { ToolDetailPanel } from "@/components/Chat/ToolDetailPanel"
import { clampText, extractTextContent, type SearchResult } from "@/utils/format"

// ============================================================================
// Types
// ============================================================================

interface CanvasPanelProps {
  activeTools: ToolExecution[]
  selectedTool: ToolExecution | null
  onSelectTool: (tool: ToolExecution | null) => void
  className?: string
}

interface FetchedContent {
  url: string
  title?: string
  content?: string
  timestamp: number
}

type PanelTab = "activity" | "preview" | "links"

// ============================================================================
// Content Extraction Helpers
// ============================================================================

function extractFetchedContent(tools: ToolExecution[]): FetchedContent[] {
  const fetches: FetchedContent[] = []
  
  for (const tool of tools) {
    if (tool.name === "web_fetch" && tool.status === "completed" && tool.result) {
      const text = extractTextContent(tool.result)
      try {
        const data = JSON.parse(text)
        if (data.url) {
          fetches.push({
            url: data.url,
            title: data.title,
            content: data.content || data.markdown || data.text,
            timestamp: Date.now(),
          })
        }
      } catch { /* ignore */ }
    }
  }
  
  return fetches
}

function extractSearchResults(tools: ToolExecution[]): SearchResult[] {
  const results: SearchResult[] = []
  
  for (const tool of tools) {
    if (tool.name === "web_search" && tool.status === "completed" && tool.result) {
      const text = extractTextContent(tool.result)
      try {
        const data = JSON.parse(text)
        if (Array.isArray(data.results)) {
          results.push(...data.results)
        }
      } catch { /* ignore */ }
    }
  }
  
  return results
}

function extractLinks(tools: ToolExecution[]): string[] {
  const links: string[] = []
  
  for (const tool of tools) {
    if (tool.status === "completed" && tool.result) {
      const text = extractTextContent(tool.result)
      // Extract URLs from text content
      const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/g
      const matches = text.match(urlRegex)
      if (matches) {
        links.push(...matches)
      }
    }
  }
  
  // Deduplicate
  return [...new Set(links)]
}

// ============================================================================
// Sub-Components
// ============================================================================

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-32 text-center">
      <div className="text-ink-300 text-sm">{message}</div>
    </div>
  )
}

function PreviewContent({ content }: { content: FetchedContent }) {
  const [isExpanded, setIsExpanded] = useState(false)
  const preview = content.content ? clampText(content.content, 500) : null
  
  return (
    <div className="border border-ink-100 rounded-lg overflow-hidden bg-white">
      <div className="px-3 py-2 border-b border-ink-100 bg-ink-50/50">
        <LinkPreview url={content.url} className="text-sm font-medium text-accent-teal hover:underline">
          {content.title || new URL(content.url).hostname}
        </LinkPreview>
        <div className="text-[11px] text-ink-400 mt-0.5 truncate">
          {content.url}
        </div>
      </div>
      {preview && (
        <div className="px-3 py-2">
          <p className={`text-xs text-ink-600 leading-relaxed ${isExpanded ? "" : "line-clamp-6"}`}>
            {preview}
          </p>
          {content.content && content.content.length > 500 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[11px] text-accent-teal hover:underline mt-1"
            >
              {isExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SearchResultItem({ result }: { result: SearchResult }) {
  return (
    <div className="px-3 py-2 border-b border-ink-100 last:border-b-0 hover:bg-ink-50/30 transition-colors">
      {result.url ? (
        <LinkPreview url={result.url} className="text-sm font-medium text-accent-teal hover:underline block">
          {result.title || new URL(result.url).hostname}
        </LinkPreview>
      ) : (
        <span className="text-sm font-medium text-ink-700">{result.title || "Result"}</span>
      )}
      {result.snippet && (
        <p className="text-xs text-ink-500 mt-1 line-clamp-2">
          {result.snippet}
        </p>
      )}
    </div>
  )
}

function LinkItem({ url }: { url: string }) {
  let hostname = url
  try {
    hostname = new URL(url).hostname
  } catch { /* ignore */ }
  
  return (
    <div className="px-3 py-2 border-b border-ink-100 last:border-b-0">
      <LinkPreview url={url} className="text-sm text-accent-teal hover:underline block truncate">
        {hostname}
      </LinkPreview>
      <div className="text-[11px] text-ink-400 mt-0.5 truncate">
        {url}
      </div>
    </div>
  )
}

function TabButton({ 
  active, 
  onClick, 
  children,
  count 
}: { 
  active: boolean
  onClick: () => void
  children: React.ReactNode
  count?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-colors flex items-center gap-1.5
        ${active 
          ? "bg-ink-100 text-ink-700" 
          : "text-ink-500 hover:text-ink-700 hover:bg-ink-50"
        }`}
    >
      {children}
      {count !== undefined && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${active ? "bg-ink-200" : "bg-ink-100"}`}>
          {count}
        </span>
      )}
    </button>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export const CanvasPanel = memo(function CanvasPanel({
  activeTools,
  selectedTool,
  onSelectTool,
  className = "",
}: CanvasPanelProps) {
  const [activeTab, setActiveTab] = useState<PanelTab>("activity")

  // Extract content from tool results
  const fetchedContent = useMemo(() => extractFetchedContent(activeTools), [activeTools])
  const searchResults = useMemo(() => extractSearchResults(activeTools), [activeTools])
  const links = useMemo(() => extractLinks(activeTools), [activeTools])
  
  // Count items for badges
  const toolCount = activeTools.length
  const previewCount = fetchedContent.length + searchResults.length
  const linkCount = links.length

  // Sort tools: running first, then by most recent
  const sortedTools = useMemo(() => {
    return [...activeTools].sort((a, b) => {
      if (a.status === "running" && b.status !== "running") return -1
      if (a.status !== "running" && b.status === "running") return 1
      return 0 // Keep original order otherwise
    })
  }, [activeTools])

  // If a tool is selected, show the detail panel
  if (selectedTool) {
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <ToolDetailPanel tool={selectedTool} onClose={() => onSelectTool(null)} />
      </div>
    )
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-ink-100/60">
        <CanvasIcon />
        <h2 className="text-sm font-medium text-ink-700">Canvas</h2>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-3">
        <TabButton
          active={activeTab === "activity"}
          onClick={() => setActiveTab("activity")}
          count={toolCount}
        >
          Activity
        </TabButton>
        <TabButton
          active={activeTab === "preview"}
          onClick={() => setActiveTab("preview")}
          count={previewCount}
        >
          Preview
        </TabButton>
        <TabButton
          active={activeTab === "links"}
          onClick={() => setActiveTab("links")}
          count={linkCount}
        >
          Links
        </TabButton>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <AnimatePresence mode="wait">
          {activeTab === "activity" && (
            <motion.div
              key="activity"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-2"
            >
              {sortedTools.length > 0 ? (
                sortedTools.map((tool) => (
                  <ToolActivityCard
                    key={tool.id}
                    tool={tool}
                    onClick={() => onSelectTool(tool)}
                  />
                ))
              ) : (
                <EmptyState message="Tool activity will appear here" />
              )}
            </motion.div>
          )}

          {activeTab === "preview" && (
            <motion.div
              key="preview"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {/* Fetched page previews */}
              {fetchedContent.map((content, i) => (
                <PreviewContent key={`fetch-${i}`} content={content} />
              ))}
              
              {/* Search results */}
              {searchResults.length > 0 && (
                <div className="border border-ink-100 rounded-lg overflow-hidden bg-white">
                  <div className="px-3 py-2 border-b border-ink-100 bg-ink-50/50">
                    <span className="text-xs font-medium text-ink-600">
                      Search Results ({searchResults.length})
                    </span>
                  </div>
                  <div className="max-h-64 overflow-auto">
                    {searchResults.slice(0, 10).map((result, i) => (
                      <SearchResultItem key={i} result={result} />
                    ))}
                  </div>
                </div>
              )}
              
              {searchResults.length === 0 && fetchedContent.length === 0 && (
                <EmptyState message="Fetched content will appear here" />
              )}
            </motion.div>
          )}

          {activeTab === "links" && (
            <motion.div
              key="links"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {links.length > 0 ? (
                <div className="border border-ink-100 rounded-lg overflow-hidden bg-white">
                  {links.map((url, i) => (
                    <LinkItem key={i} url={url} />
                  ))}
                </div>
              ) : (
                <EmptyState message="Links from responses will appear here" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer hint when empty */}
      {toolCount === 0 && previewCount === 0 && linkCount === 0 && (
        <div className="mt-4 pt-3 border-t border-ink-100/60">
          <p className="text-[11px] text-ink-400 leading-relaxed">
            Ask the agent to search the web or use tools to see activity here.
          </p>
        </div>
      )}
    </div>
  )
})

/**
 * Compact tool card for the activity feed.
 */
function ToolActivityCard({ tool, onClick }: { tool: ToolExecution; onClick: () => void }) {
  const config = getToolDisplay(tool.name)
  
  const statusColors = {
    running: "bg-amber-50 border-amber-200",
    completed: "bg-emerald-50 border-emerald-100",
    error: "bg-red-50 border-red-200",
  }

  const statusIcons = {
    running: <SpinnerIcon className="w-3 h-3 text-amber-600 animate-spin" />,
    completed: <CheckIcon className="w-3 h-3 text-emerald-600" />,
    error: <ErrorIcon className="w-3 h-3 text-red-600" />,
  }

  // Format arguments preview
  const argPreview = config.argKeys?.length
    ? config.argKeys
        .map((k) => tool.arguments[k])
        .filter(Boolean)
        .map((v) => clampText(String(v), 30))
        .join(", ")
    : Object.values(tool.arguments).slice(0, 1).map((v) => clampText(String(v), 30)).join("")

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-all hover:brightness-95 ${statusColors[tool.status]} ${tool.status === "running" ? "tool-card--running" : ""}`}
    >
      <div className="flex items-center gap-2">
        {statusIcons[tool.status]}
        <span className="text-xs font-medium text-ink-700">{config.label}</span>
        {argPreview && (
          <span className="text-[11px] text-ink-500 truncate flex-1">
            {argPreview}
          </span>
        )}
        <ChevronRightIcon className="w-3 h-3 text-ink-400 flex-shrink-0" />
      </div>
    </button>
  )
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

// ============================================================================
// Icons
// ============================================================================

function CanvasIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-500"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 21V9" />
    </svg>
  )
}

export default CanvasPanel
