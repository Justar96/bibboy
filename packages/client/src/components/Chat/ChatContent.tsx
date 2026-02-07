import { useMemo, useEffect, useRef, Fragment, memo, useState, useCallback } from "react"
import hljs from "highlight.js/lib/core"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import xml from "highlight.js/lib/languages/xml"
import "highlight.js/styles/atom-one-dark.css"

hljs.registerLanguage("javascript", javascript)
hljs.registerLanguage("js", javascript)
hljs.registerLanguage("typescript", typescript)
hljs.registerLanguage("ts", typescript)
hljs.registerLanguage("python", python)
hljs.registerLanguage("json", json)
hljs.registerLanguage("bash", bash)
hljs.registerLanguage("shell", bash)
hljs.registerLanguage("xml", xml)
hljs.registerLanguage("html", xml)

import { LinkPreview } from "@/components/ui/LinkPreview"
import { stripThinkingTags } from "@/utils/format"
import { CopyIcon, CheckIcon } from "./icons"

interface ChatContentProps {
  content: string
  isStreaming?: boolean
}

const MARKDOWN_CHAR_LIMIT = 50_000

// Regex patterns
const CODE_BLOCK_PATTERN = /```(\w+)?\n([\s\S]*?)```/g
const LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g
const INLINE_CODE_PATTERN = /`([^`]+)`/g
const BOLD_PATTERN = /\*\*([^*]+)\*\*/g
const ITALIC_PATTERN = /(?<!\*)\*([^*]+)\*(?!\*)/g
const BULLET_PATTERN = /^([•\-*])\s+/
const NUMBERED_PATTERN = /^(\d+)\.\s+/
const HEADING_PATTERN = /^(#{1,4})\s+(.+)$/
const BLOCKQUOTE_PATTERN = /^>\s?(.*)/
const HR_PATTERN = /^(-{3,}|_{3,}|\*{3,})\s*$/
const TABLE_SEPARATOR_PATTERN = /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/

type ContentSegment =
  | { type: "text"; value: string; key: string }
  | { type: "code"; language: string; code: string; key: string }

export const ChatContent = memo(function ChatContent({ content, isStreaming }: ChatContentProps) {
  const codeRef = useRef<HTMLDivElement>(null)
  const highlightedRef = useRef<Set<string>>(new Set())

  const segments = useMemo(() => {
    let processed = stripThinkingTags(content)
    if (processed.length > MARKDOWN_CHAR_LIMIT) {
      processed = processed.slice(0, MARKDOWN_CHAR_LIMIT) + "\n\n… (truncated)"
    }
    return parseContent(processed)
  }, [content])

  // Delay code highlighting until streaming stops to prevent constant re-renders
  useEffect(() => {
    if (!codeRef.current || isStreaming) return

    const timer = setTimeout(() => {
      const blocks = codeRef.current?.querySelectorAll("pre code:not(.hljs)")
      blocks?.forEach((block) => {
        const key = (block as HTMLElement).dataset.key
        if (key && !highlightedRef.current.has(key)) {
          hljs.highlightElement(block as HTMLElement)
          highlightedRef.current.add(key)
        }
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [segments, isStreaming])

  return (
    <div
      ref={codeRef}
      className={`chat-content-wrapper ${isStreaming ? "streaming" : "complete"}`}
      style={{ minHeight: isStreaming ? 'auto' : undefined }}
    >
      {segments.map((segment) => (
        <Fragment key={segment.key}>
          {segment.type === "code" ? (
            <CodeBlock
              language={segment.language}
              code={segment.code}
              dataKey={segment.key}
              isStreaming={isStreaming}
            />
          ) : (
            <InlineContent text={segment.value} />
          )}
        </Fragment>
      ))}
      {isStreaming && (
        <span className="inline-block w-[0.55em] h-[1.15em] bg-[#888888]/50 translate-y-[3px] animate-blink font-mono" aria-hidden="true" />
      )}
    </div>
  )
})

/** Memoized code block with header bar (language + copy) */
const CodeBlock = memo(function CodeBlock({
  language,
  code,
  dataKey,
  isStreaming
}: {
  language: string
  code: string
  dataKey: string
  isStreaming?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [code])

  const showHeader = language !== "plaintext" || !isStreaming

  return (
    <div className="chat-code-wrapper">
      {showHeader && (
        <div className="chat-code-header">
          <span className="chat-code-lang">{language}</span>
          <button
            onClick={handleCopy}
            className="chat-code-copy"
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? (
              <>
                <CheckIcon className="w-2.5 h-2.5" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <CopyIcon className="w-2.5 h-2.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}
      <pre className={`chat-code-block ${isStreaming ? 'streaming' : ''}`}>
        <code className={`language-${language}`} data-key={dataKey}>
          {code}
        </code>
      </pre>
    </div>
  )
})

function parseContent(text: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const codeBlocks: { start: number; end: number; segment: ContentSegment }[] = []

  let match: RegExpExecArray | null
  const codeRegex = new RegExp(CODE_BLOCK_PATTERN.source, "g")
  let codeIndex = 0

  while ((match = codeRegex.exec(text)) !== null) {
    const codeContent = match[2].trim()
    codeBlocks.push({
      start: match.index,
      end: match.index + match[0].length,
      segment: {
        type: "code",
        language: match[1] || "plaintext",
        code: codeContent,
        key: `code-${codeIndex}-${codeContent.slice(0, 20).replace(/\s/g, '')}`,
      },
    })
    codeIndex++
  }

  let lastEnd = 0
  let textIndex = 0
  for (const block of codeBlocks) {
    if (block.start > lastEnd) {
      const textContent = text.slice(lastEnd, block.start)
      segments.push({ type: "text", value: textContent, key: `text-${textIndex}-${lastEnd}` })
      textIndex++
    }
    segments.push(block.segment)
    lastEnd = block.end
  }

  if (lastEnd < text.length) {
    segments.push({ type: "text", value: text.slice(lastEnd), key: `text-${textIndex}-${lastEnd}` })
  }

  return segments.length ? segments : [{ type: "text", value: text, key: "text-0-0" }]
}

// ============================================================================
// Table Parser
// ============================================================================

interface TableData {
  headers: string[]
  alignments: ("left" | "center" | "right")[]
  rows: string[][]
}

function parseTableBlock(lines: string[]): TableData | null {
  if (lines.length < 2) return null

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim())

  const headers = parseRow(lines[0])
  const sepLine = lines[1]

  if (!TABLE_SEPARATOR_PATTERN.test(sepLine)) return null

  const sepCells = parseRow(sepLine)
  const alignments: ("left" | "center" | "right")[] = sepCells.map((cell) => {
    const trimmed = cell.trim()
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center"
    if (trimmed.endsWith(":")) return "right"
    return "left"
  })

  const rows = lines.slice(2).map(parseRow)

  return { headers, alignments, rows }
}

function ChatTable({ table }: { table: TableData }) {
  return (
    <div className="chat-table-wrapper">
      <table className="chat-table">
        <thead>
          <tr>
            {table.headers.map((header, i) => (
              <th key={i} style={{ textAlign: table.alignments[i] || "left" }}>
                <InlineText text={header} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{ textAlign: table.alignments[ci] || "left" }}>
                  <InlineText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// Inline Content (block-level parsing)
// ============================================================================

/**
 * Renders inline content with headings, blockquotes, tables, lists, links,
 * bold, inline code, horizontal rules, and paragraph grouping.
 */
function InlineContent({ text }: { text: string }) {
  const lines = text.split("\n")
  const elements: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // Skip empty lines but add spacing
    if (!line.trim()) {
      if (elements.length > 0 && i < lines.length - 1) {
        elements.push(<div key={`space-${i}`} className="h-2" />)
      }
      i++
      continue
    }

    // Horizontal rule
    if (HR_PATTERN.test(line)) {
      elements.push(<hr key={`hr-${i}`} className="chat-hr" />)
      i++
      continue
    }

    // Heading
    const headingMatch = line.match(HEADING_PATTERN)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3 | 4
      const Tag = `h${level}` as const
      elements.push(
        <Tag key={`h-${i}`} className={`chat-heading chat-heading-${level}`}>
          <InlineText text={headingMatch[2]} />
        </Tag>
      )
      i++
      continue
    }

    // Blockquote
    const bqMatch = line.match(BLOCKQUOTE_PATTERN)
    if (bqMatch) {
      const bqLines: string[] = []
      while (i < lines.length) {
        const bqm = lines[i].match(BLOCKQUOTE_PATTERN)
        if (!bqm) break
        bqLines.push(bqm[1])
        i++
      }
      elements.push(
        <blockquote key={`bq-${i}`} className="chat-blockquote">
          {bqLines.map((bl, bi) => (
            <Fragment key={bi}>
              <InlineText text={bl} />
              {bi < bqLines.length - 1 && <br />}
            </Fragment>
          ))}
        </blockquote>
      )
      continue
    }

    // Table detection: line has | and next line is separator
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1])) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].includes("|")) {
        tableLines.push(lines[i])
        i++
      }
      const table = parseTableBlock(tableLines)
      if (table) {
        elements.push(<ChatTable key={`table-${i}`} table={table} />)
        continue
      }
      // If parsing failed, fall through to normal rendering
      i -= tableLines.length
    }

    // Bullet list
    const bulletMatch = line.match(BULLET_PATTERN)
    if (bulletMatch) {
      const listItems: string[] = []
      while (i < lines.length && BULLET_PATTERN.test(lines[i])) {
        listItems.push(lines[i].replace(BULLET_PATTERN, ""))
        i++
      }
      elements.push(
        <ul key={`ul-${i}`} className="chat-list">
          {listItems.map((item, idx) => (
            <li key={idx} className="chat-list-item">
              <InlineText text={item} />
            </li>
          ))}
        </ul>
      )
      continue
    }

    // Numbered list
    const numMatch = line.match(NUMBERED_PATTERN)
    if (numMatch) {
      const listItems: { num: number; text: string }[] = []
      while (i < lines.length) {
        const m = lines[i].match(NUMBERED_PATTERN)
        if (!m) break
        listItems.push({ num: parseInt(m[1]), text: lines[i].replace(NUMBERED_PATTERN, "") })
        i++
      }
      elements.push(
        <ol key={`ol-${i}`} className="chat-list">
          {listItems.map((item, idx) => (
            <li key={idx} className="chat-list-item" value={item.num}>
              <InlineText text={item.text} />
            </li>
          ))}
        </ol>
      )
      continue
    }

    // Regular paragraph: group consecutive non-special lines
    const paraLines: string[] = []
    while (i < lines.length) {
      const l = lines[i]
      if (!l.trim()) break
      if (HR_PATTERN.test(l)) break
      if (HEADING_PATTERN.test(l)) break
      if (BLOCKQUOTE_PATTERN.test(l)) break
      if (BULLET_PATTERN.test(l)) break
      if (NUMBERED_PATTERN.test(l)) break
      if (l.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR_PATTERN.test(lines[i + 1])) break
      paraLines.push(l)
      i++
    }

    if (paraLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} className="chat-paragraph">
          {paraLines.map((pl, pi) => (
            <Fragment key={pi}>
              <InlineText text={pl} />
              {pi < paraLines.length - 1 && <br />}
            </Fragment>
          ))}
        </p>
      )
    }
  }

  return <>{elements}</>
}

// ============================================================================
// Inline Text Parser
// ============================================================================

type InlineNode =
  | { type: "text"; value: string }
  | { type: "link"; text: string; href: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "code"; value: string }

function ChatLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isExternal = href.startsWith('http') || href.startsWith('//')

  return (
    <LinkPreview
      url={href}
      className="chat-link-styled"
    >
      <span className="chat-link-content">
        {children}
        {isExternal && (
          <svg
            className="chat-link-icon"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4.5 2.5h-2a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1v-2"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <path
              d="M8.5 7.5l6-6m0 0h-4m4 0v4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    </LinkPreview>
  )
}

function InlineText({ text }: { text: string }) {
  const nodes = parseInline(text)

  return (
    <>
      {nodes.map((node, i) => {
        switch (node.type) {
          case "text":
            return <Fragment key={i}>{node.value}</Fragment>
          case "link":
            return (
              <ChatLink key={i} href={node.href}>
                {node.text}
              </ChatLink>
            )
          case "bold":
            return <strong key={i} className="font-semibold">{node.value}</strong>
          case "italic":
            return <em key={i}>{node.value}</em>
          case "code":
            return <code key={i} className="chat-inline-code">{node.value}</code>
          default:
            return null
        }
      })}
    </>
  )
}

function parseInline(text: string): InlineNode[] {
  type Match = { start: number; end: number; node: InlineNode }
  const matches: Match[] = []

  let m: RegExpExecArray | null
  const linkRegex = new RegExp(LINK_PATTERN.source, "g")
  while ((m = linkRegex.exec(text)) !== null) {
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      node: { type: "link", text: m[1], href: m[2] },
    })
  }

  const codeRegex = new RegExp(INLINE_CODE_PATTERN.source, "g")
  while ((m = codeRegex.exec(text)) !== null) {
    if (!overlaps(matches, m.index, m.index + m[0].length)) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        node: { type: "code", value: m[1] },
      })
    }
  }

  const boldRegex = new RegExp(BOLD_PATTERN.source, "g")
  while ((m = boldRegex.exec(text)) !== null) {
    if (!overlaps(matches, m.index, m.index + m[0].length)) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        node: { type: "bold", value: m[1] },
      })
    }
  }

  const italicRegex = new RegExp(ITALIC_PATTERN.source, "g")
  while ((m = italicRegex.exec(text)) !== null) {
    if (!overlaps(matches, m.index, m.index + m[0].length)) {
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        node: { type: "italic", value: m[1] },
      })
    }
  }

  matches.sort((a, b) => a.start - b.start)

  const nodes: InlineNode[] = []
  let lastIndex = 0

  for (const match of matches) {
    if (match.start > lastIndex) {
      nodes.push({ type: "text", value: text.slice(lastIndex, match.start) })
    }
    nodes.push(match.node)
    lastIndex = match.end
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", value: text.slice(lastIndex) })
  }

  return nodes.length ? nodes : [{ type: "text", value: text }]
}

function overlaps(matches: { start: number; end: number }[], start: number, end: number): boolean {
  return matches.some(m => (start >= m.start && start < m.end) || (end > m.start && end <= m.end))
}
