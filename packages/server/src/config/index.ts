/**
 * Configuration Module
 *
 * Exports centralized application configuration using Effect Config system.
 */

export {
  // Types
  type AppConfigData,
  type NodeEnv,
  // Service
  AppConfig,
  AppConfigLive,
  // Helpers
  hasGeminiApiKey,
  getGeminiApiKeyValue,
  getAgentConfigValue,
  isDevelopment,
  isProduction,
  getAllowedOrigin,
  // Sync loaders (for backwards compatibility)
  loadConfigSync,
  getGlobalConfig,
  resetGlobalConfig,
} from "./AppConfig"
