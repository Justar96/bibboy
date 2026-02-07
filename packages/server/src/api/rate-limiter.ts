// ============================================================================
// IP-based Rate Limiter for Chat Endpoints
// Uses Effect Layer.scoped for proper resource lifecycle management
// ============================================================================

import { Context, Effect, Layer } from "effect"

interface RateLimitEntry {
  count: number
  firstRequest: number
  lastRequest: number
}

interface RateLimiterConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Maximum requests per window
  blockDuration: number // Block duration after exceeding limit (ms)
}

// Helper to safely parse env variables with defaults
const parseEnvInt = (key: string, defaultValue: number): number => {
  const value = process.env[key]
  if (!value) return defaultValue
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? defaultValue : parsed
}

// Configuration from environment variables with sensible defaults
const DEFAULT_CONFIG: RateLimiterConfig = {
  windowMs: parseEnvInt("RATE_LIMIT_WINDOW_MS", 60 * 1000),      // 1 minute window
  maxRequests: parseEnvInt("RATE_LIMIT_MAX_REQUESTS", 20),       // 20 requests per minute
  blockDuration: parseEnvInt("RATE_LIMIT_BLOCK_DURATION_MS", 5 * 60 * 1000), // 5 minute block
}

const STRICT_CONFIG: RateLimiterConfig = {
  windowMs: parseEnvInt("RATE_LIMIT_WINDOW_MS", 60 * 1000),      // 1 minute window
  maxRequests: parseEnvInt("STREAM_RATE_LIMIT_MAX_REQUESTS", 10), // 10 requests per minute for streaming
  blockDuration: parseEnvInt("STREAM_RATE_LIMIT_BLOCK_DURATION_MS", 10 * 60 * 1000), // 10 minute block
}

// ============================================================================
// RateLimiter Implementation
// ============================================================================

class RateLimiter {
  private store: Map<string, RateLimitEntry> = new Map()
  private blockedIPs: Map<string, number> = new Map()
  private config: RateLimiterConfig
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(config: RateLimiterConfig = DEFAULT_CONFIG) {
    this.config = config
  }

  /**
   * Start the cleanup interval. Called during resource acquisition.
   */
  startCleanup(): void {
    if (!this.cleanupInterval) {
      // Cleanup expired entries every minute
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000)
    }
  }

  /**
   * Stop the cleanup interval and clear all data. Called during resource release.
   */
  dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.store.clear()
    this.blockedIPs.clear()
  }

  /**
   * Extract client IP from request headers.
   * Handles proxied requests (X-Forwarded-For, CF-Connecting-IP, etc.)
   */
  getClientIP(request: Request): string {
    const headers = request.headers

    // Cloudflare
    const cfIP = headers.get("cf-connecting-ip")
    if (cfIP) return this.sanitizeIP(cfIP)

    // Standard proxy header (first IP in chain is the client)
    const forwarded = headers.get("x-forwarded-for")
    if (forwarded) {
      const firstIP = forwarded.split(",")[0]?.trim()
      if (firstIP) return this.sanitizeIP(firstIP)
    }

    // Other common headers
    const realIP = headers.get("x-real-ip")
    if (realIP) return this.sanitizeIP(realIP)

    // Fallback (in production this might be the proxy IP)
    return "unknown"
  }

  /**
   * Sanitize IP address to prevent injection attacks.
   */
  private sanitizeIP(ip: string): string {
    // Remove any whitespace and limit length
    const sanitized = ip.trim().slice(0, 45)
    // Basic IPv4/IPv6 validation pattern
    if (/^[\d.:a-fA-F]+$/.test(sanitized)) {
      return sanitized
    }
    return "invalid"
  }

  /**
   * Check if request should be allowed.
   * Returns { allowed: true } or { allowed: false, retryAfter: seconds }
   */
  check(ip: string): { allowed: true } | { allowed: false; retryAfter: number } {
    const now = Date.now()

    // Check if IP is blocked
    const blockedUntil = this.blockedIPs.get(ip)
    if (blockedUntil && blockedUntil > now) {
      return {
        allowed: false,
        retryAfter: Math.ceil((blockedUntil - now) / 1000),
      }
    } else if (blockedUntil) {
      this.blockedIPs.delete(ip)
    }

    // Get or create entry
    let entry = this.store.get(ip)

    if (!entry) {
      entry = { count: 1, firstRequest: now, lastRequest: now }
      this.store.set(ip, entry)
      return { allowed: true }
    }

    // Check if window has expired
    if (now - entry.firstRequest > this.config.windowMs) {
      entry.count = 1
      entry.firstRequest = now
      entry.lastRequest = now
      return { allowed: true }
    }

    // Increment count
    entry.count++
    entry.lastRequest = now

    // Check if limit exceeded
    if (entry.count > this.config.maxRequests) {
      // Block the IP
      this.blockedIPs.set(ip, now + this.config.blockDuration)
      this.store.delete(ip)
      return {
        allowed: false,
        retryAfter: Math.ceil(this.config.blockDuration / 1000),
      }
    }

    return { allowed: true }
  }

  /**
   * Get remaining requests for an IP.
   */
  getRemaining(ip: string): number {
    const entry = this.store.get(ip)
    if (!entry) return this.config.maxRequests

    const now = Date.now()
    if (now - entry.firstRequest > this.config.windowMs) {
      return this.config.maxRequests
    }

    return Math.max(0, this.config.maxRequests - entry.count)
  }

  /**
   * Cleanup expired entries.
   */
  private cleanup(): void {
    const now = Date.now()

    // Cleanup rate limit entries
    for (const [ip, entry] of this.store.entries()) {
      if (now - entry.lastRequest > this.config.windowMs * 2) {
        this.store.delete(ip)
      }
    }

    // Cleanup blocked IPs
    for (const [ip, blockedUntil] of this.blockedIPs.entries()) {
      if (blockedUntil < now) {
        this.blockedIPs.delete(ip)
      }
    }
  }

  /**
   * Reset rate limiter (useful for testing).
   */
  reset(): void {
    this.store.clear()
    this.blockedIPs.clear()
  }

  /**
   * Get the max requests config (useful for headers)
   */
  getMaxRequests(): number {
    return this.config.maxRequests
  }
}

// ============================================================================
// Effect Service Definitions
// ============================================================================

/**
 * ChatRateLimiter service - standard rate limiting for chat endpoints
 */
class ChatRateLimiter extends Context.Tag("ChatRateLimiter")<
  ChatRateLimiter,
  RateLimiter
>() {}

/**
 * StreamRateLimiter service - stricter rate limiting for streaming endpoints
 */
class StreamRateLimiter extends Context.Tag("StreamRateLimiter")<
  StreamRateLimiter,
  RateLimiter
>() {}

// ============================================================================
// Layer Definitions with Scoped Lifecycle
// ============================================================================

/**
 * Create a scoped layer for a rate limiter.
 * Uses Effect.acquireRelease for proper cleanup on shutdown.
 */
const makeRateLimiterLayer = <T>(
  tag: Context.Tag<T, RateLimiter>,
  config: RateLimiterConfig
): Layer.Layer<T> =>
  Layer.scoped(
    tag,
    Effect.acquireRelease(
      // Acquire: create and start the rate limiter
      Effect.sync(() => {
        const limiter = new RateLimiter(config)
        limiter.startCleanup()
        return limiter
      }),
      // Release: dispose of the rate limiter
      (limiter) =>
        Effect.sync(() => {
          limiter.dispose()
        })
    )
  )

/**
 * Live layer for ChatRateLimiter with default config
 */
const ChatRateLimiterLive = makeRateLimiterLayer(ChatRateLimiter, DEFAULT_CONFIG)

/**
 * Live layer for StreamRateLimiter with strict config
 */
const StreamRateLimiterLive = makeRateLimiterLayer(StreamRateLimiter, STRICT_CONFIG)

/**
 * Combined layer providing both rate limiters
 */
const RateLimitersLive = Layer.mergeAll(ChatRateLimiterLive, StreamRateLimiterLive)

// ============================================================================
// Legacy Singleton Support (for non-Effect code)
// ============================================================================

// Singleton instances for backwards compatibility with non-Effect code.
// These are created lazily and should be disposed via disposeGlobalRateLimiters().
let _chatRateLimiter: RateLimiter | null = null
let _streamRateLimiter: RateLimiter | null = null

/**
 * Get the global chat rate limiter instance.
 * For new code, prefer using ChatRateLimiter via Effect.
 */
const getChatRateLimiter = (): RateLimiter => {
  if (!_chatRateLimiter) {
    _chatRateLimiter = new RateLimiter(DEFAULT_CONFIG)
    _chatRateLimiter.startCleanup()
  }
  return _chatRateLimiter
}

/**
 * Get the global stream rate limiter instance.
 * For new code, prefer using StreamRateLimiter via Effect.
 */
const getStreamRateLimiter = (): RateLimiter => {
  if (!_streamRateLimiter) {
    _streamRateLimiter = new RateLimiter(STRICT_CONFIG)
    _streamRateLimiter.startCleanup()
  }
  return _streamRateLimiter
}

/**
 * Dispose all global rate limiter instances.
 * Call this during server shutdown for proper cleanup.
 */
const disposeGlobalRateLimiters = (): void => {
  if (_chatRateLimiter) {
    _chatRateLimiter.dispose()
    _chatRateLimiter = null
  }
  if (_streamRateLimiter) {
    _streamRateLimiter.dispose()
    _streamRateLimiter = null
  }
}

// Legacy exports for backwards compatibility
// These are getters that lazily create the singletons
export const chatRateLimiter = getChatRateLimiter()
export const streamRateLimiter = getStreamRateLimiter()

/**
 * Apply rate limiting to a request.
 * Returns a Response if rate limited, null if allowed.
 */
export function checkRateLimit(
  request: Request,
  limiter: RateLimiter = getChatRateLimiter()
): Response | null {
  const ip = limiter.getClientIP(request)
  const result = limiter.check(ip)

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        _tag: "RateLimitError",
        error: "Too many requests. Please try again later.",
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Remaining": "0",
          "Access-Control-Allow-Origin": "*",
        },
      }
    )
  }

  return null
}

/**
 * Get rate limit headers for a successful response.
 */
export function getRateLimitHeaders(
  request: Request,
  limiter: RateLimiter = getChatRateLimiter()
): Record<string, string> {
  const ip = limiter.getClientIP(request)
  const remaining = limiter.getRemaining(ip)

  return {
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Limit": String(limiter.getMaxRequests()),
  }
}

// ============================================================================
// Exports
// ============================================================================

export {
  RateLimiter,
  // Effect services
  ChatRateLimiter,
  StreamRateLimiter,
  // Effect layers
  ChatRateLimiterLive,
  StreamRateLimiterLive,
  RateLimitersLive,
  // Config
  DEFAULT_CONFIG,
  STRICT_CONFIG,
  // Legacy support
  disposeGlobalRateLimiters,
}
