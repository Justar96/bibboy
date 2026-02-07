import { getGlobalConfig, getAgentConfigValue } from "../config"
import {
  normalizeAgentId,
  resolveAgentConfig,
  resolveModelConfig,
  resolveMemorySearchConfig,
  resolveToolPolicy,
} from "./AgentConfig"
import type { AgentEntry, AgentsConfig, ResolvedAgentConfig } from "./AgentConfig"

// ============================================================================
// Agent Registry
// ============================================================================

const DEFAULT_AGENT_ID = "default"

/**
 * In-memory agent configuration store.
 */
class AgentConfigStore {
  private config: AgentsConfig = {}
  private resolvedCache = new Map<string, ResolvedAgentConfig>()

  /**
   * Load configuration (from object or environment).
   */
  load(config: AgentsConfig): void {
    this.config = config
    this.resolvedCache.clear()
  }

  /**
   * Get list of all configured agent IDs.
   */
  listAgentIds(): string[] {
    const list = this.config.list
    if (!Array.isArray(list) || list.length === 0) {
      return [DEFAULT_AGENT_ID]
    }
    const ids = new Set<string>()
    for (const entry of list) {
      ids.add(normalizeAgentId(entry.id))
    }
    return ids.size > 0 ? Array.from(ids) : [DEFAULT_AGENT_ID]
  }

  /**
   * Get the default agent ID.
   */
  getDefaultAgentId(): string {
    const list = this.config.list
    if (!Array.isArray(list) || list.length === 0) {
      return DEFAULT_AGENT_ID
    }
    const defaultAgent = list.find((a) => a.default)
    return normalizeAgentId(defaultAgent?.id ?? list[0]?.id ?? DEFAULT_AGENT_ID)
  }

  /**
   * Get agent entry by ID (raw, not resolved).
   */
  getAgentEntry(agentId: string): AgentEntry | undefined {
    const id = normalizeAgentId(agentId)
    return this.config.list?.find((a) => normalizeAgentId(a.id) === id)
  }

  /**
   * Get resolved agent configuration (with defaults merged).
   */
  getAgent(agentId: string): ResolvedAgentConfig | undefined {
    const id = normalizeAgentId(agentId)

    // Check cache
    const cached = this.resolvedCache.get(id)
    if (cached) {
      return cached
    }

    // Find entry
    const entry = this.getAgentEntry(id)
    if (!entry) {
      // Return default agent if requesting "default"
      if (id === DEFAULT_AGENT_ID) {
        const defaultResolved: ResolvedAgentConfig = {
          id: DEFAULT_AGENT_ID,
          name: "Default Agent",
          model: resolveModelConfig(undefined, this.config.defaults?.model),
          memorySearch: resolveMemorySearchConfig(undefined, this.config.defaults?.memorySearch, DEFAULT_AGENT_ID),
          tools: resolveToolPolicy(undefined, this.config.defaults?.tools),
          thinkingLevel: this.config.defaults?.thinkingDefault ?? "off",
          timeFormat: this.config.defaults?.timeFormat ?? "auto",
          systemPrompt: this.config.defaults?.systemPrompt,
        }
        this.resolvedCache.set(id, defaultResolved)
        return defaultResolved
      }
      return undefined
    }

    // Resolve and cache
    const resolved = resolveAgentConfig(entry, this.config.defaults)
    this.resolvedCache.set(id, resolved)
    return resolved
  }

  /**
   * Check if an agent exists.
   */
  hasAgent(agentId: string): boolean {
    const id = normalizeAgentId(agentId)
    if (id === DEFAULT_AGENT_ID) {
      return true
    }
    return this.config.list?.some((a) => normalizeAgentId(a.id) === id) ?? false
  }

  /**
   * Get the raw configuration.
   */
  getRawConfig(): AgentsConfig {
    return this.config
  }
}

/**
 * Global agent configuration store instance.
 */
export const agentConfig = new AgentConfigStore()

/**
 * Initialize agent configuration from config service or defaults.
 */
export function initializeAgentConfig(): void {
  // Load from config if available
  const configJson = getAgentConfigValue(getGlobalConfig())
  if (configJson) {
    try {
      const parsed = JSON.parse(configJson) as AgentsConfig
      agentConfig.load(parsed)
      return
    } catch {
      console.warn("Failed to parse AGENT_CONFIG configuration")
    }
  }

  // Load default configuration (matching OpenClaw's simple structure)
  agentConfig.load({
    defaults: {
      model: { primary: "gemini-3-flash-preview" },
      memorySearch: {
        enabled: true,
        provider: "gemini",
        sources: ["memory", "sessions"],
        experimental: { sessionMemory: true },
      },
      thinkingDefault: "off",
      timeFormat: "auto",
    },
    list: [
      {
        id: "default",
        name: "Soul Companion",
        default: true,
        tools: { profile: "messaging" },
      },
    ],
  })
}
