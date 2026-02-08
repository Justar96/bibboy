import { useState } from "react"
import { useAgentList } from "@/hooks/useAgentList"
import { useWorkspaceFiles } from "@/hooks/useWorkspaceFiles"
import { useAgentConfig } from "./sidebarContext"

// ============================================================================
// Sub-components
// ============================================================================

function ConnectionDot({ state }: { readonly state: string }) {
  const color =
    state === "connected"
      ? "bg-emerald-500"
      : state === "connecting" || state === "reconnecting"
        ? "bg-amber-400 animate-pulse"
        : "bg-ink-300"

  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="font-mono text-[10px] text-ink-400 uppercase tracking-[0.08em]">
        {state}
      </span>
    </div>
  )
}

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <span className="font-mono text-[9px] text-ink-300 uppercase tracking-[0.12em] font-medium">
      {children}
    </span>
  )
}

// ============================================================================
// File Preview
// ============================================================================

function WorkspaceFileItem({
  name,
  content,
  onDelete,
}: {
  readonly name: string
  readonly content: string
  readonly onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-paper-300 rounded-sm">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-2 py-1.5 hover:bg-paper-200 transition-colors min-w-0"
        >
          <span className="font-mono text-[10px] text-ink-500 truncate">
            {name}
          </span>
          <span className="font-mono text-[10px] text-ink-300 shrink-0 ml-2">
            {expanded ? "-" : "+"}
          </span>
        </button>
        <button
          onClick={onDelete}
          className="shrink-0 px-1.5 py-1.5 text-ink-300 hover:text-red-400 transition-colors"
          title={`Delete ${name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-paper-300">
          <pre className="font-mono text-[9px] text-ink-400 whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto mt-1.5">
            {content || "(empty)"}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Panel
// ============================================================================

export function AgentConfigPanel() {
  const { connectionState } = useAgentConfig()
  const { agents, isLoading: agentsLoading } = useAgentList()
  const { files, isLoading: filesLoading, deleteFile, resetAll } = useWorkspaceFiles()

  const currentAgent = agents[0] ?? null

  // Waiting state
  if (connectionState === "disconnected" && agentsLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <span className="font-mono text-[10px] text-ink-300 uppercase tracking-[0.1em]">
          Waiting for connection...
        </span>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col p-4 gap-5">
      {/* Connection */}
      <div className="flex items-center justify-between">
        <SectionLabel>Status</SectionLabel>
        <ConnectionDot state={connectionState} />
      </div>

      {/* Agent */}
      <div className="flex flex-col gap-1.5">
        <SectionLabel>Agent</SectionLabel>
        {agentsLoading ? (
          <span className="font-mono text-[10px] text-ink-300">Loading...</span>
        ) : currentAgent ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[12px] text-ink-700 font-medium">
              {currentAgent.name}
            </span>
            <span className="font-mono text-[10px] text-ink-300">
              {currentAgent.id}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-ink-300">No agent</span>
        )}
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-paper-300" />

      {/* Workspace Files — only agent-modified files */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Workspace Files</SectionLabel>
          {files.filter((f) => !f.isDefault).length > 0 && (
            <button
              onClick={() => void resetAll()}
              className="font-mono text-[9px] text-ink-300 hover:text-red-400 uppercase tracking-[0.08em] transition-colors"
            >
              Reset All
            </button>
          )}
        </div>
        {filesLoading ? (
          <span className="font-mono text-[10px] text-ink-300">Loading...</span>
        ) : files.filter((f) => !f.isDefault).length > 0 ? (
          <div className="flex flex-col gap-1">
            {files
              .filter((f) => !f.isDefault)
              .map((file) => (
                <WorkspaceFileItem
                  key={file.path}
                  name={file.name}
                  content={file.content}
                  onDelete={() => void deleteFile(file.name)}
                />
              ))}
          </div>
        ) : (
          <span className="font-mono text-[10px] text-ink-300">
            No agent-modified files yet
          </span>
        )}
      </div>
    </div>
  )
}
