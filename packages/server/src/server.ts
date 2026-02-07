import {
  HttpApiBuilder,
  HttpApiSwagger,
  HttpServer,
} from "@effect/platform"
import { Layer } from "effect"
import { api } from "./api/api"
import { apiGroupLive } from "./api/handlers"
import { handleAgentStream } from "./api/agent-streaming"
import { SECURITY_HEADERS } from "./api/middleware"
import { disposeGlobalRateLimiters } from "./api/rate-limiter"
import {
  handleWebSocketUpgrade,
  websocketHandlers,
  startSessionCleanup,
  stopSessionCleanup,
  disposeWebSocketRuntime,
  type SessionData,
} from "./api/websocket-handler"
import { join } from "path"
import { getGlobalConfig, getAllowedOrigin as getOrigin } from "./config"

// ============================================================================
// Configuration
// ============================================================================

// Load configuration at startup
const appConfig = getGlobalConfig()

// ============================================================================
// Static File Serving
// ============================================================================

const CLIENT_DIST_PATH = join(import.meta.dir, "../../client/dist")

/**
 * Get the allowed origin for CORS based on the request.
 * Uses centralized AppConfig for origin validation.
 */
function getAllowedOrigin(request: Request): string {
  const origin = request.headers.get("origin")
  return getOrigin(appConfig, origin)
}

/**
 * Serve static files from the client dist folder
 */
const serveStaticFile = async (pathname: string): Promise<Response | null> => {
  // Remove leading slash for path joining
  const cleanPath = pathname.replace(/^\//, "") || "index.html"
  const filePath = join(CLIENT_DIST_PATH, cleanPath)
  
  // Prevent directory traversal attacks
  if (!filePath.startsWith(CLIENT_DIST_PATH)) {
    return null
  }
  
  try {
    const file = Bun.file(filePath)
    const exists = await file.exists()
    if (exists) {
      return new Response(file)
    }
  } catch {
    // File doesn't exist
  }
  return null
}

/**
 * Serve index.html for SPA routing
 */
const serveIndexHtml = async (): Promise<Response> => {
  const indexPath = join(CLIENT_DIST_PATH, "index.html")
  const file = Bun.file(indexPath)
  return new Response(file)
}

// ============================================================================
// API Layer Configuration
// ============================================================================

/**
 * The live API layer with all handlers implemented
 */
const MyApiLive = HttpApiBuilder.api(api).pipe(
  Layer.provide(apiGroupLive)
)

/**
 * Swagger documentation layer
 */
const SwaggerLayer = HttpApiSwagger.layer({ path: "/api/swagger" }).pipe(
  Layer.provide(MyApiLive)
)

/**
 * Combined layers for the web handler
 */
const AppLayers = Layer.mergeAll(
  MyApiLive,
  SwaggerLayer,
  HttpServer.layerContext
)

// ============================================================================
// Web Handler
// ============================================================================

/**
 * Create the web handler from the API layers
 */
const { dispose, handler: baseHandler } = HttpApiBuilder.toWebHandler(AppLayers)

/**
 * Enhanced handler with static file serving, streaming, and security headers
 */
export const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const pathname = url.pathname
  
  // ── SSE Streaming Endpoint (manual handler) ────────────────────────────────
  // HttpApi doesn't support streaming responses, so keep this as manual handler
  if (pathname === "/api/agent/stream" && request.method === "POST") {
    return handleAgentStream(request)
  }
  
  // Try to serve static files first (only for GET requests)
  if (request.method === "GET" && !pathname.startsWith("/api/")) {
    const staticResponse = await serveStaticFile(pathname)
    if (staticResponse) {
      return staticResponse
    }
    // If file not found and not an API route, serve index.html for SPA
    return await serveIndexHtml()
  }
  
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": getAllowedOrigin(request),
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400", // Cache preflight for 24 hours
      },
    })
  }

  // API routes
  const response = await baseHandler(request)
  
  // Add security headers to API responses
  const headers = new Headers(response.headers)
  
  // Apply all security headers
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value)
  }
  
  // Add CORS headers (restrict to same origin in production)
  headers.set("Access-Control-Allow-Origin", getAllowedOrigin(request))
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
  headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization")
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Cleanup function for graceful shutdown
 */
export const cleanup = dispose

// ============================================================================
// Server Entry Point
// ============================================================================

/**
 * Get the port from configuration
 */
const getPort = (): number => {
  return appConfig.port
}

/**
 * Start the server using Bun.serve()
 */
export const startServer = () => {
  const port = getPort()

  if (typeof Bun !== "undefined" && Bun.serve) {
    // Create server with WebSocket support
    const server = Bun.serve<SessionData>({
      port,
      hostname: "0.0.0.0",
      fetch(request, server) {
        const url = new URL(request.url)

        // Handle WebSocket upgrade for /ws/chat
        if (url.pathname === "/ws/chat") {
          const wsResponse = handleWebSocketUpgrade(request, server)
          if (wsResponse !== undefined) {
            return wsResponse
          }
          // Upgrade successful - return undefined to let Bun handle it
          return undefined
        }

        // Handle normal HTTP requests
        return handler(request)
      },
      websocket: websocketHandlers,
    })

    // Start session cleanup interval
    startSessionCleanup()

    console.log(`🚀 API Server running at http://localhost:${port}`)
    console.log(`📚 OpenAPI docs available at http://localhost:${port}/api/docs`)
    console.log(`📖 Swagger UI available at http://localhost:${port}/api/swagger`)
    console.log(`🔌 WebSocket available at ws://localhost:${port}/ws/chat`)

    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\n🛑 Shutting down server...")
      stopSessionCleanup()
      disposeGlobalRateLimiters()
      await disposeWebSocketRuntime()
      await cleanup()
      server.stop()
      process.exit(0)
    })

    process.on("SIGTERM", async () => {
      console.log("\n🛑 Shutting down server...")
      stopSessionCleanup()
      disposeGlobalRateLimiters()
      await disposeWebSocketRuntime()
      await cleanup()
      server.stop()
      process.exit(0)
    })

    return server
  } else {
    console.error("Bun runtime not detected. Please run with Bun.")
    process.exit(1)
  }
}

// Start server if this file is run directly
if (typeof Bun !== "undefined" && Bun.main === import.meta.path) {
  startServer()
}
