import { useState, memo } from "react"
import { ChevronIcon } from "@/components/Chat/icons"
import type { LeftSidebarData } from "./LeftSidebar"
import { ActivitySection } from "./ActivitySection"
import { TaskSection } from "./TaskSection"

// ============================================================================
// Main Component
// ============================================================================

export const MobileActivityPanel = memo(function MobileActivityPanel({
  data,
}: {
  data: LeftSidebarData | null
}) {
  const [expanded, setExpanded] = useState(false)

  if (!data) return null

  const runningCount = data.activityGroups.reduce(
    (n, g) => n + g.actions.filter((a) => a.status === "running").length,
    0,
  )

  return (
    <div className="lg:hidden border-b border-[#EBEBEB] bg-white">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-[#FAFAFA] transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-[#AAAAAA] transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="font-mono text-[10px] font-semibold text-[#888888] uppercase tracking-[0.08em]">
          Activity
        </span>
        {runningCount > 0 && (
          <span className="font-mono text-[9px] font-semibold text-white bg-[#0066CC] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {runningCount}
          </span>
        )}
        {data.pendingCount > 0 && (
          <span className="ml-1 font-mono text-[9px] text-[#888888]">
            {data.pendingCount} task{data.pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Expanded content */}
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
          expanded ? "max-h-[600px]" : "max-h-0"
        }`}
      >
        <div className="border-t border-[#F0F0F0]">
          <ActivitySection groups={data.activityGroups} />
          <TaskSection
            tasks={data.tasks}
            pendingCount={data.pendingCount}
            onUpdateStatus={data.onUpdateStatus}
            onAccept={data.onAcceptTask}
            onDismiss={data.onDismissTask}
            onDelete={data.onDeleteTask}
          />
        </div>
      </div>
    </div>
  )
})
