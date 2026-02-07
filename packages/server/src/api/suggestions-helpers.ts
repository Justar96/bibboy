import { Schema } from "effect"

const GeminiSuggestionPartSchema = Schema.Struct({
  text: Schema.optional(Schema.String),
})

const GeminiSuggestionCandidateSchema = Schema.Struct({
  content: Schema.optional(
    Schema.Struct({
      parts: Schema.Array(GeminiSuggestionPartSchema),
    })
  ),
})

const GeminiSuggestionResponseSchema = Schema.Struct({
  candidates: Schema.optional(Schema.Array(GeminiSuggestionCandidateSchema)),
})

const SuggestionsArraySchema = Schema.Array(Schema.String)

const decodeGeminiSuggestionResponse = Schema.decodeUnknownEither(
  GeminiSuggestionResponseSchema
)
const decodeSuggestionsArray = Schema.decodeUnknownEither(SuggestionsArraySchema)

export function extractSuggestionPayloadFromGemini(data: unknown): string | null {
  const decoded = decodeGeminiSuggestionResponse(data)
  if (decoded._tag !== "Right") {
    return null
  }

  const content = decoded.right.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .filter(Boolean)
    .join("")

  return content ?? null
}

export function parseSuggestionsArray(content: string): string[] | null {
  const normalized = content.replace(/```json?\n?|\n?```/g, "").trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(normalized)
  } catch {
    return null
  }

  const decoded = decodeSuggestionsArray(parsed)
  if (decoded._tag !== "Right") {
    return null
  }

  return Array.from(decoded.right)
}
