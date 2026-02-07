import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  normalizeVector,
  embeddingToBuffer,
  bufferToEmbedding,
  chunkText,
} from "../src/memory/EmbeddingService"

describe("EmbeddingService", () => {
  const originalApiKey = process.env.GEMINI_API_KEY

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-api-key"
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    if (originalApiKey === undefined) {
      delete process.env.GEMINI_API_KEY
    } else {
      process.env.GEMINI_API_KEY = originalApiKey
    }
  })

  describe("vector operations", () => {
    it("computes cosine similarity for identical vectors", () => {
      const similarity = cosineSimilarity([1, 2, 3], [1, 2, 3])
      expect(similarity).toBeCloseTo(1)
    })

    it("throws when vector dimensions differ", () => {
      expect(() => cosineSimilarity([1, 2], [1])).toThrow("Vectors must have same length")
    })

    it("normalizes non-zero vectors", () => {
      expect(normalizeVector([3, 4])).toEqual([0.6, 0.8])
    })

    it("round-trips vectors through buffer conversion", () => {
      const source = [0.125, -0.25, 1.5]
      const encoded = embeddingToBuffer(source)
      const decoded = bufferToEmbedding(encoded)

      expect(decoded).toHaveLength(source.length)
      for (let i = 0; i < source.length; i++) {
        expect(decoded[i]).toBeCloseTo(source[i])
      }
    })
  })

  describe("chunking", () => {
    it("returns one chunk for short text", () => {
      expect(chunkText("short text")).toEqual(["short text"])
    })

    it("keeps forward progress with high-overlap settings", () => {
      const text = "Sentence one. Sentence two.\n\n".repeat(120)
      const chunks = chunkText(text, { tokens: 4, overlap: 3 })

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.length).toBeLessThanOrEqual(text.length)
      expect(chunks.every((chunk) => chunk.length > 0)).toBe(true)
    })

    it("clamps invalid token options safely", () => {
      const text = "word ".repeat(300)
      const chunks = chunkText(text, { tokens: 0, overlap: 9999 })

      expect(chunks.length).toBeGreaterThan(0)
      expect(chunks.length).toBeLessThanOrEqual(text.length)
    })
  })

  describe("Gemini response validation", () => {
    it("parses a valid single embedding response", async () => {
      const mockFetch = vi.fn(async () =>
        new Response(JSON.stringify({ embedding: { values: [0.1, 0.2, 0.3] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      vi.stubGlobal("fetch", mockFetch)

      const result = await generateEmbedding("hello")
      expect(result.embedding).toEqual([0.1, 0.2, 0.3])
    })

    it("rejects invalid single embedding payloads", async () => {
      const mockFetch = vi.fn(async () =>
        new Response(JSON.stringify({ embedding: { values: [0.1, "x", 0.3] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      vi.stubGlobal("fetch", mockFetch)

      await expect(generateEmbedding("hello")).rejects.toThrow(
        "Unexpected Gemini embedding API response shape"
      )
    })

    it("rejects invalid batch embedding payloads", async () => {
      const mockFetch = vi.fn(async () =>
        new Response(JSON.stringify({ embeddings: [{ values: [1, 2] }, { values: [3, null] }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      vi.stubGlobal("fetch", mockFetch)

      await expect(generateEmbeddings(["a", "b"]))
        .rejects
        .toThrow("Unexpected Gemini batch embedding API response shape")
    })

    it("returns empty embeddings without API calls for empty input", async () => {
      delete process.env.GEMINI_API_KEY
      const mockFetch = vi.fn(async () => new Response("", { status: 500 }))
      vi.stubGlobal("fetch", mockFetch)

      const result = await generateEmbeddings([])
      expect(result.embeddings).toEqual([])
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
