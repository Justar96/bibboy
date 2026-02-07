import { useState, memo } from "react"
import type { ActivityAction } from "@/hooks/useActivityLog"
import { SpinnerIcon, CheckIcon, ErrorIcon } from "@/components/Chat/icons"

// ============================================================================
// Helpers
// ============================================================================

/** Display-friendly name for action types */
function actionLabel(action: ActivityAction): string {
  if (action.type === "tool") return action.name
  if (action.type === "canvas") return action.name
  if (action.type === "soul") return action.name
  if (action.type === "text") return action.name
  if (action.type === "compacting") return action.name
  if (action.type === "task") return action.name
  return action.name
}

function relativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 5) return "now"
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function durationStr(start: number, end?: number): string {
  if (!end) return "..."
  const ms = end - start
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ============================================================================
// Status Icon
// ============================================================================

function StatusIcon({ status }: { status: ActivityAction["status"] }) {
  if (status === "running") {
    return <SpinnerIcon className="w-3 h-3 animate-spin text-[#0066CC]" />
  }
  if (status === "error") {
    return <ErrorIcon className="w-3 h-3 text-red-500" />
  }
  return <CheckIcon className="w-3 h-3 text-emerald-500" />
}

// ============================================================================
// Detail Panel
// ============================================================================

function ActionDetails({ action }: { action: ActivityAction }) {
  const hasDetails = action.details && Object.keys(action.details).length > 0

  return (
    <div className="pl-5 pr-2 pb-2 text-[10px] font-mono text-[#888888] space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-[#AAAAAA]">Duration:</span>
        <span>{durationStr(action.startedAt, action.completedAt)}</span>
      </div>
      {hasDetails && (
        <div className="space-y-0.5">
          <span className="text-[#AAAAAA]">Args:</span>
          <pre className="text-[9px] leading-tight whitespace-pre-wrap break-all bg-[#FAFAFA] border border-[#F0F0F0] rounded-sm px-2 py-1 max-h-[120px] overflow-y-auto">
            {JSON.stringify(action.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export const ActivityActionRow = memo(function ActivityActionRow({
  action,
}: {
  action: ActivityAction
}) {
  const [expanded, setExpanded] = useState(false)
  const canExpand = action.type === "tool" || action.type === "canvas"

  return (
    <div>
      <button
        onClick={canExpand ? () => setExpanded((p) => !p) : undefined}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-left rounded-sm transition-colors ${
          canExpand ? "hover:bg-[#F5F5F5] cursor-pointer" : "cursor-default"
        }`}
      >
        <StatusIcon status={action.status} />
        <span className="flex-1 font-mono text-[11px] text-[#555555] truncate">
          {actionLabel(action)}
        </span>
        <span className="font-mono text-[9px] text-[#BBBBBB] shrink-0">
          {relativeTime(action.startedAt)}
        </span>
      </button>
      {expanded && <ActionDetails action={action} />}
    </div>
  )
})
