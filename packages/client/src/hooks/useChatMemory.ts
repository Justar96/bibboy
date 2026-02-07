import { useState, useEffect, useCallback } from "react"
import type { ChatMessage } from "@bibboy/shared"

const STORAGE_KEY = "portfolio-chat-messages" as const

/** Result type for useChatMemory hook */
export interface UseChatMemoryResult {
  /** Current chat messages */
  readonly messages: ChatMessage[]
  /** Add a new message to the chat */
  readonly addMessage: (message: ChatMessage) => void
  /** Clear all messages and start fresh */
  readonly clearMessages: () => void
}

/**
 * Type guard to validate ChatMessage array from localStorage.
 * Ensures data integrity when loading persisted messages.
 */
function isValidChatMessages(data: unknown): data is ChatMessage[] {
  if (!Array.isArray(data)) return false
  return data.every(
    (item): item is ChatMessage =>
      typeof item === "object" &&
      item !== null &&
      typeof item.id === "string" &&
      typeof item.content === "string" &&
      (item.role === "user" || item.role === "assistant" || item.role === "system")
  )
}

/**
 * Hook for managing current chat messages with localStorage persistence.
 * 
 * Features:
 * - Automatic persistence to localStorage
 * - Type-safe message validation on load
 * - Graceful error handling for storage operations
 */
export function useChatMemory(): UseChatMemoryResult {
  const [messages, setMessages] = useState<ChatMessage[]>([])

  // Load messages from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed: unknown = JSON.parse(stored)
        if (isValidChatMessages(parsed)) {
          setMessages(parsed)
        } else {
          // Invalid data structure, clear corrupted storage
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch (err) {
      console.error("[useChatMemory] Failed to load messages:", err)
      // Attempt to clear corrupted data
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Storage may be completely unavailable
      }
    }
  }, [])

  // Persist to localStorage on messages change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages))
    } catch (err) {
      console.error("[useChatMemory] Failed to save messages:", err)
    }
  }, [messages])

  const addMessage = useCallback((message: ChatMessage): void => {
    setMessages((prev) => [...prev, message])
  }, [])

  const clearMessages = useCallback((): void => {
    setMessages([])
  }, [])

  return { messages, addMessage, clearMessages } as const
}
