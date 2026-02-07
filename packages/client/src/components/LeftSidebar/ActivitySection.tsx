import { memo, useEffect, useMemo, useState } from "react";
import type { ActivityGroup } from "@/hooks/useActivityLog";
import { ChevronIcon } from "@/components/Chat/icons";
import { ActivityActionRow } from "./ActivityActionRow";

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}

function runningCount(groups: ActivityGroup[]): number {
  return groups.reduce(
    (count, g) => count + g.actions.filter((a) => a.status === "running").length,
    0,
  );
}

// ============================================================================
// Activity Group
// ============================================================================

const ActivityGroupBlock = memo(function ActivityGroupBlock({
  group,
  expanded,
  onToggle,
}: {
  group: ActivityGroup;
  expanded: boolean;
  onToggle: () => void;
}) {
  const activeCount = group.actions.filter((action) => action.status === "running").length;

  return (
    <div className="border-b border-[#F0F0F0] last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 text-left hover:bg-[#F8F8F8] transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-[#AAAAAA] transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="font-mono text-[10px] text-[#888888] leading-tight truncate flex-1">
          {truncate(group.userText)}
        </span>
        {activeCount > 0 && (
          <span className="w-1.5 h-1.5 rounded-full bg-[#0066CC] animate-pulse shrink-0" />
        )}
        <span className="font-mono text-[9px] text-[#BDBDBD] shrink-0">{group.actions.length}</span>
      </button>

      {expanded && (
        <div className="pb-1.5">
          {group.actions.length === 0 ? (
            <div className="px-5 py-2">
              <span className="font-mono text-[9px] text-[#C0C0C0]">Waiting for activity…</span>
            </div>
          ) : (
            <div className="space-y-px">
              {group.actions.map((action) => (
                <ActivityActionRow key={action.id} action={action} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ============================================================================
// Main Component
// ============================================================================

export const ActivitySection = memo(function ActivitySection({
  groups,
  listMaxHeightClass = "max-h-[400px]",
}: {
  groups: ActivityGroup[];
  listMaxHeightClass?: string;
}) {
  const running = runningCount(groups);
  const reversed = useMemo(() => [...groups].reverse(), [groups]);
  const latestGroupId = groups[groups.length - 1]?.messageId ?? null;
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(latestGroupId);

  // Auto-focus newest query and collapse older logs when a new user query appears.
  useEffect(() => {
    setExpandedGroupId(latestGroupId);
  }, [latestGroupId]);

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-[#F0F0F0] flex items-center gap-2 bg-white">
        <span className="font-mono text-[10px] font-semibold text-[#888888] uppercase tracking-[0.08em]">
          Activity
        </span>
        {running > 0 && (
          <span className="ml-auto font-mono text-[9px] font-semibold text-white bg-[#0066CC] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {running}
          </span>
        )}
      </div>

      {reversed.length === 0 ? (
        <div className="flex-1 px-2 py-4 text-center">
          <span className="font-mono text-[10px] text-[#CCCCCC]">No activity yet</span>
        </div>
      ) : (
        <div className={`${listMaxHeightClass} overflow-y-auto space-y-0.5 sidebar-scroll`}>
          {reversed.map((group) => (
            <ActivityGroupBlock
              key={group.messageId}
              group={group}
              expanded={expandedGroupId === group.messageId}
              onToggle={() =>
                setExpandedGroupId((prev) => (prev === group.messageId ? null : group.messageId))
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});
