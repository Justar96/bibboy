import { memo, useCallback, useRef, useEffect, type MouseEvent, type ReactNode } from "react"
import { Link, type LinkProps, type To } from "react-router-dom"
import { useViewTransition } from "@/hooks/useViewTransition"

// ============================================================================
// Types
// ============================================================================

/** Prefetch behavior modes */
export type PrefetchMode = "hover" | "visible" | "none"

export interface PrefetchLinkProps extends Omit<LinkProps, "prefetch"> {
  /** When to trigger prefetching */
  readonly prefetchMode?: PrefetchMode
  /** Link content */
  readonly children: ReactNode
}

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for prefetch to avoid unnecessary loads on quick mouse movements */
const PREFETCH_DEBOUNCE_MS = 50

/** Module-level cache for prefetched routes */
const prefetchedRoutes = new Set<string>()

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract pathname from Link's `to` prop.
 */
function getPathFromTo(to: To): string {
  if (typeof to === "string") return to
  return to.pathname ?? ""
}

/**
 * Prefetch a route by triggering the dynamic import.
 * Uses module-level cache to avoid duplicate prefetch requests.
 */
function prefetchRoute(path: string): void {
  // Already prefetched
  if (prefetchedRoutes.has(path)) return

  // Mark as prefetched immediately to prevent duplicate requests
  prefetchedRoutes.add(path)

  // Map routes to their lazy-loaded chunks
  if (path === "/playground") {
    void import("@/pages/PlaygroundPage")
  }
  // HomePage is not lazy-loaded, so no need to prefetch
}

// ============================================================================
// Component
// ============================================================================

/**
 * Enhanced Link component with:
 * - Route prefetching on hover (debounced)
 * - View Transitions API integration for smooth navigation
 * - Instant visual feedback
 * - Proper cleanup on unmount
 */
export const PrefetchLink = memo(function PrefetchLink({
  to,
  children,
  prefetchMode = "hover",
  onClick,
  onMouseEnter,
  ...props
}: PrefetchLinkProps) {
  const { navigateWithTransition } = useViewTransition()
  const prefetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current) {
        clearTimeout(prefetchTimeoutRef.current)
        prefetchTimeoutRef.current = null
      }
    }
  }, [])

  const handleMouseEnter = useCallback(
    (e: MouseEvent<HTMLAnchorElement>): void => {
      onMouseEnter?.(e)

      if (prefetchMode === "none") return

      const path = getPathFromTo(to)

      // Don't prefetch if empty path or already done
      if (!path || prefetchedRoutes.has(path)) return

      // Debounce prefetch to avoid unnecessary loads on quick mouse movements
      prefetchTimeoutRef.current = setTimeout(() => {
        prefetchRoute(path)
      }, PREFETCH_DEBOUNCE_MS)
    },
    [to, prefetchMode, onMouseEnter]
  )

  const handleMouseLeave = useCallback((): void => {
    if (prefetchTimeoutRef.current) {
      clearTimeout(prefetchTimeoutRef.current)
      prefetchTimeoutRef.current = null
    }
  }, [])

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>): void => {
      // Call original onClick if provided
      onClick?.(e)

      // If default prevented, don't navigate
      if (e.defaultPrevented) return

      // Handle modifier keys for opening in new tab
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return

      // Prevent default navigation
      e.preventDefault()

      const path = getPathFromTo(to)

      // Navigate with view transition
      navigateWithTransition(path || "/")
    },
    [to, onClick, navigateWithTransition]
  )

  return (
    <Link
      to={to}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {children}
    </Link>
  )
})

PrefetchLink.displayName = "PrefetchLink"
