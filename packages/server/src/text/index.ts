// Text processing utilities (ported from OpenClaw patterns)
export {
  stripReasoningTagsFromText,
  stripFinalTagsFromText,
  stripThinkingTagsFromText,
} from "./reasoning-tags"
export type { ReasoningTagMode, ReasoningTagTrim } from "./reasoning-tags"

export {
  sanitizeUserFacingText,
  sanitizeAssistantOutput,
  stripMalformedToolCallXml,
  stripDowngradedToolCallText,
} from "./sanitize"
