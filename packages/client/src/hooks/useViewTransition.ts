import { useCallback } from "react"
import { useNavigate, type NavigateOptions } from "react-router-dom"

// ============================================================================
// Types
// ============================================================================

/** Return type for useViewTransition hook */
export interface UseViewTransitionResult {
  /** Navigate with View Transition API support */
  readonly navigateWithTransition: (to: string, options?: NavigateOptions) => void
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook that wraps navigation with View Transitions API for smooth page transitions.
 * Falls back to regular navigation if View Transitions API is not supported.
 * 
 * @see https://developer.mozilla.org/en-US/docs/Web/API/View_Transitions_API
 */
export function useViewTransition(): UseViewTransitionResult {
  const navigate = useNavigate()

  const navigateWithTransition = useCallback(
    (to: string, options?: NavigateOptions): void => {
      // Check if View Transitions API is supported (modern browsers)
      const doc = document as Document & {
        startViewTransition?: (callback: () => void) => void
      }
      
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => {
          navigate(to, options)
        })
      } else {
        navigate(to, options)
      }
    },
    [navigate]
  )

  return { navigateWithTransition } as const
}
