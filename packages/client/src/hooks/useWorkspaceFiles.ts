import { useState, useEffect, useCallback, useRef } from "react"

// ============================================================================
// Types
// ============================================================================

/** Workspace file representation */
export interface WorkspaceFile {
  readonly name: string
  readonly path: string
  readonly content: string
}

/** API response for workspace files */
interface WorkspaceFilesResponse {
  readonly files?: readonly WorkspaceFile[]
}

/** API response for single file */
interface WorkspaceFileResponse {
  readonly file?: {
    readonly content?: string
  }
}

/** Result type for useWorkspaceFiles hook */
export interface UseWorkspaceFilesResult {
  /** All workspace files */
  readonly files: readonly WorkspaceFile[]
  /** Content of the SOUL.md file */
  readonly soulContent: string
  /** Whether files are loading */
  readonly isLoading: boolean
  /** Error message if any */
  readonly error: string | null
  /** Refetch all files */
  readonly refetch: () => void
}

/** Default agent ID constant */
const DEFAULT_AGENT_ID = "default" as const

/** Polling interval for SOUL.md updates (ms) */
const SOUL_POLL_INTERVAL = 2000 as const

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for workspace file.
 */
function isWorkspaceFile(data: unknown): data is WorkspaceFile {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as WorkspaceFile).name === "string" &&
    typeof (data as WorkspaceFile).path === "string" &&
    typeof (data as WorkspaceFile).content === "string"
  )
}

/**
 * Type guard for workspace files response.
 */
function isWorkspaceFilesResponse(data: unknown): data is WorkspaceFilesResponse {
  if (typeof data !== "object" || data === null) return false
  const response = data as WorkspaceFilesResponse
  if (response.files === undefined) return true
  return Array.isArray(response.files) && response.files.every(isWorkspaceFile)
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * Hook for fetching and polling workspace files.
 * Polls the server for file updates to show real-time persona changes.
 * 
 * Features:
 * - AbortController support for cleanup
 * - Automatic polling for SOUL.md updates
 * - Type-safe response validation
 */
export function useWorkspaceFiles(agentId: string = DEFAULT_AGENT_ID): UseWorkspaceFilesResult {
  const [files, setFiles] = useState<readonly WorkspaceFile[]>([])
  const [soulContent, setSoulContent] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchFiles = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(`/api/workspace/files?agentId=${encodeURIComponent(agentId)}`, { signal })
      
      if (signal?.aborted) return
      
      if (!response.ok) {
        throw new Error(`Failed to fetch files: ${response.status}`)
      }
      
      const data: unknown = await response.json()
      
      if (!isWorkspaceFilesResponse(data)) {
        throw new Error("Invalid response format")
      }
      
      const fetchedFiles = data.files ?? []
      setFiles(fetchedFiles)
      
      // Extract SOUL.md content
      const soulFile = fetchedFiles.find((f) => f.name === "SOUL.md")
      if (soulFile) {
        setSoulContent(soulFile.content)
      }
      
      setError(null)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false)
      }
    }
  }, [agentId])

  const fetchSoulFile = useCallback(async (signal?: AbortSignal): Promise<void> => {
    try {
      const response = await fetch(
        `/api/workspace/file?agentId=${encodeURIComponent(agentId)}&filename=SOUL.md`,
        { signal }
      )
      
      if (signal?.aborted || !response.ok) return
      
      const data: unknown = await response.json()
      const fileResponse = data as WorkspaceFileResponse
      
      if (fileResponse.file?.content) {
        setSoulContent(fileResponse.file.content)
      }
    } catch {
      // Silently ignore polling errors
    }
  }, [agentId])

  // Initial fetch
  useEffect(() => {
    const controller = new AbortController()
    abortControllerRef.current = controller
    void fetchFiles(controller.signal)

    return () => {
      controller.abort()
      abortControllerRef.current = null
    }
  }, [fetchFiles])

  // Poll for SOUL.md updates
  useEffect(() => {
    const controller = new AbortController()
    
    const interval = setInterval(() => {
      void fetchSoulFile(controller.signal)
    }, SOUL_POLL_INTERVAL)
    
    return () => {
      controller.abort()
      clearInterval(interval)
    }
  }, [fetchSoulFile])

  const refetch = useCallback((): void => {
    setIsLoading(true)
    abortControllerRef.current?.abort()
    const controller = new AbortController()
    abortControllerRef.current = controller
    void fetchFiles(controller.signal)
  }, [fetchFiles])

  return { files, soulContent, isLoading, error, refetch } as const
}
