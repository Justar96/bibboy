// ============================================================================
// API Exports
// ============================================================================

export { api, apiGroup } from "./api"
export { apiGroupLive } from "./handlers"
export { securityHeadersMiddleware, REQUIRED_SECURITY_HEADERS, SECURITY_HEADERS } from "./middleware"
export type { SecurityHeader } from "./middleware"

// Agent SSE streaming handler (non-streaming endpoints are now in HttpApi handlers.ts)
export { handleAgentStream } from "./agent-streaming"

// Rate limiting
export {
  checkRateLimit,
  getRateLimitHeaders,
  chatRateLimiter,
  streamRateLimiter,
  RateLimiter,
  // Effect services
  ChatRateLimiter,
  StreamRateLimiter,
  // Effect layers with scoped lifecycle
  ChatRateLimiterLive,
  StreamRateLimiterLive,
  RateLimitersLive,
  // Cleanup for legacy singletons
  disposeGlobalRateLimiters,
} from "./rate-limiter"

// Input validation
export { 
  validateAgentRequest, 
  validateFilePath, 
  validationErrorResponse, 
  sanitizeString 
} from "./input-validation"
