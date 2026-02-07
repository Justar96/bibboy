import { memo, useState, useEffect, useRef, type ReactNode } from "react"
import { motion, AnimatePresence } from "framer-motion"

// ============================================================================
// Types
// ============================================================================

interface PersonaPanelProps {
  content: string
  isLoading?: boolean
  className?: string
}

interface Section {
  id: string
  title: string
  level: number
  content: ReactNode[]
  isNew?: boolean
  isCustom?: boolean // True if content differs from default template
}

// ============================================================================
// Default Template Detection
// ============================================================================

// Default template content markers - if a section contains ONLY these, it's not customized
const DEFAULT_SECTION_MARKERS: Record<string, string[]> = {
  "core-truths": [
    "Be genuinely helpful",
    "Have opinions",
    "Be resourceful before asking",
    "Earn trust through competence",
    "Remember you're a guest",
  ],
  "boundaries": [
    "Private things stay private",
    "When in doubt, ask before acting",
    "Never send half-baked replies",
    "You're not the user's voice",
  ],
  "vibe": [
    "Be the assistant you'd actually want to talk to",
    "Not a corporate drone",
    "Not a sycophant",
  ],
  "continuity": [
    "Each session, you wake up fresh",
    "These files *are* your memory",
    "If you change this file, tell the user",
  ],
}

// Check if section content is just the default template
function isDefaultSection(sectionId: string, contentText: string): boolean {
  const markers = DEFAULT_SECTION_MARKERS[sectionId]
  if (!markers) return false
  
  // If ALL markers are present, it's likely unchanged from default
  const matchCount = markers.filter(marker => contentText.includes(marker)).length
  return matchCount >= markers.length - 1 // Allow 1 marker to be missing
}

// ============================================================================
// Section Parser
// ============================================================================

/**
 * Parse markdown content into collapsible sections.
 * Groups content under H2 headers.
 */
function parseIntoSections(content: string, filterDefaults: boolean = true): Section[] {
  const lines = content.split("\n")
  const sections: Section[] = []
  let currentSection: { id: string; title: string; level: number; lines: string[] } | null = null
  const introLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // H2 starts a new section
    if (trimmed.startsWith("## ")) {
      if (currentSection) {
        const contentText = currentSection.lines.join(" ")
        const isDefault = isDefaultSection(currentSection.id, contentText)
        
        // Only add if it has custom content or we're not filtering
        if (!filterDefaults || !isDefault) {
          sections.push({
            id: currentSection.id,
            title: currentSection.title,
            level: currentSection.level,
            content: currentSection.lines.map((l, i) => parseLine(l, i)),
            isCustom: !isDefault,
          })
        }
      }
      const title = trimmed.slice(3)
      currentSection = {
        id: title.toLowerCase().replace(/\s+/g, "-"),
        title,
        level: 2,
        lines: [],
      }
      continue
    }

    // H1 goes to intro (skip default intro)
    if (trimmed.startsWith("# ")) {
      // Skip default SOUL.md title
      if (!trimmed.includes("SOUL.md - Who You Are")) {
        introLines.push(trimmed)
      }
      continue
    }

    // Skip default intro tagline
    if (trimmed === "*You're not a chatbot. You're becoming someone.*") {
      continue
    }

    // Content goes to current section or intro
    if (currentSection) {
      currentSection.lines.push(trimmed)
    } else {
      introLines.push(trimmed)
    }
  }

  // Add last section
  if (currentSection) {
    const contentText = currentSection.lines.join(" ")
    const isDefault = isDefaultSection(currentSection.id, contentText)
    
    if (!filterDefaults || !isDefault) {
      sections.push({
        id: currentSection.id,
        title: currentSection.title,
        level: currentSection.level,
        content: currentSection.lines.map((l, i) => parseLine(l, i)),
        isCustom: !isDefault,
      })
    }
  }

  // Add intro as first "section" if it has custom content
  // Filter out default footer text
  const filteredIntro = introLines.filter(line => 
    !line.includes("This file is yours to evolve") &&
    !line.startsWith("---")
  )
  
  if (filteredIntro.length > 0) {
    sections.unshift({
      id: "intro",
      title: "",
      level: 0,
      content: filteredIntro.map((l, i) => parseLine(l, i)),
      isCustom: true,
    })
  }

  return sections
}

function parseLine(trimmed: string, key: number): ReactNode {
  // H3
  if (trimmed.startsWith("### ")) {
    return (
      <h3 key={key} className="text-sm font-medium text-ink-600 mt-3 mb-1.5">
        {trimmed.slice(4)}
      </h3>
    )
  }

  // List item
  if (trimmed.startsWith("- ")) {
    return (
      <li key={key} className="text-sm text-ink-600 ml-4 list-disc">
        {formatInline(trimmed.slice(2))}
      </li>
    )
  }

  // Regular paragraph
  return (
    <p key={key} className="text-sm text-ink-600 leading-relaxed mb-2">
      {formatInline(trimmed)}
    </p>
  )
}

// ============================================================================
// Inline Formatting
// ============================================================================

/**
 * Format inline elements (bold, code, etc.)
 */
function formatInline(text: string): React.ReactNode {
  // Replace **text** with bold
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-medium text-ink-700">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="text-xs bg-ink-50 px-1.5 py-0.5 rounded text-ink-700 font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    return part
  })
}

// ============================================================================
// Collapsible Section Component
// ============================================================================

interface CollapsibleSectionProps {
  section: Section
  isExpanded: boolean
  onToggle: () => void
  hasChanges?: boolean
  isShimmering?: boolean
}

function CollapsibleSection({ section, isExpanded, onToggle, hasChanges, isShimmering }: CollapsibleSectionProps) {
  // Intro section (no title) is always expanded and not collapsible
  if (!section.title) {
    return <div className="space-y-1.5">{section.content}</div>
  }

  return (
    <div className="border-b border-ink-100/50 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-ink-50/30 transition-colors -mx-2 px-2 rounded-md group"
      >
        <ChevronIcon isExpanded={isExpanded} />
        <span className="text-xs font-medium text-ink-500 uppercase tracking-wider flex-1 group-hover:text-ink-700 transition-colors">
          {section.title}
        </span>
        {isShimmering && (
          <span 
            className="h-1.5 w-8 rounded-full bg-gradient-to-r from-ink-100 via-ink-200 to-ink-100 animate-shimmer" 
            style={{ backgroundSize: '200% 100%' }}
            title="Recently updated" 
          />
        )}
        {hasChanges && !isShimmering && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" title="Recently updated" />
        )}
      </button>
      
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="pb-3 pl-5 space-y-1.5">
              {section.content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * PersonaPanel - Displays the SOUL.md persona file with collapsible sections.
 * Highlights recently changed sections and supports expand/collapse.
 */
export const PersonaPanel = memo(function PersonaPanel({
  content,
  isLoading,
  className = "",
}: PersonaPanelProps) {
  // All sections collapsed by default (empty Set)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const [changedSections, setChangedSections] = useState<Set<string>>(new Set())
  const [shimmeringSections, setShimmeringSections] = useState<Set<string>>(new Set())
  const prevContentRef = useRef<string>("")
  const prevSectionsRef = useRef<Map<string, string>>(new Map())

  // Show only agent-customized content (filter out defaults)
  const sections = content ? parseIntoSections(content, true) : []

  // Track content changes per section - show shimmer when agent touches file
  useEffect(() => {
    if (!content || content === prevContentRef.current) return

    const newSections = parseIntoSections(content)
    const newChanges = new Set<string>()
    const newShimmers = new Set<string>()

    for (const section of newSections) {
      if (!section.title) continue // Skip intro
      
      const sectionText = section.content.map(c => String(c)).join("")
      const prevText = prevSectionsRef.current.get(section.id)
      
      if (prevText !== undefined && prevText !== sectionText) {
        newChanges.add(section.id)
        newShimmers.add(section.id)
        // Auto-expand changed sections when agent updates them
        setExpandedSections(prev => new Set([...prev, section.id]))
      }
      
      prevSectionsRef.current.set(section.id, sectionText)
    }

    if (newChanges.size > 0) {
      setChangedSections(newChanges)
      setShimmeringSections(newShimmers)
      // Clear shimmer after 2 seconds, keep change indicator longer
      setTimeout(() => setShimmeringSections(new Set()), 2000)
      setTimeout(() => setChangedSections(new Set()), 5000)
    }

    prevContentRef.current = content
  }, [content])

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedSections(new Set(sections.filter(s => s.title).map(s => s.id)))
  }

  const collapseAll = () => {
    setExpandedSections(new Set())
  }

  const hasExpandableSections = sections.some(s => s.title)

  // Check if there's any custom content
  const hasCustomContent = sections.some(s => s.isCustom)


  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-ink-100/60">
        <SoulIcon />
        <h2 className="text-sm font-medium text-ink-700">Persona</h2>
      </div>

      {/* Expand/Collapse controls - token style buttons */}
      {hasExpandableSections && !isLoading && sections.length > 0 && (
        <div className="flex gap-1.5 mb-3">
          <button
            onClick={expandAll}
            className="px-2.5 py-1 text-[11px] font-medium text-ink-500 bg-ink-50 hover:bg-ink-100 rounded-full transition-colors"
          >
            Expand all
          </button>
          <button
            onClick={collapseAll}
            className="px-2.5 py-1 text-[11px] font-medium text-ink-500 bg-ink-50 hover:bg-ink-100 rounded-full transition-colors"
          >
            Collapse all
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-pulse text-ink-400 text-sm">Loading...</div>
          </div>
        ) : sections.length > 0 ? (
          <div className="space-y-1">
            {sections.map(section => (
              <CollapsibleSection
                key={section.id}
                section={section}
                isExpanded={!section.title || expandedSections.has(section.id)}
                onToggle={() => toggleSection(section.id)}
                hasChanges={changedSections.has(section.id)}
                isShimmering={shimmeringSections.has(section.id)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <div className="text-ink-300 text-sm mb-3">No persona defined yet</div>
            <p className="text-xs text-ink-400 leading-relaxed">
              Chat with the agent to define its personality, preferences, and behavior.
            </p>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!hasCustomContent && (
        <div className="mt-4 pt-3 border-t border-ink-100/60">
          <p className="text-[11px] text-ink-400 leading-relaxed">
            Try: "Remember that I prefer concise answers" or "Your name is Nova"
          </p>
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Icons
// ============================================================================

function SoulIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  )
}

function ChevronIcon({ isExpanded }: { isExpanded: boolean }) {
  return (
    <motion.svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-ink-400 flex-shrink-0"
      animate={{ rotate: isExpanded ? 90 : 0 }}
      transition={{ duration: 0.15 }}
    >
      <polyline points="9 18 15 12 9 6" />
    </motion.svg>
  )
}

export default PersonaPanel
