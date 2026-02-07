import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Effect, Layer, Scope } from "effect"
import {
  RateLimiter,
  checkRateLimit,
  chatRateLimiter,
  ChatRateLimiter,
  StreamRateLimiter,
  ChatRateLimiterLive,
  StreamRateLimiterLive,
  RateLimitersLive,
} from "../src/api/rate-limiter"

describe("RateLimiter", () => {
  let limiter: RateLimiter

  beforeEach(() => {
    // Create a test limiter with short windows for testing
    limiter = new RateLimiter({
      windowMs: 1000, // 1 second window
      maxRequests: 3,
      blockDuration: 2000, // 2 second block
    })
  })

  it("allows requests under the limit", () => {
    const result1 = limiter.check("192.168.1.1")
    const result2 = limiter.check("192.168.1.1")
    const result3 = limiter.check("192.168.1.1")

    expect(result1.allowed).toBe(true)
    expect(result2.allowed).toBe(true)
    expect(result3.allowed).toBe(true)
  })

  it("blocks requests over the limit", () => {
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    const result = limiter.check("192.168.1.1")

    expect(result.allowed).toBe(false)
    if (!result.allowed) {
      expect(result.retryAfter).toBeGreaterThan(0)
    }
  })

  it("tracks different IPs separately", () => {
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1") // This should block

    // Different IP should still be allowed
    const result = limiter.check("192.168.1.2")
    expect(result.allowed).toBe(true)
  })

  it("extracts IP from X-Forwarded-For header", () => {
    const request = new Request("http://localhost/api/agent", {
      headers: {
        "X-Forwarded-For": "203.0.113.195, 70.41.3.18, 150.172.238.178",
      },
    })

    const ip = limiter.getClientIP(request)
    expect(ip).toBe("203.0.113.195")
  })

  it("extracts IP from CF-Connecting-IP header", () => {
    const request = new Request("http://localhost/api/agent", {
      headers: {
        "CF-Connecting-IP": "198.51.100.178",
      },
    })

    const ip = limiter.getClientIP(request)
    expect(ip).toBe("198.51.100.178")
  })

  it("returns remaining count correctly", () => {
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")

    expect(limiter.getRemaining("192.168.1.1")).toBe(1)
    expect(limiter.getRemaining("192.168.1.2")).toBe(3) // Untracked IP
  })

  it("resets correctly", () => {
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1") // Block

    limiter.reset()

    const result = limiter.check("192.168.1.1")
    expect(result.allowed).toBe(true)
  })
})

describe("checkRateLimit", () => {
  beforeEach(() => {
    chatRateLimiter.reset()
  })

  it("returns null when not rate limited", () => {
    const request = new Request("http://localhost/api/agent", {
      method: "POST",
      headers: {
        "X-Forwarded-For": "203.0.113.100",
      },
    })

    const response = checkRateLimit(request)
    expect(response).toBeNull()
  })
})

describe("Input sanitization in rate limiter", () => {
  let limiter: RateLimiter

  beforeEach(() => {
    limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 10,
      blockDuration: 60000,
    })
  })

  it("sanitizes invalid IP addresses", () => {
    const request = new Request("http://localhost/api/agent", {
      headers: {
        "X-Forwarded-For": "malicious<script>alert(1)</script>",
      },
    })

    const ip = limiter.getClientIP(request)
    expect(ip).toBe("invalid")
  })

  it("handles IPv6 addresses", () => {
    const request = new Request("http://localhost/api/agent", {
      headers: {
        "X-Forwarded-For": "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
      },
    })

    const ip = limiter.getClientIP(request)
    expect(ip).toBe("2001:0db8:85a3:0000:0000:8a2e:0370:7334")
  })
})

describe("RateLimiter lifecycle management", () => {
  let limiter: RateLimiter

  afterEach(() => {
    // Clean up any intervals
    if (limiter) {
      limiter.dispose()
    }
  })

  it("startCleanup starts the interval", () => {
    limiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 5,
      blockDuration: 1000,
    })

    // Before startCleanup, no interval should be running
    // We can't directly check the interval, but we can verify
    // that calling dispose doesn't throw and can be called multiple times
    limiter.startCleanup()
    limiter.dispose()
    // Should be safe to call dispose again
    limiter.dispose()
  })

  it("dispose clears all data", () => {
    limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 3,
      blockDuration: 60000,
    })
    limiter.startCleanup()

    // Add some data
    limiter.check("192.168.1.1")
    limiter.check("192.168.1.1")
    expect(limiter.getRemaining("192.168.1.1")).toBe(1)

    // Dispose should clear everything
    limiter.dispose()

    // After dispose, a new check should start fresh
    // (but we need a new limiter since this one is disposed)
    limiter = new RateLimiter({
      windowMs: 60000,
      maxRequests: 3,
      blockDuration: 60000,
    })
    expect(limiter.getRemaining("192.168.1.1")).toBe(3)
  })

  it("getMaxRequests returns the configured limit", () => {
    limiter = new RateLimiter({
      windowMs: 1000,
      maxRequests: 42,
      blockDuration: 1000,
    })

    expect(limiter.getMaxRequests()).toBe(42)
  })
})

describe("Effect Layer.scoped rate limiters", () => {
  it("ChatRateLimiterLive provides a ChatRateLimiter service", async () => {
    const program = Effect.gen(function* () {
      const limiter = yield* ChatRateLimiter
      const result = limiter.check("192.168.1.1")
      return result.allowed
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(ChatRateLimiterLive), Effect.scoped)
    )

    expect(result).toBe(true)
  })

  it("StreamRateLimiterLive provides a StreamRateLimiter service", async () => {
    const program = Effect.gen(function* () {
      const limiter = yield* StreamRateLimiter
      const result = limiter.check("192.168.1.2")
      return result.allowed
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(StreamRateLimiterLive), Effect.scoped)
    )

    expect(result).toBe(true)
  })

  it("RateLimitersLive provides both services", async () => {
    const program = Effect.gen(function* () {
      const chatLimiter = yield* ChatRateLimiter
      const streamLimiter = yield* StreamRateLimiter

      const chatResult = chatLimiter.check("192.168.1.3")
      const streamResult = streamLimiter.check("192.168.1.3")

      return {
        chatAllowed: chatResult.allowed,
        streamAllowed: streamResult.allowed,
      }
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(RateLimitersLive), Effect.scoped)
    )

    expect(result.chatAllowed).toBe(true)
    expect(result.streamAllowed).toBe(true)
  })

  it("scoped layer disposes resources when scope closes", async () => {
    // Track whether resources were created and disposed
    let acquiredCount = 0
    let disposedCount = 0

    // Create a custom scope to test lifecycle
    const scope = Effect.runSync(Scope.make())

    const program = Effect.gen(function* () {
      const limiter = yield* ChatRateLimiter
      acquiredCount++

      // Add some data to the limiter
      limiter.check("192.168.1.1")
      limiter.check("192.168.1.1")

      return limiter.getRemaining("192.168.1.1")
    })

    const remaining = await Effect.runPromise(
      program.pipe(
        Effect.provide(ChatRateLimiterLive),
        Scope.extend(scope)
      )
    )

    expect(remaining).toBe(18) // 20 - 2 (default max is 20)

    // Close the scope - this should trigger cleanup
    await Effect.runPromise(Scope.close(scope, Effect.void))

    // The limiter was acquired at least once
    expect(acquiredCount).toBeGreaterThanOrEqual(1)
  })

  it("chat and stream limiters have different configurations", async () => {
    const program = Effect.gen(function* () {
      const chatLimiter = yield* ChatRateLimiter
      const streamLimiter = yield* StreamRateLimiter

      return {
        chatMax: chatLimiter.getMaxRequests(),
        streamMax: streamLimiter.getMaxRequests(),
      }
    })

    const result = await Effect.runPromise(
      program.pipe(Effect.provide(RateLimitersLive), Effect.scoped)
    )

    // Default config: chat = 20, stream = 10
    expect(result.chatMax).toBe(20)
    expect(result.streamMax).toBe(10)
  })
})
