import { useState, useEffect, useCallback, useRef } from "react"

/** Fallback suggestions when API is unavailable */
const FALLBACK_SUGGESTIONS = [
  "Tell me about yourself",
  "What projects interest you?",
  "What's your tech stack?",
] as const

/** API response shape */
interface SuggestionsResponse {
  readonly suggestions?: readonly string[]
}

/** Result type for usePromptSuggestions hook */
export interface UsePromptSuggestionsResult {
  /** Array of prompt suggestions */
  readonly suggestions: readonly string[]
  /** Whether suggestions are loading */
  readonly isLoading: boolean
  /** Fetch fresh suggestions from the API */
  readonly refresh: () => void
}

/**
 * Type guard for suggestions API response.
 */
function isSuggestionsResponse(data: unknown): data is SuggestionsResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    (!("suggestions" in data) ||
      (Array.isArray((data as SuggestionsResponse).suggestions) &&
        (data as SuggestionsResponse).suggestions!.every(
          (s) => typeof s === "string"
        )))
  )
}

/**
 * Hook to fetch dynamic prompt suggestions from the agent.
 * 
 * Features:
 * - AbortController support for cleanup
 * - Automatic fallback on error
 * - Type-safe response validation
 */
export function usePromptSuggestions(): UsePromptSuggestionsResult {
  const [suggestions, setSuggestions] = useState<readonly string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchSuggestions = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/suggestions", { signal })
      
      // Check if aborted after fetch
      if (signal?.aborted) return
      
      if (response.ok) {
        const data: unknown = await response.json()
        if (isSuggestionsResponse(data) && data.suggestions?.length) {
          setSuggestions(data.suggestions)
        } else {
          setSuggestions(FALLBACK_SUGGESTIONS)
        }
      } else {
        setSuggestions(FALLBACK_SUGGESTIONS)
      }
    } catch (err) {
      // Only set fallback if not aborted
      if (!(err instanceof Error && err.name === "AbortError")) {
        setSuggestions(FALLBACK_SUGGESTIONS)
      }
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [])

  const refresh = useCallback((): void => {
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    void fetchSuggestions(controller.signal)
  }, [fetchSuggestions])

  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    void fetchSuggestions(controller.signal)

    return () => {
      controller.abort()
      abortControllerRef.current = null
    }
  }, [fetchSuggestions])

  return { suggestions, isLoading, refresh } as const
}
