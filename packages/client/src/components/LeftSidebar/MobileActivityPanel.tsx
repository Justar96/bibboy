import { useState, memo } from "react";
import { ChevronIcon } from "@/components/Chat/icons";
import type { LeftSidebarData } from "./LeftSidebar";
import { ActivitySection } from "./ActivitySection";
import { TaskSection } from "./TaskSection";

// ============================================================================
// Main Component
// ============================================================================

export const MobileActivityPanel = memo(function MobileActivityPanel({
  data,
}: {
  data: LeftSidebarData | null;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!data) return null;

  const runningCount = data.activityGroups.reduce(
    (n, g) => n + g.actions.filter((a) => a.status === "running").length,
    0,
  );

  return (
    <div className="lg:hidden border-b border-paper-300 bg-paper-100">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-paper-200 transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-ink-300 transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="font-mono text-[10px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
          Activity
        </span>
        {runningCount > 0 && (
          <span className="font-mono text-[9px] font-semibold text-white bg-[#6B9FFF] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {runningCount}
          </span>
        )}
        {data.pendingCount > 0 && (
          <span className="ml-1 font-mono text-[9px] text-ink-400">
            {data.pendingCount} task{data.pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Expanded content */}
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
          expanded ? "max-h-[76vh]" : "max-h-0"
        }`}
      >
        <div className="border-t border-paper-300 h-[min(72vh,560px)] flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto sidebar-scroll">
            <ActivitySection groups={data.activityGroups} listMaxHeightClass="max-h-none" />
          </div>
          <div className="shrink-0 h-56 border-t border-paper-300 overflow-y-auto sidebar-scroll">
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
      </div>
    </div>
  );
});
