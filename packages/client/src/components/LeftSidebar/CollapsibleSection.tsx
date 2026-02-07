import { useState, memo, type ReactNode } from "react"
import { ChevronIcon } from "@/components/Chat/icons"

interface CollapsibleSectionProps {
  readonly title: string
  readonly badge?: number
  readonly defaultExpanded?: boolean
  readonly children: ReactNode
}

export const CollapsibleSection = memo(function CollapsibleSection({
  title,
  badge,
  defaultExpanded = true,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <div className="border-b border-[#F0F0F0] last:border-b-0">
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-[#FAFAFA] transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-[#AAAAAA] transition-transform duration-200 ${
            expanded ? "rotate-90" : ""
          }`}
        />
        <span className="font-mono text-[10px] font-semibold text-[#888888] uppercase tracking-[0.08em]">
          {title}
        </span>
        {badge != null && badge > 0 && (
          <span className="ml-auto font-mono text-[9px] font-semibold text-white bg-[#0066CC] rounded-full min-w-[16px] h-4 flex items-center justify-center px-1">
            {badge}
          </span>
        )}
      </button>
      <div
        className={`overflow-hidden transition-[max-height] duration-200 ease-in-out ${
          expanded ? "max-h-[2000px]" : "max-h-0"
        }`}
      >
        <div className="px-2 pb-2">{children}</div>
      </div>
    </div>
  )
})
