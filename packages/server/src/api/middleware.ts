import { HttpMiddleware, HttpServerResponse } from "@effect/platform"
import { Effect } from "effect"

// ============================================================================
// Security Headers Middleware
// ============================================================================

/**
 * Comprehensive security headers for the application.
 * Following OWASP security best practices.
 */
export const SECURITY_HEADERS = {
  // Clickjacking protection
  "X-Frame-Options": "DENY",
  
  // MIME type sniffing protection
  "X-Content-Type-Options": "nosniff",
  
  // Referrer policy - limits referrer information leakage
  "Referrer-Policy": "strict-origin-when-cross-origin",
  
  // XSS protection (legacy browsers)
  "X-XSS-Protection": "1; mode=block",
  
  // DNS prefetch control - prevents DNS leaks
  "X-DNS-Prefetch-Control": "off",
  
  // Download options for IE
  "X-Download-Options": "noopen",
  
  // Permitted cross-domain policies
  "X-Permitted-Cross-Domain-Policies": "none",
  
  // Content Security Policy - restricts resource loading
  "Content-Security-Policy": [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for React
    "style-src 'self' 'unsafe-inline'", // Required for Tailwind
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "connect-src 'self' https://generativelanguage.googleapis.com", // Allow Gemini API
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; "),
  
  // Permissions Policy - restrict browser features
  "Permissions-Policy": [
    "accelerometer=()",
    "camera=()",
    "geolocation=()",
    "gyroscope=()",
    "magnetometer=()",
    "microphone=()",
    "payment=()",
    "usb=()",
  ].join(", "),
} as const

/**
 * Middleware that adds security headers to all HTTP responses.
 */
export const securityHeadersMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function* () {
    const response = yield* app
    return HttpServerResponse.setHeaders(response, SECURITY_HEADERS)
  })
)

// ============================================================================
// Security Headers Constants
// ============================================================================

/**
 * Required security headers for validation in tests.
 */
export const REQUIRED_SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-XSS-Protection": "1; mode=block",
} as const

export type SecurityHeader = keyof typeof REQUIRED_SECURITY_HEADERS
