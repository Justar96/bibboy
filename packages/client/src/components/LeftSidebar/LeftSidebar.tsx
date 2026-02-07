import { memo } from "react"
import type { ActivityGroup } from "@/hooks/useActivityLog"
import type { Task, TaskStatus } from "@/hooks/useTaskList"
import { ActivitySection } from "./ActivitySection"
import { TaskSection } from "./TaskSection"

// ============================================================================
// Types
// ============================================================================

export interface LeftSidebarData {
  readonly activityGroups: ActivityGroup[]
  readonly tasks: Task[]
  readonly pendingCount: number
  readonly onUpdateStatus: (id: string, status: TaskStatus) => void
  readonly onAcceptTask: (id: string) => void
  readonly onDismissTask: (id: string) => void
  readonly onDeleteTask: (id: string) => void
}

// ============================================================================
// Version
// ============================================================================

const APP_VERSION = "0.1.0"

// ============================================================================
// Main Component
// ============================================================================

export const LeftSidebar = memo(function LeftSidebar({
  data,
}: {
  data: LeftSidebarData | null
}) {
  return (
    <>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-[#EBEBEB] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-[#0066CC] uppercase tracking-[0.1em]">
            Bibboy
          </span>
          <span className="font-mono text-[10px] text-[#BBBBBB]">
            v{APP_VERSION}
          </span>
        </div>
      </div>

      {/* Scrollable Sections */}
      <div className="flex-1 overflow-y-auto sidebar-scroll">
        {data ? (
          <>
            <ActivitySection groups={data.activityGroups} />
            <TaskSection
              tasks={data.tasks}
              pendingCount={data.pendingCount}
              onUpdateStatus={data.onUpdateStatus}
              onAccept={data.onAcceptTask}
              onDismiss={data.onDismissTask}
              onDelete={data.onDeleteTask}
            />
          </>
        ) : (
          <div className="px-4 py-8 text-center">
            <span className="font-mono text-[10px] text-[#CCCCCC]">
              Open Playground to see activity
            </span>
          </div>
        )}
      </div>
    </>
  )
})
