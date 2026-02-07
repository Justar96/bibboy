const THINKING_TAG_REGEX = /<\s*think(?:ing)?\s*>([\s\S]*?)<\s*\/\s*think(?:ing)?\s*>/gi

function stripThinkingTags(text: string): string {
  return text.replace(THINKING_TAG_REGEX, "").trim()
}

const MAX_CHUNK_CHARS = 140
const MAX_CHUNK_LINES = 3

export function chunkText(rawContent: string): string[] {
  const content = stripThinkingTags(rawContent).trim()
  if (!content) return []

  const paragraphs = content.split(/\n\n+/)
  const chunks: string[] = []
  let current = ""

  for (const para of paragraphs) {
    const wouldBe = current ? `${current}\n\n${para}` : para
    const lineCount = wouldBe.split("\n").length

    if (wouldBe.length > MAX_CHUNK_CHARS || lineCount > MAX_CHUNK_LINES) {
      if (current) chunks.push(current.trim())

      if (para.length > MAX_CHUNK_CHARS) {
        const sentences = para.match(/[^.!?]+[.!?]+\s*/g) ?? [para]
        let sentenceChunk = ""
        for (const s of sentences) {
          if ((sentenceChunk + s).length > MAX_CHUNK_CHARS && sentenceChunk) {
            chunks.push(sentenceChunk.trim())
            sentenceChunk = s
          } else {
            sentenceChunk += s
          }
        }
        current = sentenceChunk
      } else {
        current = para
      }
    } else {
      current = wouldBe
    }
  }

  if (current.trim()) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [content]
}
