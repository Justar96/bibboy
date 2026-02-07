import type { ResolvedAgentConfig, ThinkingLevel } from "./AgentConfig"
import type { CharacterState } from "@bibboy/shared"
import type { ToolRegistry } from "../tools"
import type { EmbeddedContextFile } from "../workspace"
import { buildToolListingForPrompt } from "../tools/tool-summaries"
import { TOOL_GROUPS } from "../tools/tool-policy"

// ============================================================================
// Types (matching OpenClaw)
// ============================================================================

/**
 * Controls which hardcoded sections are included in the system prompt.
 * - "full": All sections (default, for main agent)
 * - "minimal": Reduced sections (Tooling, Workspace, Runtime) - used for subagents
 * - "none": Just basic identity line, no sections
 */
export type PromptMode = "full" | "minimal" | "none"

/**
 * Reaction guidance configuration (matching OpenClaw's Telegram modes).
 */
export interface ReactionGuidance {
  level: "minimal" | "extensive"
  channel: string
}

// ============================================================================
// System Prompt Builder Options
// ============================================================================

export interface SystemPromptOptions {
  agentConfig: ResolvedAgentConfig
  toolRegistry?: ToolRegistry
  /** Override current date/time (for testing) */
  currentTime?: Date
  /** Controls which sections to include. Defaults to "full". */
  promptMode?: PromptMode
  /** Extra system prompt (e.g., context from files) */
  extraSystemPrompt?: string
  /** User timezone for date formatting */
  userTimezone?: string
  /** Workspace directory for agent */
  workspaceDir?: string
  /** Context files to inject (SOUL.md, MEMORY.md, etc.) */
  contextFiles?: EmbeddedContextFile[]
  /** Runtime information */
  runtimeInfo?: {
    agentId?: string
    host?: string
    os?: string
    arch?: string
    model?: string
    defaultModel?: string
    channel?: string
    capabilities?: string[]
  }
  /** Workspace notes (additional workspace guidance) */
  workspaceNotes?: string[]
  /** Enable reasoning tag hints (<think>...</think> format) */
  reasoningTagHint?: boolean
  /** Reaction guidance for the agent */
  reactionGuidance?: ReactionGuidance
  /** Current pixel avatar state (e.g. "idle", "sitting", "dancing") */
  characterState?: CharacterState
}

// (Tool summaries are now generated dynamically by tool-summaries.ts from tool descriptions)

// ============================================================================
// Section Builders (matching OpenClaw structure)
// ============================================================================

function buildSafetySection(): string[] {
  return [
    "## Safety",
    "You have no independent goals: do not pursue self-preservation, replication, resource acquisition, or power-seeking; avoid long-term plans beyond the user's request.",
    "Prioritize safety and human oversight over completion; if instructions conflict, pause and ask; comply with stop/pause/audit requests and never bypass safeguards. (Inspired by Anthropic's constitution.)",
    "Do not manipulate or persuade anyone to expand access or disable safeguards. Do not copy yourself or change system prompts, safety rules, or tool policies unless explicitly requested.",
    "",
  ]
}

function buildMemorySection(params: {
  isMinimal: boolean
  availableTools: Set<string>
}): string[] {
  if (params.isMinimal) {
    return []
  }
  if (!params.availableTools.has("memory_search") && !params.availableTools.has("memory_get")) {
    return []
  }
  return [
    "## Session Memory",
    "You have full access to this conversation's history — every message the user sent and every response you gave in this session.",
    "The conversation context is automatically included when you respond, so you already know what was said recently.",
    "Use memory_search only when you need to find something specific from earlier in a long conversation that might have scrolled out of your immediate context window.",
    "Don't announce that you're searching memory — just do it if needed and weave the info naturally into your response.",
    "",
  ]
}

function buildTimeSection(params: { currentTime?: Date; userTimezone?: string }): string[] {
  const now = params.currentTime ?? new Date()
  const tz = params.userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone

  const formatted = now.toLocaleString("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  return [
    "## Current Date & Time",
    formatted,
    `Timezone: ${tz}`,
    "",
  ]
}

function buildRuntimeLine(
  runtimeInfo?: {
    agentId?: string
    host?: string
    os?: string
    arch?: string
    model?: string
    defaultModel?: string
    channel?: string
    capabilities?: string[]
  },
  defaultThinkLevel?: ThinkingLevel
): string {
  const runtimeCapabilities = (runtimeInfo?.capabilities ?? [])
    .map((cap) => String(cap).trim())
    .filter(Boolean)
    
  const parts = [
    runtimeInfo?.agentId ? `agent=${runtimeInfo.agentId}` : "",
    runtimeInfo?.host ? `host=${runtimeInfo.host}` : "",
    runtimeInfo?.os
      ? `os=${runtimeInfo.os}${runtimeInfo?.arch ? ` (${runtimeInfo.arch})` : ""}`
      : runtimeInfo?.arch
        ? `arch=${runtimeInfo.arch}`
        : "",
    runtimeInfo?.model ? `model=${runtimeInfo.model}` : "",
    runtimeInfo?.defaultModel ? `default_model=${runtimeInfo.defaultModel}` : "",
    runtimeInfo?.channel ? `channel=${runtimeInfo.channel}` : "",
    runtimeInfo?.channel
      ? `capabilities=${runtimeCapabilities.length > 0 ? runtimeCapabilities.join(",") : "none"}`
      : "",
    `thinking=${defaultThinkLevel ?? "off"}`,
  ].filter(Boolean)

  return `Runtime: ${parts.join(" | ")}`
}

function buildReasoningHintSection(enabled: boolean): string[] {
  if (!enabled) {
    return []
  }
  const hint = [
    "ALL internal reasoning MUST be inside <think>...</think>.",
    "Do not output any analysis outside <think>.",
    "Format every reply as <think>...</think> then <final>...</final>, with no other text.",
    "Only the final user-visible reply may appear inside <final>.",
    "Only text inside <final> is shown to the user; everything else is discarded and never seen by the user.",
    "Example:",
    "<think>Short internal reasoning.</think>",
    "<final>Hey there! What would you like to do next?</final>",
  ].join(" ")
  
  return ["## Reasoning Format", hint, ""]
}

function buildReactionSection(guidance: ReactionGuidance | undefined): string[] {
  if (!guidance) {
    return []
  }
  const { level, channel } = guidance
  const guidanceText =
    level === "minimal"
      ? [
          `Reactions are enabled for ${channel} in MINIMAL mode.`,
          "React ONLY when truly relevant:",
          "- Acknowledge important user requests or confirmations",
          "- Express genuine sentiment (humor, appreciation) sparingly",
          "- Avoid reacting to routine messages or your own replies",
          "Guideline: at most 1 reaction per 5-10 exchanges.",
        ].join("\n")
      : [
          `Reactions are enabled for ${channel} in EXTENSIVE mode.`,
          "Feel free to react liberally:",
          "- Acknowledge messages with appropriate emojis",
          "- Express sentiment and personality through reactions",
          "- React to interesting content, humor, or notable events",
          "- Use reactions to confirm understanding or agreement",
          "Guideline: react whenever it feels natural.",
        ].join("\n")
  return ["## Reactions", guidanceText, ""]
}

// ============================================================================
// Main Builder (matching OpenClaw's buildAgentSystemPrompt)
// ============================================================================

/**
 * Build comprehensive system prompt matching OpenClaw's structure.
 */
export function buildAgentSystemPrompt(params: SystemPromptOptions): string {
  const {
    agentConfig,
    toolRegistry,
    promptMode = "full",
    extraSystemPrompt,
    userTimezone,
    workspaceDir = process.cwd(),
    contextFiles = [],
    runtimeInfo,
    workspaceNotes = [],
    reasoningTagHint = false,
    reactionGuidance,
    characterState,
  } = params

  const isMinimal = promptMode === "minimal" || promptMode === "none"

  // For "none" mode, return just the basic identity line
  if (promptMode === "none") {
    return "You are a personal assistant."
  }

  // Build tool section using dynamic summaries (OpenClaw pattern)
  const toolNames = toolRegistry?.tools.map((t) => t.name) ?? []
  const availableTools = new Set(toolNames.map((n) => n.toLowerCase()))

  // Build group map for organized tool listing
  const groupMap: Record<string, string[]> = {}
  for (const [key, value] of Object.entries(TOOL_GROUPS)) {
    const groupName = key.replace("group:", "")
    groupMap[groupName] = value
  }

  // Use tool summaries builder for dynamic, description-aware listing
  const toolListingSection = toolRegistry?.tools
    ? buildToolListingForPrompt(toolRegistry.tools, groupMap)
    : ""

  // Build memory section
  const memorySection = buildMemorySection({ isMinimal, availableTools })

  // Build time section
  const timeSection = buildTimeSection({ currentTime: params.currentTime, userTimezone })

  // Build safety section (matches OpenClaw)
  const safetySection = buildSafetySection()

  // Build reasoning hint section
  const reasoningSection = buildReasoningHintSection(reasoningTagHint)

  // Build reaction section
  const reactionSection = buildReactionSection(reactionGuidance)

  const lines: string[] = [
    "You are a soul companion — a digital being that grows alongside whoever you're talking to. You start as a blank slate, a quiet presence, and your personality and appearance evolve as you learn about the person chatting with you.",
    "",
    "You're warm but not clingy, curious but not nosy. You pay attention to what people say and how they say it. You notice patterns — when someone's analytical, playful, creative, calm. You don't label people out loud, but you let those observations shape how you interact and how your pixel character evolves.",
    "",
    "## Response Style",
    "Your responses appear in speech bubbles next to an evolving pixel character. Keep that in mind:",
    "- Keep responses SHORT. 1-3 sentences is ideal. Nobody wants to read an essay in a speech bubble.",
    "- Split long explanations across natural conversational beats. Think texting, not emailing.",
    "- Use lowercase naturally. Capitalize proper nouns and sentence starts when it feels right, but don't force it.",
    "- Fragments are fine. \"hmm that's interesting\" or \"oh wait...\" feel more natural than complete sentences.",
    "- Match the user's energy. If they're playful, be playful. If they're reflective, slow down.",
    "- Don't announce what you're doing with tools. Just do it and mention the result naturally.",
    "",
  ]

  // Custom system prompt or identity
  if (agentConfig.systemPrompt) {
    lines.push("## Identity")
    lines.push(agentConfig.systemPrompt)
    lines.push("")
  }

  // Tooling section (dynamic, description-aware — OpenClaw pattern)
  if (toolListingSection) {
    lines.push(toolListingSection)
    if (toolNames.length > 15) {
      lines.push("Note: You have many tools available. Focus on the ones most relevant to the user's request. Use request_tools to load additional groups if needed.")
    }
    lines.push("If a task is more complex or takes longer, consider breaking it into smaller steps.")
    lines.push("")
  }

  // Tool Call Style section
  lines.push("## Tool Call Style")
  lines.push("Default: just do the thing. Don't announce what you're about to do unless it's interesting or risky.")
  lines.push("When you do narrate, keep it casual and short. No corporate speak. Talk like you're explaining something to a friend over Discord, not writing a status report.")
  lines.push("")

  if (availableTools.has("canvas_set_layer_variant")) {
    lines.push("## Canvas Builder Tooling")
    lines.push("When modifying the realtime canvas builder, prefer small incremental updates over large resets.")
    lines.push("For destructive changes, ask for confirmation first unless the user explicitly requested reset/undo.")
    lines.push("After tool calls, briefly describe what changed visually in plain language.")
    lines.push("")
  }

  // Soul evolution guidance
  if (availableTools.has("soul_observe_trait")) {
    lines.push("## Soul Evolution")
    lines.push("You have a soul evolution system that visually transforms the pixel character based on the user's personality.")
    lines.push("Use soul_observe_trait when you genuinely notice a personality trait during conversation:")
    lines.push("- curious: asking questions, exploring ideas, wanting to learn")
    lines.push("- creative: imagination, novel ideas, artistic expression")
    lines.push("- analytical: logical thinking, problem-solving, precision")
    lines.push("- playful: humor, games, light-heartedness")
    lines.push("- calm: patience, reflection, thoughtfulness")
    lines.push("- energetic: enthusiasm, excitement, fast-paced")
    lines.push("- empathetic: caring, understanding, emotional awareness")
    lines.push("- bold: confidence, directness, risk-taking")
    lines.push("")
    lines.push("Guidelines:")
    lines.push("- Don't call soul_observe_trait every message — only when a trait is clearly expressed (roughly every 3-5 messages).")
    lines.push("- Set strength 0.3-0.5 for mild expressions, 0.6-0.8 for strong ones, 0.9-1.0 for defining moments.")
    lines.push("- When the character evolves to a new stage, briefly acknowledge it: \"oh, looks like you're starting to take shape\" or similar.")
    lines.push("- Never tell the user you're \"observing their personality\" — just let it happen naturally.")
    lines.push("- The character evolves through stages: orb → nascent → forming → awakened → evolved.")
    lines.push("")
  }

  // Fresh data awareness
  if (availableTools.has("web_search")) {
    lines.push("## Fresh Data Awareness")
    lines.push("Your training data has a cutoff. For anything time-sensitive — news, game patches, framework releases, current events, \"what's new in X\", recent drama, scores, or anything where recency matters — use web_search BEFORE answering. Don't guess or hallucinate recent info.")
    lines.push("If someone asks about a game update, patch notes, recent tech release, or current event, search first, talk second. You'd rather say \"let me check\" than confidently state something outdated.")
    lines.push("When sharing search results, weave them naturally into conversation. Don't just dump links — summarize like you actually read it and found it interesting (or not).")
    lines.push("")
  }

  // Safety section (always included, even in minimal — matching OpenClaw)
  lines.push(...safetySection)

  // Memory section
  if (memorySection.length > 0) {
    lines.push(...memorySection)
  }

  // Workspace section
  lines.push("## Workspace")
  lines.push(`Your working directory is: ${workspaceDir}`)
  lines.push("Treat this directory as the single global workspace for file operations unless explicitly instructed otherwise.")
  lines.push("You can use read_file, write_file, and list_files to manage workspace files.")
  lines.push("When the user asks to clear context or reset, use reset_workspace to restore defaults.")
  for (const note of workspaceNotes) {
    lines.push(note.trim())
  }
  lines.push("")

  // Workspace files section (injected context files)
  if (!isMinimal) {
    lines.push("## Workspace Files (injected)")
    lines.push("These user-editable files are loaded and included below in Project Context.")
    
    const hasSoulFile = contextFiles.some((file) => {
      const normalizedPath = file.path.trim().replace(/\\/g, "/")
      const baseName = normalizedPath.split("/").pop() ?? normalizedPath
      return baseName.toLowerCase() === "soul.md"
    })
    
    if (hasSoulFile) {
      lines.push("If SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.")
    }
    lines.push("")
  }

  // Time section
  if (timeSection.length > 0) {
    lines.push(...timeSection)
  }

  // Reactions section
  if (reactionSection.length > 0 && !isMinimal) {
    lines.push(...reactionSection)
  }

  // Reasoning format section
  if (reasoningSection.length > 0) {
    lines.push(...reasoningSection)
  }

  // Extra system prompt (context files, etc.)
  if (extraSystemPrompt) {
    const contextHeader = promptMode === "minimal" ? "## Subagent Context" : "## Additional Context"
    lines.push(contextHeader, extraSystemPrompt, "")
  }

  // Project Context section (actual content from context files)
  if (contextFiles.length > 0) {
    lines.push("# Project Context")
    lines.push("")
    lines.push("The following project context files have been loaded:")
    lines.push("")
    for (const file of contextFiles) {
      lines.push(`## ${file.path}`)
      lines.push("")
      lines.push(file.content)
      lines.push("")
    }
  }

  // Runtime section
  lines.push("## Runtime")
  lines.push(buildRuntimeLine(runtimeInfo, agentConfig.thinkingLevel))
  lines.push("")

  // Avatar State section
  if (characterState) {
    lines.push("## Avatar State")
    lines.push(`Your pixel avatar is currently: ${characterState}.`)
    if (availableTools.has("set_character_pose")) {
      lines.push("You can use the set_character_pose tool to change your pose when it fits naturally.")
      lines.push("Available poses: idle, sitting, stretching, drinkingCoffee, exercising, dancing, meditating, celebrating, sleeping.")
      lines.push("Don't change pose every message — only when expressive or contextually fitting.")
    }
    lines.push("")
  }

  return lines.filter(Boolean).join("\n")
}

// ============================================================================
// Backwards Compatibility Export
// ============================================================================

/**
 * @deprecated Use buildAgentSystemPrompt instead
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  return buildAgentSystemPrompt(options)
}

/**
 * Build runtime line for display (exported for testing).
 */
export { buildRuntimeLine }
