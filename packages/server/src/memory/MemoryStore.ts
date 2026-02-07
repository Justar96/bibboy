import { Database } from "bun:sqlite"
import path from "node:path"
import os from "node:os"
import fs from "node:fs"
import {
  generateEmbedding,
  cosineSimilarity,
  embeddingToBuffer,
  bufferToEmbedding,
  chunkText,
} from "./EmbeddingService"

// ============================================================================
// Types
// ============================================================================

export interface MemoryChunk {
  id: number
  source: string
  content: string
  lineStart: number
  lineEnd: number
  embedding?: number[]
  createdAt: number
  updatedAt: number
}

export interface MemorySearchResult {
  chunk: MemoryChunk
  score: number
  snippet: string
}

export interface MemoryStoreOptions {
  dbPath?: string
  agentId?: string
}

// ============================================================================
// SQLite Memory Store
// ============================================================================

const DEFAULT_STATE_DIR = path.join(os.homedir(), ".portfolio")

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function resolveDbPath(options?: MemoryStoreOptions): string {
  if (options?.dbPath) {
    return options.dbPath
  }
  const stateDir = path.join(DEFAULT_STATE_DIR, "memory")
  ensureDir(stateDir)
  const agentId = options?.agentId ?? "default"
  return path.join(stateDir, `${agentId}.sqlite`)
}

/**
 * SQLite-based memory store with vector search.
 */
export class MemoryStore {
  private db: Database
  private embeddingModel: string

  constructor(options?: MemoryStoreOptions & { embeddingModel?: string }) {
    const dbPath = resolveDbPath(options)
    ensureDir(path.dirname(dbPath))

    this.db = new Database(dbPath)
    this.embeddingModel = options?.embeddingModel ?? "gemini-embedding-001"
    this.initSchema()
  }

  private initSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        content TEXT NOT NULL,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        embedding BLOB,
        created_at INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)

    this.db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)
    `)

    this.db.run(`
      CREATE TABLE IF NOT EXISTS sources (
        path TEXT PRIMARY KEY,
        hash TEXT NOT NULL,
        indexed_at INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)
  }

  /**
   * Index a file into memory chunks.
   */
  async indexFile(
    filePath: string,
    content: string,
    options?: { tokens?: number; overlap?: number }
  ): Promise<number> {
    // Calculate content hash
    const hash = Bun.hash(content).toString(16)

    // Check if already indexed with same hash
    const existing = this.db
      .query<{ hash: string }, [string]>("SELECT hash FROM sources WHERE path = ?")
      .get(filePath)

    if (existing?.hash === hash) {
      return 0 // Already up to date
    }

    // Remove old chunks for this source
    this.db.run("DELETE FROM chunks WHERE source = ?", [filePath])

    // Split into chunks
    const chunks = chunkText(content, options)

    // Track line positions for each chunk
    interface ChunkWithLines {
      content: string
      lineStart: number
      lineEnd: number
    }

    const chunksWithLines: ChunkWithLines[] = []
    let searchPos = 0

    for (const chunkContent of chunks) {
      const chunkStart = content.indexOf(chunkContent, searchPos)
      const lineStart = content.slice(0, chunkStart).split("\n").length
      const lineEnd = lineStart + chunkContent.split("\n").length - 1
      chunksWithLines.push({ content: chunkContent, lineStart, lineEnd })
      searchPos = chunkStart + 1
    }

    // Generate embeddings
    const embeddings: number[][] = []
    for (const chunk of chunksWithLines) {
      try {
        const result = await generateEmbedding(chunk.content, { model: this.embeddingModel })
        embeddings.push(result.embedding)
      } catch (error) {
        console.warn(`Failed to embed chunk: ${error}`)
        embeddings.push([]) // Empty embedding on failure
      }
    }

    // Insert chunks
    const stmt = this.db.prepare(`
      INSERT INTO chunks (source, content, line_start, line_end, embedding)
      VALUES (?, ?, ?, ?, ?)
    `)

    for (let i = 0; i < chunksWithLines.length; i++) {
      const chunk = chunksWithLines[i]
      const embedding = embeddings[i]
      const embeddingBlob = embedding.length > 0 ? embeddingToBuffer(embedding) : null
      stmt.run(filePath, chunk.content, chunk.lineStart, chunk.lineEnd, embeddingBlob)
    }

    // Update source record
    this.db.run(
      `INSERT OR REPLACE INTO sources (path, hash, indexed_at) VALUES (?, ?, unixepoch())`,
      [filePath, hash]
    )

    return chunksWithLines.length
  }

  /**
   * Search memory using vector similarity.
   */
  async search(
    query: string,
    options?: { maxResults?: number; minScore?: number }
  ): Promise<MemorySearchResult[]> {
    const maxResults = options?.maxResults ?? 6
    const minScore = options?.minScore ?? 0.35

    // Generate query embedding
    let queryEmbedding: number[]
    try {
      const result = await generateEmbedding(query, { model: this.embeddingModel })
      queryEmbedding = result.embedding
    } catch (error) {
      console.warn(`Failed to embed query: ${error}`)
      // Fall back to text search
      return this.textSearch(query, maxResults)
    }

    // Get all chunks with embeddings
    const rows = this.db
      .query<
        {
          id: number
          source: string
          content: string
          line_start: number
          line_end: number
          embedding: Buffer | null
          created_at: number
          updated_at: number
        },
        []
      >("SELECT * FROM chunks WHERE embedding IS NOT NULL")
      .all()

    // Calculate similarity scores
    const scored: MemorySearchResult[] = []

    for (const row of rows) {
      if (!row.embedding) continue

      const embedding = bufferToEmbedding(row.embedding)
      // Skip embeddings with mismatched dimensions (e.g. old OpenAI embeddings)
      if (queryEmbedding.length !== embedding.length) continue
      const score = cosineSimilarity(queryEmbedding, embedding)

      if (score >= minScore) {
        scored.push({
          chunk: {
            id: row.id,
            source: row.source,
            content: row.content,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          score,
          snippet: this.extractSnippet(row.content, query),
        })
      }
    }

    // Sort by score and return top results
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, maxResults)
  }

  /**
   * Fallback text-based search.
   */
  private textSearch(query: string, maxResults: number): MemorySearchResult[] {
    const queryLower = query.toLowerCase()
    const queryWords = queryLower.split(/\s+/).filter(Boolean)

    const rows = this.db
      .query<
        {
          id: number
          source: string
          content: string
          line_start: number
          line_end: number
          created_at: number
          updated_at: number
        },
        []
      >("SELECT id, source, content, line_start, line_end, created_at, updated_at FROM chunks")
      .all()

    const scored: MemorySearchResult[] = []

    for (const row of rows) {
      const contentLower = row.content.toLowerCase()
      let score = 0

      // Exact phrase match
      if (contentLower.includes(queryLower)) {
        score += 0.8
      }

      // Word matches
      for (const word of queryWords) {
        if (contentLower.includes(word)) {
          score += 0.1
        }
      }

      if (score > 0) {
        scored.push({
          chunk: {
            id: row.id,
            source: row.source,
            content: row.content,
            lineStart: row.line_start,
            lineEnd: row.line_end,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
          },
          score: Math.min(score, 1),
          snippet: this.extractSnippet(row.content, query),
        })
      }
    }

    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, maxResults)
  }

  /**
   * Extract relevant snippet from content.
   */
  private extractSnippet(content: string, query: string, maxLength: number = 200): string {
    const contentLower = content.toLowerCase()
    const queryLower = query.toLowerCase()

    let pos = contentLower.indexOf(queryLower)
    if (pos === -1) {
      const firstWord = queryLower.split(/\s+/)[0]
      pos = contentLower.indexOf(firstWord)
    }
    if (pos === -1) {
      pos = 0
    }

    const start = Math.max(0, pos - 50)
    const end = Math.min(content.length, pos + maxLength - 50)
    let snippet = content.slice(start, end)

    if (start > 0) snippet = "..." + snippet
    if (end < content.length) snippet = snippet + "..."

    return snippet
  }

  /**
   * Get content from a source file by line range.
   */
  getContent(source: string, from?: number, lines?: number): string | null {
    const chunks = this.db
      .query<{ content: string; line_start: number; line_end: number }, [string]>(
        "SELECT content, line_start, line_end FROM chunks WHERE source = ? ORDER BY line_start"
      )
      .all(source)

    if (chunks.length === 0) {
      return null
    }

    // Reconstruct content (approximate - chunks may overlap)
    const allContent = chunks.map((c) => c.content).join("\n\n")
    const allLines = allContent.split("\n")

    if (from === undefined && lines === undefined) {
      return allContent
    }

    const startLine = (from ?? 1) - 1
    const endLine = lines ? startLine + lines : allLines.length

    return allLines.slice(startLine, endLine).join("\n")
  }

  /**
   * List all indexed sources.
   */
  listSources(): Array<{ path: string; hash: string; indexedAt: number }> {
    return this.db
      .query<{ path: string; hash: string; indexed_at: number }, []>("SELECT * FROM sources")
      .all()
      .map((row) => ({
        path: row.path,
        hash: row.hash,
        indexedAt: row.indexed_at,
      }))
  }

  /**
   * Remove a source and its chunks.
   */
  removeSource(source: string): void {
    this.db.run("DELETE FROM chunks WHERE source = ?", [source])
    this.db.run("DELETE FROM sources WHERE path = ?", [source])
  }

  /**
   * Clear all memory.
   */
  clear(): void {
    this.db.run("DELETE FROM chunks")
    this.db.run("DELETE FROM sources")
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close()
  }
}

// ============================================================================
// Singleton Instance Management
// ============================================================================

const stores = new Map<string, MemoryStore>()

/**
 * Get or create a memory store for an agent.
 */
export function getMemoryStore(agentId: string = "default"): MemoryStore {
  const existing = stores.get(agentId)
  if (existing) {
    return existing
  }

  const store = new MemoryStore({ agentId })
  stores.set(agentId, store)
  return store
}

/**
 * Close all memory stores.
 */
export function closeAllMemoryStores(): void {
  for (const store of stores.values()) {
    store.close()
  }
  stores.clear()
}
