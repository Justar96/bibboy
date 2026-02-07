import { Schema, Data } from "effect"
import { getGlobalConfig } from "../config"

// ============================================================================
// Thinking Level Configuration
// ============================================================================

export const ThinkingLevelSchema = Schema.Union(
  Schema.Literal("off"),
  Schema.Literal("minimal"),
  Schema.Literal("low"),
  Schema.Literal("medium"),
  Schema.Literal("high"),
  Schema.Literal("xhigh")
)

export type ThinkingLevel = Schema.Schema.Type<typeof ThinkingLevelSchema>

/**
 * Map thinking level to Gemini thinking budget tokens.
 * Enables agents to use extended thinking without manual token config.
 */
export const THINKING_BUDGET_MAP: Record<ThinkingLevel, number | undefined> = {
  off: undefined,
  minimal: 1024,
  low: 4096,
  medium: 8192,
  high: 16384,
  xhigh: 32768,
}

export function getThinkingBudget(level: ThinkingLevel): number | undefined {
  return THINKING_BUDGET_MAP[level]
}

// ============================================================================
// Time Format Configuration
// ============================================================================

export const TimeFormatSchema = Schema.Union(
  Schema.Literal("auto"),
  Schema.Literal("12"),
  Schema.Literal("24")
)

export type TimeFormat = Schema.Schema.Type<typeof TimeFormatSchema>

// ============================================================================
// Model Configuration
// ============================================================================

export const ModelConfigSchema = Schema.Struct({
  primary: Schema.optional(Schema.String),
  fallbacks: Schema.optional(Schema.Array(Schema.String)),
})

export type ModelConfig = Schema.Schema.Type<typeof ModelConfigSchema>

// ============================================================================
// Memory Search Configuration (matching reference implementation)
// ============================================================================

const MemorySourceSchema = Schema.Union(
  Schema.Literal("memory"),
  Schema.Literal("sessions")
)

const MemoryBatchConfigSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  wait: Schema.optional(Schema.Boolean),
  concurrency: Schema.optional(Schema.Number),
  pollIntervalMs: Schema.optional(Schema.Number),
  timeoutMinutes: Schema.optional(Schema.Number),
})

const MemoryRemoteConfigSchema = Schema.Struct({
  baseUrl: Schema.optional(Schema.String),
  apiKey: Schema.optional(Schema.String),
  headers: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  batch: Schema.optional(MemoryBatchConfigSchema),
})

const MemoryLocalConfigSchema = Schema.Struct({
  modelPath: Schema.optional(Schema.String),
  modelCacheDir: Schema.optional(Schema.String),
})

const MemoryVectorConfigSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  extensionPath: Schema.optional(Schema.String),
})

const MemoryStoreConfigSchema = Schema.Struct({
  driver: Schema.optional(Schema.Literal("sqlite")),
  path: Schema.optional(Schema.String),
  vector: Schema.optional(MemoryVectorConfigSchema),
})

const MemoryChunkingConfigSchema = Schema.Struct({
  tokens: Schema.optional(Schema.Number),
  overlap: Schema.optional(Schema.Number),
})

const MemorySessionSyncConfigSchema = Schema.Struct({
  deltaBytes: Schema.optional(Schema.Number),
  deltaMessages: Schema.optional(Schema.Number),
})

const MemorySyncConfigSchema = Schema.Struct({
  onSessionStart: Schema.optional(Schema.Boolean),
  onSearch: Schema.optional(Schema.Boolean),
  watch: Schema.optional(Schema.Boolean),
  watchDebounceMs: Schema.optional(Schema.Number),
  intervalMinutes: Schema.optional(Schema.Number),
  sessions: Schema.optional(MemorySessionSyncConfigSchema),
})

const MemoryHybridConfigSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  vectorWeight: Schema.optional(Schema.Number),
  textWeight: Schema.optional(Schema.Number),
  candidateMultiplier: Schema.optional(Schema.Number),
})

const MemoryQueryConfigSchema = Schema.Struct({
  maxResults: Schema.optional(Schema.Number),
  minScore: Schema.optional(Schema.Number),
  hybrid: Schema.optional(MemoryHybridConfigSchema),
})

const MemoryCacheConfigSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  maxEntries: Schema.optional(Schema.Number),
})

const MemoryExperimentalConfigSchema = Schema.Struct({
  sessionMemory: Schema.optional(Schema.Boolean),
})

export const MemorySearchConfigSchema = Schema.Struct({
  enabled: Schema.optional(Schema.Boolean),
  sources: Schema.optional(Schema.Array(MemorySourceSchema)),
  extraPaths: Schema.optional(Schema.Array(Schema.String)),
  experimental: Schema.optional(MemoryExperimentalConfigSchema),
  provider: Schema.optional(
    Schema.Union(
      Schema.Literal("gemini"),
      Schema.Literal("local"),
      Schema.Literal("auto")
    )
  ),
  remote: Schema.optional(MemoryRemoteConfigSchema),
  fallback: Schema.optional(
    Schema.Union(
      Schema.Literal("gemini"),
      Schema.Literal("local"),
      Schema.Literal("none")
    )
  ),
  model: Schema.optional(Schema.String),
  local: Schema.optional(MemoryLocalConfigSchema),
  store: Schema.optional(MemoryStoreConfigSchema),
  chunking: Schema.optional(MemoryChunkingConfigSchema),
  sync: Schema.optional(MemorySyncConfigSchema),
  query: Schema.optional(MemoryQueryConfigSchema),
  cache: Schema.optional(MemoryCacheConfigSchema),
  // Legacy fields (kept for backwards compatibility)
  maxResults: Schema.optional(Schema.Number),
  minScore: Schema.optional(Schema.Number),
})

export type MemorySearchConfig = Schema.Schema.Type<typeof MemorySearchConfigSchema>

// ============================================================================
// Tool Profile Configuration (matching reference implementation)
// ============================================================================

export const ToolProfileSchema = Schema.Union(
  Schema.Literal("minimal"),
  Schema.Literal("coding"),
  Schema.Literal("messaging"),
  Schema.Literal("full")
)

export type ToolProfile = Schema.Schema.Type<typeof ToolProfileSchema>

// ============================================================================
// Tool Policy Configuration (matching reference implementation)
// ============================================================================

export const ToolPolicySchema = Schema.Struct({
  profile: Schema.optional(ToolProfileSchema),
  allow: Schema.optional(Schema.Array(Schema.String)),
  alsoAllow: Schema.optional(Schema.Array(Schema.String)),
  deny: Schema.optional(Schema.Array(Schema.String)),
  byProvider: Schema.optional(
    Schema.Record({
      key: Schema.String,
      value: Schema.Struct({
        profile: Schema.optional(ToolProfileSchema),
        allow: Schema.optional(Schema.Array(Schema.String)),
        alsoAllow: Schema.optional(Schema.Array(Schema.String)),
        deny: Schema.optional(Schema.Array(Schema.String)),
      }),
    })
  ),
})

export type ToolPolicy = Schema.Schema.Type<typeof ToolPolicySchema>

// ============================================================================
// Agent Entry Configuration
// ============================================================================

export const AgentEntrySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.optional(Schema.String),
  default: Schema.optional(Schema.Boolean),
  model: Schema.optional(
    Schema.Union(Schema.String, ModelConfigSchema)
  ),
  memorySearch: Schema.optional(MemorySearchConfigSchema),
  tools: Schema.optional(ToolPolicySchema),
  thinkingDefault: Schema.optional(ThinkingLevelSchema),
  timeFormat: Schema.optional(TimeFormatSchema),
  /** System prompt additions */
  systemPrompt: Schema.optional(Schema.String),
  /** Character persona (for character-based agents) */
  character: Schema.optional(Schema.String),
})

export type AgentEntry = Schema.Schema.Type<typeof AgentEntrySchema>

// ============================================================================
// Agent Defaults Configuration
// ============================================================================

export const AgentDefaultsSchema = Schema.Struct({
  model: Schema.optional(ModelConfigSchema),
  memorySearch: Schema.optional(MemorySearchConfigSchema),
  tools: Schema.optional(ToolPolicySchema),
  thinkingDefault: Schema.optional(ThinkingLevelSchema),
  timeFormat: Schema.optional(TimeFormatSchema),
  /** Default system prompt additions */
  systemPrompt: Schema.optional(Schema.String),
})

export type AgentDefaults = Schema.Schema.Type<typeof AgentDefaultsSchema>

// ============================================================================
// Full Agents Configuration
// ============================================================================

export const AgentsConfigSchema = Schema.Struct({
  defaults: Schema.optional(AgentDefaultsSchema),
  list: Schema.optional(Schema.Array(AgentEntrySchema)),
})

export type AgentsConfig = Schema.Schema.Type<typeof AgentsConfigSchema>

// ============================================================================
// Agent Config Errors
// ============================================================================

export class AgentNotFoundError extends Data.TaggedError("AgentNotFoundError")<{
  readonly agentId: string
}> {}

export class AgentConfigError extends Data.TaggedError("AgentConfigError")<{
  readonly reason: string
}> {}

// ============================================================================
// Resolved Agent Configuration (matching reference implementation)
// ============================================================================

export interface ResolvedMemorySearchConfig {
  enabled: boolean
  sources: Array<"memory" | "sessions">
  extraPaths: string[]
  provider: "gemini" | "local" | "auto"
  remote?: {
    baseUrl?: string
    apiKey?: string
    headers?: Record<string, string>
    batch?: {
      enabled: boolean
      wait: boolean
      concurrency: number
      pollIntervalMs: number
      timeoutMinutes: number
    }
  }
  experimental: {
    sessionMemory: boolean
  }
  fallback: "gemini" | "local" | "none"
  model: string
  local: {
    modelPath?: string
    modelCacheDir?: string
  }
  store: {
    driver: "sqlite"
    path: string
    vector: {
      enabled: boolean
      extensionPath?: string
    }
  }
  chunking: {
    tokens: number
    overlap: number
  }
  sync: {
    onSessionStart: boolean
    onSearch: boolean
    watch: boolean
    watchDebounceMs: number
    intervalMinutes: number
    sessions: {
      deltaBytes: number
      deltaMessages: number
    }
  }
  query: {
    maxResults: number
    minScore: number
    hybrid: {
      enabled: boolean
      vectorWeight: number
      textWeight: number
      candidateMultiplier: number
    }
  }
  cache: {
    enabled: boolean
    maxEntries?: number
  }
}

export interface ResolvedToolPolicy {
  profile: ToolProfile | null
  allow: string[]
  alsoAllow: string[]
  deny: string[]
  byProvider: Record<string, {
    profile?: ToolProfile
    allow?: string[]
    alsoAllow?: string[]
    deny?: string[]
  }>
}

export interface ResolvedAgentConfig {
  id: string
  name: string
  model: {
    primary: string
    fallbacks: string[]
  }
  memorySearch: ResolvedMemorySearchConfig
  tools: ResolvedToolPolicy
  thinkingLevel: ThinkingLevel
  timeFormat: TimeFormat
  systemPrompt?: string
  character?: string
}

// ============================================================================
// Default Values (matching reference implementation)
// ============================================================================

const DEFAULT_MODEL_PRIMARY = "gemini-3-flash-preview"
const DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001"
const DEFAULT_CHUNK_TOKENS = 400
const DEFAULT_CHUNK_OVERLAP = 80
const DEFAULT_WATCH_DEBOUNCE_MS = 1500
const DEFAULT_SESSION_DELTA_BYTES = 100_000
const DEFAULT_SESSION_DELTA_MESSAGES = 50
const DEFAULT_MAX_RESULTS = 6
const DEFAULT_MIN_SCORE = 0.35
const DEFAULT_HYBRID_ENABLED = true
const DEFAULT_HYBRID_VECTOR_WEIGHT = 0.7
const DEFAULT_HYBRID_TEXT_WEIGHT = 0.3
const DEFAULT_HYBRID_CANDIDATE_MULTIPLIER = 4
const DEFAULT_CACHE_ENABLED = true
const DEFAULT_SOURCES: Array<"memory" | "sessions"> = ["memory"]

// ============================================================================
// Helper Functions
// ============================================================================

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function clampInt(value: number, min: number, max: number): number {
  return Math.floor(clampNumber(value, min, max))
}

function normalizeSources(
  sources: Array<"memory" | "sessions"> | undefined,
  sessionMemoryEnabled: boolean
): Array<"memory" | "sessions"> {
  const normalized = new Set<"memory" | "sessions">()
  const input = sources?.length ? sources : DEFAULT_SOURCES
  for (const source of input) {
    if (source === "memory") {
      normalized.add("memory")
    }
    if (source === "sessions" && sessionMemoryEnabled) {
      normalized.add("sessions")
    }
  }
  if (normalized.size === 0) {
    normalized.add("memory")
  }
  return Array.from(normalized)
}

function resolveStorePath(agentId: string, raw?: string): string {
  const config = getGlobalConfig()
  const stateDir = config.agentStateDir
  const fallback = `${stateDir}/memory/${agentId}.sqlite`
  if (!raw) {
    return fallback
  }
  const withToken = raw.includes("{agentId}") ? raw.replaceAll("{agentId}", agentId) : raw
  // Expand ~ to home dir
  if (withToken.startsWith("~")) {
    return config.homeDir + withToken.slice(1)
  }
  return withToken
}

// ============================================================================
// Configuration Resolution
// ============================================================================

/**
 * Normalize agentId to lowercase, trimmed.
 */
export function normalizeAgentId(id: string | undefined): string {
  return (id ?? "default").trim().toLowerCase()
}

/**
 * Resolve model configuration, merging agent-specific with defaults.
 */
export function resolveModelConfig(
  agentModel: AgentEntry["model"],
  defaultModel: AgentDefaults["model"]
): { primary: string; fallbacks: string[] } {
  let primary: string | undefined
  let fallbacks: string[] | undefined

  // Agent-specific model
  if (typeof agentModel === "string") {
    primary = agentModel
  } else if (agentModel) {
    primary = agentModel.primary
    fallbacks = agentModel.fallbacks ? [...agentModel.fallbacks] : undefined
  }

  // Fall back to defaults
  if (!primary) {
    primary = defaultModel?.primary
  }
  if (!fallbacks) {
    fallbacks = defaultModel?.fallbacks ? [...defaultModel.fallbacks] : undefined
  }

  return {
    primary: primary || DEFAULT_MODEL_PRIMARY,
    fallbacks: fallbacks || [],
  }
}

/**
 * Resolve memory search configuration (matching reference implementation).
 */
export function resolveMemorySearchConfig(
  agentConfig: MemorySearchConfig | undefined,
  defaultConfig: MemorySearchConfig | undefined,
  agentId: string
): ResolvedMemorySearchConfig {
  const enabled = agentConfig?.enabled ?? defaultConfig?.enabled ?? true
  const sessionMemory = agentConfig?.experimental?.sessionMemory ?? defaultConfig?.experimental?.sessionMemory ?? false
  const provider = agentConfig?.provider ?? defaultConfig?.provider ?? "auto"
  
  const model = agentConfig?.model ?? defaultConfig?.model ?? DEFAULT_GEMINI_EMBEDDING_MODEL

  // Resolve sources (cast readonly arrays to mutable)
  const sourcesInput = (agentConfig?.sources ?? defaultConfig?.sources) as Array<"memory" | "sessions"> | undefined
  const sources = normalizeSources(sourcesInput, sessionMemory)
  
  // Extra paths
  const rawPaths = [...(defaultConfig?.extraPaths ?? []), ...(agentConfig?.extraPaths ?? [])]
    .map((value) => value.trim())
    .filter(Boolean)
  const extraPaths = Array.from(new Set(rawPaths))

  // Remote config
  const defaultRemote = defaultConfig?.remote
  const overrideRemote = agentConfig?.remote
  const hasRemoteConfig = Boolean(
    overrideRemote?.baseUrl || overrideRemote?.apiKey || overrideRemote?.headers ||
    defaultRemote?.baseUrl || defaultRemote?.apiKey || defaultRemote?.headers
  )
  const includeRemote = hasRemoteConfig || provider === "gemini" || provider === "auto"
  
  const batch = {
    enabled: overrideRemote?.batch?.enabled ?? defaultRemote?.batch?.enabled ?? true,
    wait: overrideRemote?.batch?.wait ?? defaultRemote?.batch?.wait ?? true,
    concurrency: Math.max(1, overrideRemote?.batch?.concurrency ?? defaultRemote?.batch?.concurrency ?? 2),
    pollIntervalMs: overrideRemote?.batch?.pollIntervalMs ?? defaultRemote?.batch?.pollIntervalMs ?? 2000,
    timeoutMinutes: overrideRemote?.batch?.timeoutMinutes ?? defaultRemote?.batch?.timeoutMinutes ?? 60,
  }
  
  const remote = includeRemote ? {
    baseUrl: overrideRemote?.baseUrl ?? defaultRemote?.baseUrl,
    apiKey: overrideRemote?.apiKey ?? defaultRemote?.apiKey,
    headers: overrideRemote?.headers ?? defaultRemote?.headers,
    batch,
  } : undefined

  // Fallback provider
  const fallback = agentConfig?.fallback ?? defaultConfig?.fallback ?? "none"

  // Local model config
  const local = {
    modelPath: agentConfig?.local?.modelPath ?? defaultConfig?.local?.modelPath,
    modelCacheDir: agentConfig?.local?.modelCacheDir ?? defaultConfig?.local?.modelCacheDir,
  }

  // Store config
  const vector = {
    enabled: agentConfig?.store?.vector?.enabled ?? defaultConfig?.store?.vector?.enabled ?? true,
    extensionPath: agentConfig?.store?.vector?.extensionPath ?? defaultConfig?.store?.vector?.extensionPath,
  }
  const store = {
    driver: agentConfig?.store?.driver ?? defaultConfig?.store?.driver ?? "sqlite" as const,
    path: resolveStorePath(agentId, agentConfig?.store?.path ?? defaultConfig?.store?.path),
    vector,
  }

  // Chunking config
  const chunkTokens = agentConfig?.chunking?.tokens ?? defaultConfig?.chunking?.tokens ?? DEFAULT_CHUNK_TOKENS
  const chunkOverlap = agentConfig?.chunking?.overlap ?? defaultConfig?.chunking?.overlap ?? DEFAULT_CHUNK_OVERLAP
  const chunking = {
    tokens: Math.max(1, chunkTokens),
    overlap: clampNumber(chunkOverlap, 0, Math.max(0, chunkTokens - 1)),
  }

  // Sync config
  const sync = {
    onSessionStart: agentConfig?.sync?.onSessionStart ?? defaultConfig?.sync?.onSessionStart ?? true,
    onSearch: agentConfig?.sync?.onSearch ?? defaultConfig?.sync?.onSearch ?? true,
    watch: agentConfig?.sync?.watch ?? defaultConfig?.sync?.watch ?? true,
    watchDebounceMs: agentConfig?.sync?.watchDebounceMs ?? defaultConfig?.sync?.watchDebounceMs ?? DEFAULT_WATCH_DEBOUNCE_MS,
    intervalMinutes: agentConfig?.sync?.intervalMinutes ?? defaultConfig?.sync?.intervalMinutes ?? 0,
    sessions: {
      deltaBytes: clampInt(
        agentConfig?.sync?.sessions?.deltaBytes ?? defaultConfig?.sync?.sessions?.deltaBytes ?? DEFAULT_SESSION_DELTA_BYTES,
        0, Number.MAX_SAFE_INTEGER
      ),
      deltaMessages: clampInt(
        agentConfig?.sync?.sessions?.deltaMessages ?? defaultConfig?.sync?.sessions?.deltaMessages ?? DEFAULT_SESSION_DELTA_MESSAGES,
        0, Number.MAX_SAFE_INTEGER
      ),
    },
  }

  // Query config with hybrid search
  const maxResults = agentConfig?.query?.maxResults ?? agentConfig?.maxResults ?? defaultConfig?.query?.maxResults ?? defaultConfig?.maxResults ?? DEFAULT_MAX_RESULTS
  const minScore = clampNumber(
    agentConfig?.query?.minScore ?? agentConfig?.minScore ?? defaultConfig?.query?.minScore ?? defaultConfig?.minScore ?? DEFAULT_MIN_SCORE,
    0, 1
  )
  const hybridEnabled = agentConfig?.query?.hybrid?.enabled ?? defaultConfig?.query?.hybrid?.enabled ?? DEFAULT_HYBRID_ENABLED
  const vectorWeight = clampNumber(
    agentConfig?.query?.hybrid?.vectorWeight ?? defaultConfig?.query?.hybrid?.vectorWeight ?? DEFAULT_HYBRID_VECTOR_WEIGHT,
    0, 1
  )
  const textWeight = clampNumber(
    agentConfig?.query?.hybrid?.textWeight ?? defaultConfig?.query?.hybrid?.textWeight ?? DEFAULT_HYBRID_TEXT_WEIGHT,
    0, 1
  )
  const sum = vectorWeight + textWeight
  const normalizedVectorWeight = sum > 0 ? vectorWeight / sum : DEFAULT_HYBRID_VECTOR_WEIGHT
  const normalizedTextWeight = sum > 0 ? textWeight / sum : DEFAULT_HYBRID_TEXT_WEIGHT
  const candidateMultiplier = clampInt(
    agentConfig?.query?.hybrid?.candidateMultiplier ?? defaultConfig?.query?.hybrid?.candidateMultiplier ?? DEFAULT_HYBRID_CANDIDATE_MULTIPLIER,
    1, 20
  )
  
  const query = {
    maxResults,
    minScore,
    hybrid: {
      enabled: Boolean(hybridEnabled),
      vectorWeight: normalizedVectorWeight,
      textWeight: normalizedTextWeight,
      candidateMultiplier,
    },
  }

  // Cache config
  const cacheEnabled = agentConfig?.cache?.enabled ?? defaultConfig?.cache?.enabled ?? DEFAULT_CACHE_ENABLED
  const cacheMaxEntries = agentConfig?.cache?.maxEntries ?? defaultConfig?.cache?.maxEntries
  const cache = {
    enabled: Boolean(cacheEnabled),
    maxEntries: typeof cacheMaxEntries === "number" && Number.isFinite(cacheMaxEntries)
      ? Math.max(1, Math.floor(cacheMaxEntries))
      : undefined,
  }

  return {
    enabled,
    sources,
    extraPaths,
    provider,
    remote,
    experimental: { sessionMemory },
    fallback,
    model,
    local,
    store,
    chunking,
    sync,
    query,
    cache,
  }
}

/**
 * Resolve tool policy (matching reference implementation).
 */
export function resolveToolPolicy(
  agentPolicy: ToolPolicy | undefined,
  defaultPolicy: ToolPolicy | undefined
): ResolvedToolPolicy {
  // Merge byProvider with proper type conversion
  const mergedByProvider: Record<string, {
    profile?: ToolProfile
    allow?: string[]
    alsoAllow?: string[]
    deny?: string[]
  }> = {}
  
  const defaultByProvider = defaultPolicy?.byProvider ?? {}
  const agentByProvider = agentPolicy?.byProvider ?? {}
  
  for (const [key, value] of Object.entries(defaultByProvider)) {
    mergedByProvider[key] = {
      profile: value.profile,
      allow: value.allow ? [...value.allow] : undefined,
      alsoAllow: value.alsoAllow ? [...value.alsoAllow] : undefined,
      deny: value.deny ? [...value.deny] : undefined,
    }
  }
  
  for (const [key, value] of Object.entries(agentByProvider)) {
    mergedByProvider[key] = {
      profile: value.profile ?? mergedByProvider[key]?.profile,
      allow: value.allow ? [...value.allow] : mergedByProvider[key]?.allow,
      alsoAllow: value.alsoAllow ? [...value.alsoAllow] : mergedByProvider[key]?.alsoAllow,
      deny: value.deny ? [...value.deny] : mergedByProvider[key]?.deny,
    }
  }

  return {
    profile: agentPolicy?.profile ?? defaultPolicy?.profile ?? null,
    allow: agentPolicy?.allow ? [...agentPolicy.allow] : defaultPolicy?.allow ? [...defaultPolicy.allow] : [],
    alsoAllow: agentPolicy?.alsoAllow ? [...agentPolicy.alsoAllow] : defaultPolicy?.alsoAllow ? [...defaultPolicy.alsoAllow] : [],
    deny: agentPolicy?.deny ? [...agentPolicy.deny] : defaultPolicy?.deny ? [...defaultPolicy.deny] : [],
    byProvider: mergedByProvider,
  }
}

/**
 * Resolve full agent configuration by merging agent-specific with defaults.
 */
export function resolveAgentConfig(
  agent: AgentEntry,
  defaults: AgentDefaults | undefined
): ResolvedAgentConfig {
  const agentId = normalizeAgentId(agent.id)
  return {
    id: agentId,
    name: agent.name ?? agent.id,
    model: resolveModelConfig(agent.model, defaults?.model),
    memorySearch: resolveMemorySearchConfig(agent.memorySearch, defaults?.memorySearch, agentId),
    tools: resolveToolPolicy(agent.tools, defaults?.tools),
    thinkingLevel: agent.thinkingDefault ?? defaults?.thinkingDefault ?? "off",
    timeFormat: agent.timeFormat ?? defaults?.timeFormat ?? "auto",
    systemPrompt: agent.systemPrompt ?? defaults?.systemPrompt,
    character: agent.character,
  }
}

// Re-export store from dedicated module
export { agentConfig, initializeAgentConfig } from "./AgentConfigStore"
