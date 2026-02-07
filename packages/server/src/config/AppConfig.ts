/**
 * Centralized Application Configuration using Effect Config
 *
 * Provides type-safe configuration loading with validation.
 * All environment variables are read at startup and provided as a service.
 */

import { Config, Context, Effect, Layer, Option, Secret } from "effect"
import { join } from "path"

// ============================================================================
// Node Environment Type
// ============================================================================

export type NodeEnv = "development" | "production" | "test"

/**
 * Parse and validate NODE_ENV value.
 */
const parseNodeEnv = (value: string | undefined): NodeEnv => {
  if (value === "production" || value === "test") {
    return value
  }
  return "development"
}

// ============================================================================
// AppConfig Interface
// ============================================================================

export interface AppConfigData {
  /** Gemini API key (required for AI chat and embedding features) */
  readonly geminiApiKey: Option.Option<Secret.Secret>
  /** Server port */
  readonly port: number
  /** Allowed CORS origins */
  readonly allowedOrigins: readonly string[]
  /** Node environment */
  readonly nodeEnv: NodeEnv
  /** Workspace directory for agent files */
  readonly workspaceDir: string
  /** Agent configuration JSON (optional) */
  readonly agentConfig: Option.Option<string>
  /** User home directory */
  readonly homeDir: string
  /** Agent state directory */
  readonly agentStateDir: string
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_PORT = 3001
const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://jtardiern.com",
  "https://www.jtardiern.com",
]

// ============================================================================
// Config Definitions
// ============================================================================

/**
 * Parse comma-separated origins from environment variable.
 */
const parseAllowedOrigins = (envOrigins: Option.Option<string>): readonly string[] => {
  if (Option.isNone(envOrigins)) {
    return DEFAULT_ORIGINS
  }
  const parsed = envOrigins.value.split(",").map((o) => o.trim()).filter(Boolean)
  return [...DEFAULT_ORIGINS, ...parsed]
}

/**
 * Get home directory with cross-platform fallback.
 */
const getHomeDir = (): string => {
  // Try common environment variables
  const home = process.env.HOME ?? process.env.USERPROFILE ?? "/tmp"
  return home
}

/**
 * Effect Config for all application settings.
 * This is loaded once at startup.
 */
const AppConfigEffect = Effect.gen(function* () {
  const homeDir = getHomeDir()

  // Gemini API key (secret, optional)
  const geminiApiKey = yield* Config.secret("GEMINI_API_KEY").pipe(
    Config.option
  )

  // Server port
  const port = yield* Config.number("PORT").pipe(
    Config.withDefault(DEFAULT_PORT)
  )

  // Allowed origins (comma-separated)
  const allowedOriginsRaw = yield* Config.string("ALLOWED_ORIGINS").pipe(
    Config.option
  )
  const allowedOrigins = parseAllowedOrigins(allowedOriginsRaw)

  // Node environment (parsed from string)
  const nodeEnvRaw = yield* Config.string("NODE_ENV").pipe(
    Config.option
  )
  const nodeEnv = parseNodeEnv(Option.getOrUndefined(nodeEnvRaw))

  // Agent configuration JSON (optional)
  const agentConfig = yield* Config.string("AGENT_CONFIG").pipe(
    Config.option
  )

  // Workspace directory
  const defaultWorkspaceDir = join(homeDir, ".portfolio", "workspace")
  const workspaceDir = yield* Config.string("WORKSPACE_DIR").pipe(
    Config.withDefault(defaultWorkspaceDir)
  )

  // Agent state directory
  const defaultStateDir = join(homeDir, ".portfolio", "state")
  const agentStateDir = yield* Config.string("AGENT_STATE_DIR").pipe(
    Config.withDefault(defaultStateDir)
  )

  return {
    geminiApiKey,
    port,
    allowedOrigins,
    nodeEnv,
    workspaceDir,
    agentConfig,
    homeDir,
    agentStateDir,
  } satisfies AppConfigData
})

// ============================================================================
// AppConfig Service Tag
// ============================================================================

export class AppConfig extends Context.Tag("AppConfig")<AppConfig, AppConfigData>() {}

// ============================================================================
// Layer
// ============================================================================

/**
 * Live layer that loads configuration from environment variables.
 * Fails if required config is missing or invalid.
 */
export const AppConfigLive = Layer.effect(
  AppConfig,
  AppConfigEffect
)

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if Gemini API key is configured.
 */
export const hasGeminiApiKey = (config: AppConfigData): boolean =>
  Option.isSome(config.geminiApiKey)

/**
 * Get Gemini API key value, or undefined if not set.
 */
export const getGeminiApiKeyValue = (config: AppConfigData): string | undefined =>
  Option.isSome(config.geminiApiKey)
    ? Secret.value(config.geminiApiKey.value)
    : undefined

/**
 * Get agent config JSON, or undefined if not set.
 */
export const getAgentConfigValue = (config: AppConfigData): string | undefined =>
  Option.getOrUndefined(config.agentConfig)

/**
 * Check if we're in development mode.
 */
export const isDevelopment = (config: AppConfigData): boolean =>
  config.nodeEnv === "development"

/**
 * Check if we're in production mode.
 */
export const isProduction = (config: AppConfigData): boolean =>
  config.nodeEnv === "production"

/**
 * Get the allowed origin for CORS based on request and config.
 */
export const getAllowedOrigin = (
  config: AppConfigData,
  requestOrigin: string | null
): string => {
  if (isDevelopment(config)) {
    // In development, allow any localhost origin
    if (requestOrigin?.includes("localhost")) {
      return requestOrigin
    }
    return "*"
  }

  // In production, only allow whitelisted origins
  if (requestOrigin && config.allowedOrigins.includes(requestOrigin)) {
    return requestOrigin
  }

  // Default to self
  return "https://jtardiern.com"
}

// ============================================================================
// Synchronous Config Loader (for module-level initialization)
// ============================================================================

/**
 * Synchronously load configuration from environment.
 * Used for module-level initialization where Effect context isn't available.
 *
 * @returns AppConfigData loaded from environment variables
 */
export function loadConfigSync(): AppConfigData {
  const homeDir = getHomeDir()

  const geminiApiKeyRaw = process.env.GEMINI_API_KEY
  const geminiApiKey = geminiApiKeyRaw
    ? Option.some(Secret.fromString(geminiApiKeyRaw))
    : Option.none()

  const portRaw = process.env.PORT
  const portParsed = portRaw ? parseInt(portRaw, 10) : DEFAULT_PORT
  const port = !isNaN(portParsed) && portParsed > 0 && portParsed < 65536 ? portParsed : DEFAULT_PORT

  const allowedOriginsRaw = process.env.ALLOWED_ORIGINS
  const allowedOrigins = parseAllowedOrigins(
    allowedOriginsRaw ? Option.some(allowedOriginsRaw) : Option.none()
  )

  const nodeEnvRaw = process.env.NODE_ENV
  const nodeEnv: NodeEnv =
    nodeEnvRaw === "production" || nodeEnvRaw === "test"
      ? nodeEnvRaw
      : "development"

  const agentConfigRaw = process.env.AGENT_CONFIG
  const agentConfig = agentConfigRaw
    ? Option.some(agentConfigRaw)
    : Option.none()

  const defaultWorkspaceDir = join(homeDir, ".portfolio", "workspace")
  const workspaceDir = process.env.WORKSPACE_DIR ?? defaultWorkspaceDir

  const defaultStateDir = join(homeDir, ".portfolio", "state")
  const agentStateDir = process.env.AGENT_STATE_DIR ?? defaultStateDir

  return {
    geminiApiKey,
    port,
    allowedOrigins,
    nodeEnv,
    workspaceDir,
    agentConfig,
    homeDir,
    agentStateDir,
  }
}

// ============================================================================
// Global Config Instance
// ============================================================================

/**
 * Global configuration instance.
 * Loaded synchronously at module initialization for backwards compatibility.
 *
 * Prefer using AppConfig service via Layer for new code.
 */
let _globalConfig: AppConfigData | null = null

/**
 * Get global config instance, loading if necessary.
 */
export function getGlobalConfig(): AppConfigData {
  if (!_globalConfig) {
    _globalConfig = loadConfigSync()
  }
  return _globalConfig
}

/**
 * Reset global config (for testing).
 */
export function resetGlobalConfig(): void {
  _globalConfig = null
}
