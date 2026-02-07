import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { Option, Secret } from "effect"
import {
  loadConfigSync,
  getGlobalConfig,
  resetGlobalConfig,
  hasGeminiApiKey,
  getGeminiApiKeyValue,
  getAgentConfigValue,
  isDevelopment,
  isProduction,
  getAllowedOrigin,
  type AppConfigData,
} from "../src/config"

describe("AppConfig", () => {
  // Save original env values
  const originalEnv: Record<string, string | undefined> = {}
  const envVars = [
    "GEMINI_API_KEY",
    "PORT",
    "ALLOWED_ORIGINS",
    "NODE_ENV",
    "WORKSPACE_DIR",
    "AGENT_CONFIG",
    "AGENT_STATE_DIR",
    "HOME",
  ]

  beforeEach(() => {
    // Save original values
    for (const key of envVars) {
      originalEnv[key] = process.env[key]
    }
    // Reset global config cache
    resetGlobalConfig()
  })

  afterEach(() => {
    // Restore original values
    for (const key of envVars) {
      if (originalEnv[key] === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = originalEnv[key]
      }
    }
    resetGlobalConfig()
  })

  describe("loadConfigSync", () => {
    it("loads default values when no env vars set", () => {
      // Clear all relevant env vars
      delete process.env.GEMINI_API_KEY
      delete process.env.PORT
      delete process.env.ALLOWED_ORIGINS
      delete process.env.NODE_ENV
      delete process.env.WORKSPACE_DIR
      delete process.env.AGENT_CONFIG
      delete process.env.AGENT_STATE_DIR

      const config = loadConfigSync()

      expect(Option.isNone(config.geminiApiKey)).toBe(true)
      expect(config.port).toBe(3001)
      expect(config.nodeEnv).toBe("development")
      expect(Option.isNone(config.agentConfig)).toBe(true)
      expect(config.allowedOrigins).toContain("http://localhost:3000")
    })

    it("loads GEMINI_API_KEY as secret", () => {
      process.env.GEMINI_API_KEY = "gemini-test-key-12345"

      const config = loadConfigSync()

      expect(Option.isSome(config.geminiApiKey)).toBe(true)
      if (Option.isSome(config.geminiApiKey)) {
        expect(Secret.value(config.geminiApiKey.value)).toBe("gemini-test-key-12345")
      }
    })

    it("parses PORT as number", () => {
      process.env.PORT = "8080"

      const config = loadConfigSync()

      expect(config.port).toBe(8080)
    })

    it("uses default PORT for invalid values", () => {
      process.env.PORT = "not-a-number"

      const config = loadConfigSync()

      expect(config.port).toBe(3001)
    })

    it("parses NODE_ENV correctly", () => {
      process.env.NODE_ENV = "production"
      let config = loadConfigSync()
      expect(config.nodeEnv).toBe("production")

      resetGlobalConfig()
      process.env.NODE_ENV = "test"
      config = loadConfigSync()
      expect(config.nodeEnv).toBe("test")

      resetGlobalConfig()
      process.env.NODE_ENV = "invalid"
      config = loadConfigSync()
      expect(config.nodeEnv).toBe("development")
    })

    it("parses ALLOWED_ORIGINS", () => {
      process.env.ALLOWED_ORIGINS = "https://example.com, https://test.com"

      const config = loadConfigSync()

      expect(config.allowedOrigins).toContain("https://example.com")
      expect(config.allowedOrigins).toContain("https://test.com")
      // Should also include defaults
      expect(config.allowedOrigins).toContain("http://localhost:3000")
    })

    it("loads AGENT_CONFIG", () => {
      const agentConfigJson = JSON.stringify({ list: [{ id: "test" }] })
      process.env.AGENT_CONFIG = agentConfigJson

      const config = loadConfigSync()

      expect(Option.isSome(config.agentConfig)).toBe(true)
      expect(Option.getOrUndefined(config.agentConfig)).toBe(agentConfigJson)
    })

    it("loads WORKSPACE_DIR", () => {
      process.env.WORKSPACE_DIR = "/custom/workspace"

      const config = loadConfigSync()

      expect(config.workspaceDir).toBe("/custom/workspace")
    })
  })

  describe("getGlobalConfig", () => {
    it("caches config instance", () => {
      const config1 = getGlobalConfig()
      const config2 = getGlobalConfig()

      expect(config1).toBe(config2)
    })

    it("resets cache with resetGlobalConfig", () => {
      const config1 = getGlobalConfig()
      resetGlobalConfig()
      const config2 = getGlobalConfig()

      // Different instances but same values (if env unchanged)
      expect(config1).not.toBe(config2)
    })
  })

  describe("helper functions", () => {
    it("hasGeminiApiKey returns false when not set", () => {
      delete process.env.GEMINI_API_KEY
      const config = loadConfigSync()
      expect(hasGeminiApiKey(config)).toBe(false)
    })

    it("hasGeminiApiKey returns true when set", () => {
      process.env.GEMINI_API_KEY = "gemini-test"
      const config = loadConfigSync()
      expect(hasGeminiApiKey(config)).toBe(true)
    })

    it("getGeminiApiKeyValue returns undefined when not set", () => {
      delete process.env.GEMINI_API_KEY
      const config = loadConfigSync()
      expect(getGeminiApiKeyValue(config)).toBeUndefined()
    })

    it("getGeminiApiKeyValue returns value when set", () => {
      process.env.GEMINI_API_KEY = "gemini-test-value"
      const config = loadConfigSync()
      expect(getGeminiApiKeyValue(config)).toBe("gemini-test-value")
    })

    it("getAgentConfigValue returns undefined when not set", () => {
      delete process.env.AGENT_CONFIG
      const config = loadConfigSync()
      expect(getAgentConfigValue(config)).toBeUndefined()
    })

    it("getAgentConfigValue returns value when set", () => {
      const configJson = '{"test": true}'
      process.env.AGENT_CONFIG = configJson
      const config = loadConfigSync()
      expect(getAgentConfigValue(config)).toBe(configJson)
    })

    it("isDevelopment returns true in development", () => {
      delete process.env.NODE_ENV
      const config = loadConfigSync()
      expect(isDevelopment(config)).toBe(true)
    })

    it("isDevelopment returns false in production", () => {
      process.env.NODE_ENV = "production"
      const config = loadConfigSync()
      expect(isDevelopment(config)).toBe(false)
    })

    it("isProduction returns true in production", () => {
      process.env.NODE_ENV = "production"
      const config = loadConfigSync()
      expect(isProduction(config)).toBe(true)
    })

    it("isProduction returns false in development", () => {
      delete process.env.NODE_ENV
      const config = loadConfigSync()
      expect(isProduction(config)).toBe(false)
    })
  })

  describe("getAllowedOrigin", () => {
    it("returns * for localhost in development", () => {
      delete process.env.NODE_ENV
      const config = loadConfigSync()
      const origin = getAllowedOrigin(config, "http://localhost:3000")
      expect(origin).toBe("http://localhost:3000")
    })

    it("returns * for null origin in development", () => {
      delete process.env.NODE_ENV
      const config = loadConfigSync()
      const origin = getAllowedOrigin(config, null)
      expect(origin).toBe("*")
    })

    it("returns whitelisted origin in production", () => {
      process.env.NODE_ENV = "production"
      const config = loadConfigSync()
      const origin = getAllowedOrigin(config, "http://localhost:3000")
      expect(origin).toBe("http://localhost:3000")
    })

    it("returns default domain for non-whitelisted origin in production", () => {
      process.env.NODE_ENV = "production"
      const config = loadConfigSync()
      const origin = getAllowedOrigin(config, "https://evil.com")
      expect(origin).toBe("http://localhost:3001")
    })

    it("returns default domain for null origin in production", () => {
      process.env.NODE_ENV = "production"
      const config = loadConfigSync()
      const origin = getAllowedOrigin(config, null)
      expect(origin).toBe("http://localhost:3001")
    })
  })
})
