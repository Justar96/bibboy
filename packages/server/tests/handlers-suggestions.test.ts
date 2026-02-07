import { describe, expect, it } from "vitest"
import {
  extractSuggestionPayloadFromGemini,
  parseSuggestionsArray,
} from "../src/api/suggestions-helpers"

describe("handlers suggestions helpers", () => {
  it("extracts concatenated suggestion payload from Gemini response", () => {
    const payload = extractSuggestionPayloadFromGemini({
      candidates: [
        {
          content: {
            parts: [
              { text: '["Ask me anything",' },
              { text: '"What can you do?"]' },
            ],
          },
        },
      ],
    })

    expect(payload).toBe('["Ask me anything","What can you do?"]')
  })

  it("returns null for malformed Gemini shape", () => {
    const payload = extractSuggestionPayloadFromGemini({
      candidates: [{ content: { parts: [{ text: 123 }] } }],
    })

    expect(payload).toBeNull()
  })

  it("parses JSON suggestions arrays and trims markdown fences", () => {
    const parsed = parseSuggestionsArray('```json\n["A", "B", "C"]\n```')
    expect(parsed).toEqual(["A", "B", "C"])
  })

  it("returns null for invalid suggestion payloads", () => {
    expect(parseSuggestionsArray("not-json")).toBeNull()
    expect(parseSuggestionsArray('{"not":"array"}')).toBeNull()
  })
})
