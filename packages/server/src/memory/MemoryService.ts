import type { ChatMessage } from "@bibboy/shared"
import { getMemoryStore } from "./MemoryStore"
import type { ResolvedAgentConfig } from "../agents/AgentConfig"

// ============================================================================
// Memory Service Types
// ============================================================================

export interface MemorySearchOptions {
  maxResults?: number
  minScore?: number
}

export interface MemoryGetOptions {
  from?: number
  lines?: number
}

export interface FormattedSearchResult {
  path: string
  lineStart: number
  lineEnd: number
  snippet: string
  score: number
}

// ============================================================================
// Memory Service
// ============================================================================

/**
 * High-level memory service that combines vector search with session context.
 *
 * For the bibboy chat, session memory is primary — the conversation history
 * within the current session IS the memory. SQLite-backed vector search is
 * optional and used for workspace/SOUL.md context if indexed.
 */
export class MemoryService {
  private agentId: string
  private config: ResolvedAgentConfig["memorySearch"]
  private sessionMessages: () => ChatMessage[]

  constructor(
    agentId: string,
    config: ResolvedAgentConfig["memorySearch"],
    getSessionMessages: () => ChatMessage[]
  ) {
    this.agentId = agentId
    this.config = config
    this.sessionMessages = getSessionMessages
  }

  /**
   * Search memory using session context + optional vector search.
   * Session messages are always searched (they're the primary memory source).
   * Vector store is searched only if "memory" is in sources and store is available.
   */
  async search(query: string, options?: MemorySearchOptions): Promise<FormattedSearchResult[]> {
    if (!this.config.enabled) {
      return []
    }

    const maxResults = options?.maxResults ?? this.config.query.maxResults
    const minScore = options?.minScore ?? this.config.query.minScore

    const results: FormattedSearchResult[] = []

    // Always search session messages — this is the primary memory for casual chat
    const sessionResults = this.searchSession(query, maxResults)
    for (const result of sessionResults) {
      results.push({
        path: "session",
        lineStart: result.messageIndex,
        lineEnd: result.messageIndex,
        snippet: result.snippet,
        score: result.score,
      })
    }

    // Vector search in persistent memory (optional, if "memory" is in sources)
    if (this.config.sources.includes("memory")) {
      try {
        const store = getMemoryStore(this.agentId)
        const storeResults = await store.search(query, { maxResults, minScore })

        for (const result of storeResults) {
          results.push({
            path: result.chunk.source,
            lineStart: result.chunk.lineStart,
            lineEnd: result.chunk.lineEnd,
            snippet: result.snippet,
            score: result.score,
          })
        }
      } catch (error) {
        // Non-fatal — session memory still works without vector store
        console.warn(`Memory store search failed (session memory still available): ${error}`)
      }
    }

    // Sort by score and dedupe
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, maxResults)
  }

  /**
   * Search through current session messages with improved scoring.
   * Groups consecutive user/assistant turns as exchanges for better context.
   */
  private searchSession(
    query: string,
    maxResults: number
  ): Array<{ snippet: string; score: number; messageIndex: number }> {
    const messages = this.sessionMessages()
    if (messages.length === 0) return []

    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter((w) => w.length > 2) // skip tiny words

    const results: Array<{ snippet: string; score: number; timestamp: number; messageIndex: number }> = []

    // Score individual messages
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg.content?.trim()) continue

      const contentLower = msg.content.toLowerCase()
      let score = 0

      // Exact phrase match (strong signal)
      if (contentLower.includes(queryLower)) {
        score += 0.7
      }

      // Word overlap scoring (TF-style: more matching words = higher score)
      let matchedWords = 0
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          matchedWords++
        }
      }
      if (queryWords.length > 0) {
        score += (matchedWords / queryWords.length) * 0.3
      }

      // Recency boost: recent messages get a small boost (0-0.1)
      const recencyFactor = messages.length > 1 ? i / (messages.length - 1) : 1
      score += recencyFactor * 0.1

      if (score > 0.15) {
        // Build snippet with role context for better readability
        const rolePrefix = msg.role === "user" ? "[user]" : "[assistant]"
        const snippetContent = this.extractSnippet(msg.content, query, 300)

        results.push({
          snippet: `${rolePrefix} ${snippetContent}`,
          score: Math.min(score, 1),
          timestamp: msg.timestamp,
          messageIndex: i,
        })
      }
    }

    // Also create exchange-level results (user + assistant pairs)
    // This helps the agent find the full context of a conversation beat
    for (let i = 0; i < messages.length - 1; i++) {
      if (messages[i].role !== "user" || messages[i + 1]?.role !== "assistant") continue

      const userContent = messages[i].content?.toLowerCase() ?? ""
      const assistantContent = messages[i + 1].content?.toLowerCase() ?? ""
      const combined = `${userContent} ${assistantContent}`

      let score = 0
      if (combined.includes(queryLower)) {
        score += 0.65
      }

      let matchedWords = 0
      for (const word of queryWords) {
        if (combined.includes(word)) matchedWords++
      }
      if (queryWords.length > 0) {
        score += (matchedWords / queryWords.length) * 0.3
      }

      if (score > 0.2) {
        const userSnippet = this.extractSnippet(messages[i].content, query, 150)
        const assistantSnippet = this.extractSnippet(messages[i + 1].content, query, 150)

        results.push({
          snippet: `[exchange] user: ${userSnippet}\nassistant: ${assistantSnippet}`,
          score: Math.min(score, 0.95), // Slightly lower ceiling to prefer exact message matches
          timestamp: messages[i + 1].timestamp,
          messageIndex: i,
        })
      }
    }

    // Sort by score, break ties by recency
    results.sort((a, b) => {
      if (Math.abs(a.score - b.score) < 0.05) {
        return b.timestamp - a.timestamp
      }
      return b.score - a.score
    })

    // Deduplicate overlapping results (prefer higher-scored)
    const seen = new Set<number>()
    const deduped: typeof results = []
    for (const result of results) {
      if (!seen.has(result.messageIndex)) {
        seen.add(result.messageIndex)
        deduped.push(result)
      }
    }

    return deduped.slice(0, maxResults)
  }

  /**
   * Get content from memory by path and line range.
   */
  get(path: string, options?: MemoryGetOptions): string | null {
    if (!this.config.enabled) {
      return null
    }

    if (path === "session") {
      // Return session messages as formatted transcript
      const messages = this.sessionMessages()
      const from = options?.from ?? 0
      const count = options?.lines ?? messages.length

      return messages
        .slice(from, from + count)
        .map((m, i) => `[${from + i}] [${m.role}]: ${m.content}`)
        .join("\n\n")
    }

    try {
      const store = getMemoryStore(this.agentId)
      return store.getContent(path, options?.from, options?.lines)
    } catch (error) {
      console.warn(`Memory get failed: ${error}`)
      return null
    }
  }

  /**
   * Index content into memory.
   */
  async index(path: string, content: string): Promise<number> {
    if (!this.config.enabled) {
      return 0
    }

    try {
      const store = getMemoryStore(this.agentId)
      return await store.indexFile(path, content, {
        tokens: this.config.chunking.tokens,
        overlap: this.config.chunking.overlap,
      })
    } catch (error) {
      console.warn(`Memory index failed: ${error}`)
      return 0
    }
  }

  /**
   * Extract relevant snippet from content.
   */
  private extractSnippet(content: string, query: string, maxLength: number = 300): string {
    const contentLower = content.toLowerCase()
    const queryLower = query.toLowerCase()

    // If content is short enough, return it all
    if (content.length <= maxLength) {
      return content
    }

    let pos = contentLower.indexOf(queryLower)
    if (pos === -1) {
      // Try matching first significant word
      const words = queryLower.split(/\s+/).filter((w) => w.length > 2)
      for (const word of words) {
        pos = contentLower.indexOf(word)
        if (pos !== -1) break
      }
    }
    if (pos === -1) {
      pos = 0
    }

    const start = Math.max(0, pos - 80)
    const end = Math.min(content.length, start + maxLength)
    let snippet = content.slice(start, end)

    if (start > 0) snippet = "..." + snippet
    if (end < content.length) snippet = snippet + "..."

    return snippet
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a memory service for an agent.
 */
export function createMemoryService(
  agentConfig: ResolvedAgentConfig,
  getSessionMessages: () => ChatMessage[]
): MemoryService {
  return new MemoryService(agentConfig.id, agentConfig.memorySearch, getSessionMessages)
}
