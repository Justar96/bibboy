import { memo } from "react"
import type { ActivityGroup } from "@/hooks/useActivityLog"
import { CollapsibleSection } from "./CollapsibleSection"
import { ActivityActionRow } from "./ActivityActionRow"

// ============================================================================
// Helpers
// ============================================================================

function truncate(text: string, max = 40): string {
  return text.length > max ? text.slice(0, max) + "..." : text
}

function runningCount(groups: ActivityGroup[]): number {
  return groups.reduce(
    (count, g) => count + g.actions.filter((a) => a.status === "running").length,
    0,
  )
}

// ============================================================================
// Activity Group
// ============================================================================

const ActivityGroupBlock = memo(function ActivityGroupBlock({
  group,
}: {
  group: ActivityGroup
}) {
  if (group.actions.length === 0) return null

  return (
    <div className="mb-1.5">
      <div className="px-2 py-1">
        <span className="font-mono text-[10px] text-[#AAAAAA] leading-tight truncate block">
          {truncate(group.userText)}
        </span>
      </div>
      <div className="space-y-px">
        {group.actions.map((action) => (
          <ActivityActionRow key={action.id} action={action} />
        ))}
      </div>
    </div>
  )
})

// ============================================================================
// Main Component
// ============================================================================

export const ActivitySection = memo(function ActivitySection({
  groups,
}: {
  groups: ActivityGroup[]
}) {
  const running = runningCount(groups)
  // Show newest groups first
  const reversed = [...groups].reverse()

  return (
    <CollapsibleSection title="Activity" badge={running || undefined}>
      {reversed.length === 0 ? (
        <div className="px-2 py-4 text-center">
          <span className="font-mono text-[10px] text-[#CCCCCC]">
            No activity yet
          </span>
        </div>
      ) : (
        <div className="max-h-[400px] overflow-y-auto space-y-0.5 sidebar-scroll">
          {reversed.map((group) => (
            <ActivityGroupBlock key={group.messageId} group={group} />
          ))}
        </div>
      )}
    </CollapsibleSection>
  )
})
