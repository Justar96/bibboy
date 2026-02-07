import { useState, useEffect, useCallback, useRef } from "react"
import type { AgentInfo } from "@bibboy/shared"

/** Result type for useAgentList hook */
export interface UseAgentListResult {
  readonly agents: readonly AgentInfo[]
  readonly isLoading: boolean
  readonly error: string | null
  readonly refresh: () => void
}

/** Type guard for agents API response */
function isAgentListResponse(data: unknown): data is { agents: AgentInfo[] } {
  if (typeof data !== "object" || data === null) return false
  const resp = data as { agents?: unknown }
  if (!Array.isArray(resp.agents)) return false
  return resp.agents.every(
    (a: unknown) =>
      typeof a === "object" &&
      a !== null &&
      typeof (a as AgentInfo).id === "string" &&
      typeof (a as AgentInfo).name === "string"
  )
}

/**
 * Hook to fetch the list of available agents from the server.
 */
export function useAgentList(): UseAgentListResult {
  const [agents, setAgents] = useState<readonly AgentInfo[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchAgents = useCallback(async (signal?: AbortSignal): Promise<void> => {
    setIsLoading(true)
    try {
      const response = await fetch("/api/agents", { signal })

      if (signal?.aborted) return

      if (!response.ok) {
        throw new Error(`Failed to fetch agents: ${response.status}`)
      }

      const data: unknown = await response.json()

      if (!isAgentListResponse(data)) {
        throw new Error("Invalid response format")
      }

      setAgents(data.agents)
      setError(null)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Unknown error")
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
    void fetchAgents(controller.signal)
  }, [fetchAgents])

  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    void fetchAgents(controller.signal)

    return () => {
      controller.abort()
      abortControllerRef.current = null
    }
  }, [fetchAgents])

  return { agents, isLoading, error, refresh } as const
}
