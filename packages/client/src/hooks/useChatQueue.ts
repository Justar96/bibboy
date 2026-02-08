/**
 * Chat Queue Hook
 * 
 * Manages chat message queueing and failure recovery. Based on patterns
 * from reference-openclaw-project's app-chat.ts.
 */

import { useState, useCallback, useRef } from "react"

// ============================================================================
// Types
// ============================================================================

export interface ChatQueueItem {
  /** Unique ID for this queued message */
  id: string
  /** Message text */
  text: string
  /** When this was queued */
  createdAt: number
  /** Optional attachments */
  attachments?: ChatAttachment[]
  /** Whether to refresh sessions after send */
  refreshSessions?: boolean
}

export interface ChatAttachment {
  /** Attachment type */
  type: "image" | "file"
  /** File name */
  name: string
  /** Data URL or path */
  url: string
  /** MIME type */
  mimeType?: string
}

export interface UseChatQueueOptions {
  /** Callback when queue is flushed (send messages) */
  onFlush?: (item: ChatQueueItem) => Promise<boolean>
  /** Callback when stop command is detected */
  onStop?: () => void
}

export interface UseChatQueueReturn {
  /** Current draft message */
  draft: string
  /** Update draft message */
  setDraft: (text: string) => void
  /** Queued messages */
  queue: ChatQueueItem[]
  /** Whether chat is busy (sending or processing) */
  isBusy: boolean
  /** Set busy state */
  setBusy: (busy: boolean) => void
  /** Send a message (or queue if busy) */
  send: (text?: string, attachments?: ChatAttachment[]) => Promise<boolean>
  /** Remove a queued item */
  removeFromQueue: (id: string) => void
  /** Clear the entire queue */
  clearQueue: () => void
  /** Restore draft (e.g., on send failure) */
  restoreDraft: (text: string) => void
}

// ============================================================================
// Command Detection
// ============================================================================

const STOP_COMMANDS = new Set(["stop", "esc", "abort", "wait", "exit", "/stop"])
const RESET_COMMANDS = new Set(["/new", "/reset"])

/**
 * Check if text is a stop command
 */
export function isChatStopCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  return STOP_COMMANDS.has(normalized)
}

/**
 * Check if text is a reset/new session command
 */
export function isChatResetCommand(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false
  if (RESET_COMMANDS.has(normalized)) return true
  return normalized.startsWith("/new ") || normalized.startsWith("/reset ")
}

// ============================================================================
// ID Generation
// ============================================================================

let queueIdCounter = 0

function generateQueueId(): string {
  return `queue_${Date.now()}_${++queueIdCounter}`
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useChatQueue(
  options: UseChatQueueOptions = {}
): UseChatQueueReturn {
  const { onFlush, onStop } = options

  const [draft, setDraft] = useState("")
  const [queue, setQueue] = useState<ChatQueueItem[]>([])
  const [isBusy, setIsBusy] = useState(false)

  // Track previous draft for restoration
  const previousDraftRef = useRef("")

  // Enqueue a message
  const enqueue = useCallback(
    (text: string, attachments?: ChatAttachment[], refreshSessions?: boolean) => {
      const trimmed = text.trim()
      const hasAttachments = Boolean(attachments?.length)
      if (!trimmed && !hasAttachments) return

      setQueue((prev) => [
        ...prev,
        {
          id: generateQueueId(),
          text: trimmed,
          createdAt: Date.now(),
          attachments: hasAttachments ? attachments : undefined,
          refreshSessions,
        },
      ])
    },
    []
  )

  // Flush queue (send next message)
  const flushQueue = useCallback(async () => {
    if (isBusy || !onFlush) return

    setQueue((prev) => {
      const [next, ...rest] = prev
      if (!next) return prev

      // Send async, restore on failure
      setIsBusy(true)
      void onFlush(next)
        .then((ok) => {
          if (!ok) {
            // Re-add to front of queue on failure
            setQueue((current) => [next, ...current])
          }
        })
        .finally(() => {
          setIsBusy(false)
        })

      return rest
    })
  }, [isBusy, onFlush])

  // Send a message (or queue if busy)
  const send = useCallback(
    async (text?: string, attachments?: ChatAttachment[]): Promise<boolean> => {
      const message = (text ?? draft).trim()
      const hasAttachments = Boolean(attachments?.length)

      // Allow sending with just attachments
      if (!message && !hasAttachments) {
        return false
      }

      // Check for stop command
      if (isChatStopCommand(message)) {
        onStop?.()
        setDraft("")
        return true
      }

      // Check for reset command
      const refreshSessions = isChatResetCommand(message)

      // Save draft for potential restoration
      if (text === undefined) {
        previousDraftRef.current = draft
        setDraft("")
      }

      // If busy, queue the message
      if (isBusy) {
        enqueue(message, attachments, refreshSessions)
        return true
      }

      // Send immediately
      if (!onFlush) return false

      setIsBusy(true)
      try {
        const ok = await onFlush({
          id: generateQueueId(),
          text: message,
          createdAt: Date.now(),
          attachments,
          refreshSessions,
        })

        if (!ok && text === undefined) {
          // Restore draft on failure
          setDraft(previousDraftRef.current)
        }

        return ok
      } finally {
        setIsBusy(false)
        // Flush any queued messages
        void flushQueue()
      }
    },
    [draft, isBusy, onFlush, onStop, enqueue, flushQueue]
  )

  // Remove from queue
  const removeFromQueue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((item) => item.id !== id))
  }, [])

  // Clear queue
  const clearQueue = useCallback(() => {
    setQueue([])
  }, [])

  // Restore draft
  const restoreDraft = useCallback((text: string) => {
    setDraft(text)
  }, [])

  return {
    draft,
    setDraft,
    queue,
    isBusy,
    setBusy: setIsBusy,
    send,
    removeFromQueue,
    clearQueue,
    restoreDraft,
  }
}
