import { Effect } from "effect"

// ============================================================================
// Embedding Service Types
// ============================================================================

export interface EmbeddingResult {
  embedding: number[]
  model: string
}

export interface EmbeddingBatchResult {
  embeddings: number[][]
  model: string
}

// ============================================================================
// Gemini Embedding Service
// ============================================================================

const DEFAULT_MODEL = "gemini-embedding-001"

interface GeminiEmbeddingResponse {
  embedding: {
    values: number[]
  }
}

interface GeminiBatchEmbeddingResponse {
  embeddings: Array<{
    values: number[]
  }>
}

function isGeminiEmbeddingResponse(data: unknown): data is GeminiEmbeddingResponse {
  if (!data || typeof data !== "object") return false
  const obj = data as { embedding?: unknown }
  if (!obj.embedding || typeof obj.embedding !== "object") return false
  const emb = obj.embedding as { values?: unknown }
  return Array.isArray(emb.values)
}

function isGeminiBatchEmbeddingResponse(data: unknown): data is GeminiBatchEmbeddingResponse {
  if (!data || typeof data !== "object") return false
  const obj = data as { embeddings?: unknown }
  if (!Array.isArray(obj.embeddings)) return false
  return obj.embeddings.every(
    (e: unknown) => e && typeof e === "object" && Array.isArray((e as { values?: unknown }).values)
  )
}

/**
 * Generate embedding for a single text using Gemini.
 */
export async function generateEmbedding(
  text: string,
  options?: { model?: string; apiKey?: string }
): Promise<EmbeddingResult> {
  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured")
  }

  const model = options?.model ?? DEFAULT_MODEL

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT",
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini embedding error: ${response.status} ${errorText}`)
  }

  const raw: unknown = await response.json()
  if (!isGeminiEmbeddingResponse(raw)) {
    throw new Error("Unexpected Gemini embedding API response shape")
  }

  return {
    embedding: raw.embedding.values,
    model,
  }
}

/**
 * Generate embeddings for multiple texts using Gemini (batch).
 */
export async function generateEmbeddings(
  texts: string[],
  options?: { model?: string; apiKey?: string }
): Promise<EmbeddingBatchResult> {
  if (texts.length === 0) {
    return { embeddings: [], model: options?.model ?? DEFAULT_MODEL }
  }

  const apiKey = options?.apiKey ?? process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured")
  }

  const model = options?.model ?? DEFAULT_MODEL

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_DOCUMENT",
        })),
      }),
    }
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini embedding error: ${response.status} ${errorText}`)
  }

  const raw: unknown = await response.json()
  if (!isGeminiBatchEmbeddingResponse(raw)) {
    throw new Error("Unexpected Gemini batch embedding API response shape")
  }

  return {
    embeddings: raw.embeddings.map((e) => e.values),
    model,
  }
}

// ============================================================================
// Vector Operations
// ============================================================================

/**
 * Calculate cosine similarity between two vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same length")
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dotProduct / magnitude
}

/**
 * Normalize a vector to unit length.
 */
export function normalizeVector(v: number[]): number[] {
  let norm = 0
  for (const x of v) {
    norm += x * x
  }
  norm = Math.sqrt(norm)
  if (norm === 0) return v
  return v.map((x) => x / norm)
}

/**
 * Convert embedding to Float32Array for storage.
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding)
  return Buffer.from(float32.buffer)
}

/**
 * Convert Buffer back to embedding array.
 */
export function bufferToEmbedding(buffer: Buffer): number[] {
  const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4)
  return Array.from(float32)
}

// ============================================================================
// Text Chunking
// ============================================================================

interface ChunkOptions {
  tokens?: number
  overlap?: number
}

const DEFAULT_CHUNK_TOKENS = 400
const DEFAULT_CHUNK_OVERLAP = 80
const CHARS_PER_TOKEN = 4 // Approximate

/**
 * Split text into overlapping chunks for embedding.
 */
export function chunkText(text: string, options?: ChunkOptions): string[] {
  const tokensPerChunk = options?.tokens ?? DEFAULT_CHUNK_TOKENS
  const overlapTokens = options?.overlap ?? DEFAULT_CHUNK_OVERLAP

  const charsPerChunk = tokensPerChunk * CHARS_PER_TOKEN
  const overlapChars = overlapTokens * CHARS_PER_TOKEN

  if (text.length <= charsPerChunk) {
    return [text]
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + charsPerChunk

    // Try to break at paragraph
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", end)
      if (paragraphBreak > start + charsPerChunk / 2) {
        end = paragraphBreak
      } else {
        // Try to break at sentence
        const sentenceBreak = text.lastIndexOf(". ", end)
        if (sentenceBreak > start + charsPerChunk / 2) {
          end = sentenceBreak + 1
        } else {
          // Try to break at word
          const wordBreak = text.lastIndexOf(" ", end)
          if (wordBreak > start + charsPerChunk / 2) {
            end = wordBreak
          }
        }
      }
    }

    chunks.push(text.slice(start, end).trim())
    start = end - overlapChars
  }

  return chunks.filter(Boolean)
}

// ============================================================================
// Effect-based Embedding Service
// ============================================================================

/**
 * Effect-wrapped embedding generation.
 */
export const embed = (text: string, model?: string) =>
  Effect.tryPromise({
    try: () => generateEmbedding(text, { model }),
    catch: (error) => new Error(`Embedding failed: ${error}`),
  })

/**
 * Effect-wrapped batch embedding generation.
 */
export const embedBatch = (texts: string[], model?: string) =>
  Effect.tryPromise({
    try: () => generateEmbeddings(texts, { model }),
    catch: (error) => new Error(`Batch embedding failed: ${error}`),
  })
