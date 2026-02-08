import { memo, useRef } from "react";
import type { ActivityGroup } from "@/hooks/useActivityLog";
import type { Task, TaskStatus } from "@/hooks/useTaskList";
import { useResizablePanel } from "@/hooks/useResizablePanel";
import { ActivitySection } from "./ActivitySection";
import { TaskSection } from "./TaskSection";

// ============================================================================
// Types
// ============================================================================

export interface LeftSidebarData {
  readonly activityGroups: ActivityGroup[];
  readonly tasks: Task[];
  readonly pendingCount: number;
  readonly onAddTask: (text: string) => void;
  readonly onUpdateStatus: (id: string, status: TaskStatus) => void;
  readonly onAcceptTask: (id: string) => void;
  readonly onDismissTask: (id: string) => void;
  readonly onDeleteTask: (id: string) => void;
}

// ============================================================================
// Version
// ============================================================================

const APP_VERSION = "0.1.0";

// ============================================================================
// Main Component
// ============================================================================

export const LeftSidebar = memo(function LeftSidebar({ data }: { data: LeftSidebarData | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { height: taskPanelHeight, onDragStart } = useResizablePanel(containerRef);

  return (
    <div ref={containerRef} className="h-full flex flex-col">
      {/* Sticky Header */}
      <div className="shrink-0 bg-paper-100 border-b border-paper-300 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-semibold text-[#6B9FFF] uppercase tracking-[0.1em]">
            Bibboy
          </span>
          <span className="font-mono text-[10px] text-ink-300">v{APP_VERSION}</span>
        </div>
      </div>

      {/* Activity Zone */}
      <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll">
        {data ? (
          <ActivitySection groups={data.activityGroups} listMaxHeightClass="max-h-none" />
        ) : (
          <div className="px-4 py-8 text-center">
            <span className="font-mono text-[10px] text-ink-300">
              Open Playground to see activity
            </span>
          </div>
        )}
      </div>

      {/* Task Zone (desktop resizable panel) */}
      {data && (
        <div
          className="shrink-0 flex flex-col min-h-0 border-t border-paper-300 bg-paper-100"
          style={{ height: taskPanelHeight }}
        >
          <div
            onMouseDown={onDragStart}
            className="h-2 cursor-row-resize hover:bg-paper-200 transition-colors flex items-center justify-center"
            aria-label="Resize task panel"
          >
            <span className="w-7 h-px bg-paper-400" />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll">
            <TaskSection
              tasks={data.tasks}
              pendingCount={data.pendingCount}
              onAddTask={data.onAddTask}
              onUpdateStatus={data.onUpdateStatus}
              onAccept={data.onAcceptTask}
              onDismiss={data.onDismissTask}
              onDelete={data.onDeleteTask}
              listMaxHeightClass="max-h-none"
            />
          </div>
        </div>
      )}
    </div>
  );
});
