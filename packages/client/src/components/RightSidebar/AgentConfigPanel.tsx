import { useState, useMemo } from "react"
import {
  SOUL_STAGES,
  SOUL_STAGE_THRESHOLDS,
  getDominantTraits,
  getNextStage,
  type PersonalityTrait,
  type SoulStage,
} from "@bibboy/shared"
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
        : "bg-[#CCCCCC]"

  return (
    <div className="flex items-center gap-2">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="font-mono text-[10px] text-[#999999] uppercase tracking-[0.08em]">
        {state}
      </span>
    </div>
  )
}

function StageBadge({ stage }: { readonly stage: SoulStage }) {
  const stageIndex = SOUL_STAGES.indexOf(stage)
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] font-semibold text-[#0066CC] uppercase tracking-[0.06em]">
        {stage}
      </span>
      <span className="font-mono text-[10px] text-[#AAAAAA]">
        {stageIndex + 1}/{SOUL_STAGES.length}
      </span>
    </div>
  )
}

function ProgressBar({
  current,
  target,
}: {
  readonly current: number
  readonly target: number
}) {
  const pct = target > 0 ? Math.min((current / target) * 100, 100) : 0
  return (
    <div className="w-full">
      <div className="flex justify-between mb-1">
        <span className="font-mono text-[10px] text-[#999999]">
          {current} interactions
        </span>
        <span className="font-mono text-[10px] text-[#999999]">
          {target > 0 ? `next at ${target}` : "max stage"}
        </span>
      </div>
      <div className="w-full h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0066CC] rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function TraitBar({
  trait,
  score,
}: {
  readonly trait: PersonalityTrait
  readonly score: number
}) {
  const pct = Math.round(score * 100)
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-[#666666] w-16 shrink-0 truncate">
        {trait}
      </span>
      <div className="flex-1 h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
        <div
          className="h-full bg-[#0066CC]/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-[#AAAAAA] w-8 text-right tabular-nums">
        {pct}%
      </span>
    </div>
  )
}

function SectionLabel({ children }: { readonly children: string }) {
  return (
    <span className="font-mono text-[9px] text-[#AAAAAA] uppercase tracking-[0.12em] font-medium">
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
    <div className="border border-[#F0F0F0] rounded-sm">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between px-2 py-1.5 hover:bg-[#FAFAFA] transition-colors min-w-0"
        >
          <span className="font-mono text-[10px] text-[#666666] truncate">
            {name}
          </span>
          <span className="font-mono text-[10px] text-[#CCCCCC] shrink-0 ml-2">
            {expanded ? "-" : "+"}
          </span>
        </button>
        <button
          onClick={onDelete}
          className="shrink-0 px-1.5 py-1.5 text-[#CCCCCC] hover:text-red-400 transition-colors"
          title={`Delete ${name}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6 6 18" /><path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="px-2 pb-2 border-t border-[#F0F0F0]">
          <pre className="font-mono text-[9px] text-[#999999] whitespace-pre-wrap break-words max-h-[200px] overflow-y-auto mt-1.5">
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
  const { soulState, soulStage, connectionState } = useAgentConfig()
  const { agents, isLoading: agentsLoading } = useAgentList()
  const { files, isLoading: filesLoading, deleteFile, resetAll } = useWorkspaceFiles()

  const currentAgent = agents[0] ?? null

  const nextStage = getNextStage(soulStage)
  const nextThreshold = nextStage ? SOUL_STAGE_THRESHOLDS[nextStage] : 0

  const dominantTraits = useMemo(() => {
    if (!soulState) return []
    return getDominantTraits(
      soulState.traits as Record<PersonalityTrait, number>,
      3
    )
  }, [soulState])

  const traitScores = useMemo(() => {
    if (!soulState) return []
    return dominantTraits.map((trait) => ({
      trait,
      score: (soulState.traits as Record<PersonalityTrait, number>)[trait] ?? 0,
    }))
  }, [soulState, dominantTraits])

  // Waiting state
  if (connectionState === "disconnected" && !soulState && agentsLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <span className="font-mono text-[10px] text-[#AAAAAA] uppercase tracking-[0.1em]">
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
          <span className="font-mono text-[10px] text-[#CCCCCC]">Loading...</span>
        ) : currentAgent ? (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[12px] text-[#1A1A1A] font-medium">
              {currentAgent.name}
            </span>
            <span className="font-mono text-[10px] text-[#AAAAAA]">
              {currentAgent.id}
            </span>
          </div>
        ) : (
          <span className="font-mono text-[10px] text-[#CCCCCC]">No agent</span>
        )}
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-[#F0F0F0]" />

      {/* Soul Evolution */}
      <div className="flex flex-col gap-2.5">
        <SectionLabel>Soul Evolution</SectionLabel>
        <StageBadge stage={soulStage} />
        <ProgressBar
          current={soulState?.interactionCount ?? 0}
          target={nextThreshold}
        />

        {/* Dominant Traits */}
        {traitScores.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-1">
            <span className="font-mono text-[9px] text-[#BBBBBB] uppercase tracking-[0.08em]">
              Dominant Traits
            </span>
            {traitScores.map(({ trait, score }) => (
              <TraitBar key={trait} trait={trait} score={score} />
            ))}
          </div>
        )}

        {traitScores.length === 0 && (
          <span className="font-mono text-[10px] text-[#CCCCCC]">
            No traits observed yet
          </span>
        )}
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-[#F0F0F0]" />

      {/* Workspace Files — only agent-modified files */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <SectionLabel>Workspace Files</SectionLabel>
          {files.filter((f) => !f.isDefault).length > 0 && (
            <button
              onClick={() => void resetAll()}
              className="font-mono text-[9px] text-[#CCCCCC] hover:text-red-400 uppercase tracking-[0.08em] transition-colors"
            >
              Reset All
            </button>
          )}
        </div>
        {filesLoading ? (
          <span className="font-mono text-[10px] text-[#CCCCCC]">Loading...</span>
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
          <span className="font-mono text-[10px] text-[#CCCCCC]">
            No agent-modified files yet
          </span>
        )}
      </div>
    </div>
  )
}
