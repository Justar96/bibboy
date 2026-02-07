import { useState, useCallback } from "react"
import { motion } from "framer-motion"
import { ChatContent } from "./ChatContent"
import { CopyIcon, CheckIcon } from "./icons"

interface ChatBubbleProps {
  content: string
  isUser: boolean
  isStreaming?: boolean
}

/**
 * Individual message bubble with copy-to-clipboard on hover.
 * User messages render plain text; assistant messages use ChatContent
 * for markdown-like formatting and link previews.
 */
export function ChatBubble({
  content,
  isUser,
  isStreaming = false,
}: ChatBubbleProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }, [content])

  if (isUser) {
    return (
      <div className="rounded-lg bg-ink-50/50 px-3.5 py-2.5">
        <p className="text-[13px] text-ink-700 leading-relaxed whitespace-pre-wrap break-words font-normal">
          {content}
        </p>
      </div>
    )
  }

  return (
    <div className="group relative">
      <ChatContent content={content} isStreaming={isStreaming} />

      {!isStreaming && content.length > 0 && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 0 }}
          whileHover={{ scale: 1.05, opacity: 1 }}
          transition={{ duration: 0.15 }}
          onClick={handleCopy}
          className="absolute -top-1 -right-1 p-1 rounded bg-paper-100 border border-paper-300 text-ink-400 hover:text-ink-600 focus:opacity-100 focus:outline-none opacity-0 group-hover:opacity-100"
          title="Copy to clipboard"
        >
          {copied ? (
            <CheckIcon className="w-2.5 h-2.5" />
          ) : (
            <CopyIcon className="w-2.5 h-2.5" />
          )}
        </motion.button>
      )}
    </div>
  )
}
