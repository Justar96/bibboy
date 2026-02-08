/**
 * Tool Display Configuration
 * 
 * Config-driven system for tool icons, labels, and colors.
 * Inspired by OpenClaw's tool-display.json approach.
 */

export interface ToolDisplayConfig {
  /** Emoji for the tool */
  emoji?: string
  /** Icon name (maps to SVG components in client) */
  icon: string
  /** Human-readable label */
  label: string
  /** Tailwind color classes for status states */
  colors: {
    running: string
    completed: string
    error: string
  }
  /** Keys to extract from tool arguments for display */
  argKeys?: string[]
  /** Keys to extract from result for preview */
  resultKeys?: string[]
}

/** Resolved tool display with formatted detail */
export interface ResolvedToolDisplay {
  name: string
  emoji: string
  icon: string
  label: string
  detail?: string
}

/** Max length for detail values before truncation */
const MAX_DETAIL_LENGTH = 60
/** Max entries to show in detail */
const MAX_DETAIL_ENTRIES = 3

/**
 * Default tool display configuration.
 */
export const TOOL_DISPLAY_CONFIG: Record<string, ToolDisplayConfig> = {
  // Web tools
  web_search: {
    emoji: "🔎",
    icon: "search",
    label: "Search",
    colors: {
      running: "bg-blue-500/10 border-blue-500/20 text-blue-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["query"],
    resultKeys: ["results"],
  },
  web_fetch: {
    emoji: "📄",
    icon: "globe",
    label: "Fetch",
    colors: {
      running: "bg-purple-500/10 border-purple-500/20 text-purple-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["url"],
    resultKeys: ["title", "content"],
  },
  
  // File tools
  read_file: {
    emoji: "📖",
    icon: "file",
    label: "Read",
    colors: {
      running: "bg-slate-500/10 border-slate-500/20 text-slate-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["filePath", "path"],
    resultKeys: ["content"],
  },
  create_file: {
    emoji: "✍️",
    icon: "file-plus",
    label: "Write",
    colors: {
      running: "bg-green-500/10 border-green-500/20 text-green-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["filePath", "path"],
  },
  replace_string_in_file: {
    emoji: "📝",
    icon: "edit",
    label: "Edit",
    colors: {
      running: "bg-amber-500/10 border-amber-500/20 text-amber-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["filePath", "path"],
  },
  
  // Search tools
  grep_search: {
    emoji: "🔍",
    icon: "code-search",
    label: "Grep",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["query", "includePattern"],
  },
  semantic_search: {
    emoji: "✨",
    icon: "sparkles",
    label: "Semantic",
    colors: {
      running: "bg-violet-500/10 border-violet-500/20 text-violet-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["query"],
  },
  file_search: {
    emoji: "📁",
    icon: "folder-search",
    label: "Find",
    colors: {
      running: "bg-teal-500/10 border-teal-500/20 text-teal-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["query", "pattern"],
  },
  
  // Terminal tools
  run_in_terminal: {
    emoji: "🛠️",
    icon: "terminal",
    label: "Exec",
    colors: {
      running: "bg-zinc-500/10 border-zinc-500/20 text-zinc-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["command"],
    resultKeys: ["output"],
  },
  
  // Memory tools
  memory_search: {
    emoji: "🧠",
    icon: "brain",
    label: "Memory",
    colors: {
      running: "bg-pink-500/10 border-pink-500/20 text-pink-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["query"],
    resultKeys: ["matches"],
  },

  // Canvas builder tools
  canvas_get_state: {
    emoji: "🖼️",
    icon: "sparkles",
    label: "Canvas State",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    resultKeys: ["version"],
  },
  canvas_set_layer_variant: {
    emoji: "🎨",
    icon: "paintbrush",
    label: "Layer Variant",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["layer", "variant"],
  },
  canvas_set_layer_color: {
    emoji: "🧪",
    icon: "palette",
    label: "Layer Color",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["layer", "color"],
  },
  canvas_set_palette: {
    emoji: "🌈",
    icon: "palette",
    label: "Palette",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["palette"],
  },
  canvas_set_pose: {
    emoji: "🧍",
    icon: "sparkles",
    label: "Pose",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["pose"],
  },
  canvas_set_animation: {
    emoji: "🎞️",
    icon: "sparkles",
    label: "Animation",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["animation"],
  },
  canvas_reset_character: {
    emoji: "♻️",
    icon: "wrench",
    label: "Reset Character",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
  },
  canvas_undo: {
    emoji: "↩️",
    icon: "wrench",
    label: "Undo",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
  },
  canvas_export_blueprint: {
    emoji: "📦",
    icon: "file",
    label: "Export Blueprint",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
  },
  canvas_batch_ops: {
    emoji: "⚡",
    icon: "sparkles",
    label: "Batch Edit",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    resultKeys: ["applied"],
  },
  canvas_randomize_character: {
    emoji: "🎲",
    icon: "sparkles",
    label: "Randomize",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
  },
  canvas_describe_character: {
    emoji: "📝",
    icon: "sparkles",
    label: "Describe",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    resultKeys: ["description"],
  },
  canvas_adjust_color: {
    emoji: "🎛️",
    icon: "palette",
    label: "Adjust Color",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["layer", "adjustment"],
  },
  canvas_set_layer_visibility: {
    emoji: "👁️",
    icon: "sparkles",
    label: "Visibility",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["layer", "visible"],
  },
  canvas_cycle_variant: {
    emoji: "🔄",
    icon: "paintbrush",
    label: "Cycle Variant",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["layer", "direction"],
  },
  canvas_import_blueprint: {
    emoji: "📥",
    icon: "file",
    label: "Import Blueprint",
    colors: {
      running: "bg-cyan-500/10 border-cyan-500/20 text-cyan-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
  },

  // List/navigate tools
  list_dir: {
    emoji: "📂",
    icon: "folder",
    label: "List",
    colors: {
      running: "bg-orange-500/10 border-orange-500/20 text-orange-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["path"],
  },
  
  // Agent tools
  sessions_spawn: {
    emoji: "🧑‍🔧",
    icon: "sparkles",
    label: "Sub-agent",
    colors: {
      running: "bg-indigo-500/10 border-indigo-500/20 text-indigo-400",
      completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
      error: "bg-red-500/10 border-red-500/20 text-red-400",
    },
    argKeys: ["label", "task", "agentId"],
  },
}

/**
 * Default config for unknown tools.
 */
const DEFAULT_TOOL_CONFIG: ToolDisplayConfig = {
  emoji: "🧩",
  icon: "wrench",
  label: "Tool",
  colors: {
    running: "bg-gray-500/10 border-gray-500/20 text-gray-400",
    completed: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    error: "bg-red-500/10 border-red-500/20 text-red-400",
  },
}

/**
 * Get display configuration for a tool.
 */
export function getToolDisplay(toolName: string): ToolDisplayConfig {
  return TOOL_DISPLAY_CONFIG[toolName] ?? { ...DEFAULT_TOOL_CONFIG, label: formatToolName(toolName) }
}

/**
 * Get color class for a tool's status.
 */
export function getToolStatusColor(toolName: string, status: "running" | "completed" | "error"): string {
  const config = getToolDisplay(toolName)
  return config.colors[status]
}

/**
 * Truncate text to max length with ellipsis.
 */
function truncateText(text: string, maxLength: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1)}…`
}

/**
 * Coerce a value to a display string.
 */
function coerceDisplayValue(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined
  
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    // Take first line only
    const firstLine = trimmed.split(/\r?\n/)[0]?.trim() ?? ""
    if (!firstLine) return undefined
    return truncateText(firstLine, MAX_DETAIL_LENGTH)
  }
  
  if (typeof value === "boolean") {
    return value ? "true" : undefined
  }
  
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return undefined
    return String(value)
  }
  
  if (Array.isArray(value)) {
    const values = value
      .map(item => coerceDisplayValue(item))
      .filter((item): item is string => Boolean(item))
    if (values.length === 0) return undefined
    const preview = values.slice(0, MAX_DETAIL_ENTRIES).join(", ")
    return values.length > MAX_DETAIL_ENTRIES ? `${preview}…` : preview
  }
  
  return undefined
}

/**
 * Format a path for display (shorten long paths).
 */
function formatPath(path: string): string {
  const parts = path.split("/")
  if (parts.length <= 3) return path
  return `…/${parts.slice(-2).join("/")}`
}

/**
 * Format a URL for display (show hostname only).
 */
function formatUrl(url: string): string {
  try {
    return new URL(url).hostname.replace("www.", "")
  } catch {
    return truncateText(url, 40)
  }
}

/**
 * Resolve display details from tool arguments.
 */
function resolveDetailFromArgs(args: Record<string, unknown>, keys: string[]): string | undefined {
  const entries: string[] = []
  
  for (const key of keys) {
    const value = args[key]
    if (value === undefined) continue
    
    let display: string | undefined
    
    // Special formatting for certain key types
    if (key === "url" || key === "targetUrl") {
      display = formatUrl(String(value))
    } else if (key === "filePath" || key === "path") {
      display = formatPath(String(value))
    } else if (key === "query" || key === "command") {
      const text = coerceDisplayValue(value)
      display = text ? `"${text}"` : undefined
    } else {
      display = coerceDisplayValue(value)
    }
    
    if (display) {
      entries.push(display)
    }
  }
  
  if (entries.length === 0) return undefined
  return entries.slice(0, MAX_DETAIL_ENTRIES).join(" · ")
}

/**
 * Resolve full tool display with formatted detail.
 * Following OpenClaw's resolveToolDisplay pattern.
 */
export function resolveToolDisplay(params: {
  name: string
  args?: Record<string, unknown>
}): ResolvedToolDisplay {
  const config = getToolDisplay(params.name)
  
  let detail: string | undefined
  if (params.args && config.argKeys?.length) {
    detail = resolveDetailFromArgs(params.args, config.argKeys)
  }
  
  return {
    name: params.name,
    emoji: config.emoji ?? "🧩",
    icon: config.icon,
    label: config.label,
    detail,
  }
}

/**
 * Format a tool summary line (emoji + label + detail).
 * Following OpenClaw's formatToolSummary pattern.
 */
export function formatToolSummary(display: ResolvedToolDisplay): string {
  const parts = [display.emoji, display.label]
  if (display.detail) {
    parts.push(display.detail)
  }
  return parts.join(" ")
}

/**
 * Format a tool name for display (fallback for unknown tools).
 */
function formatToolName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}
