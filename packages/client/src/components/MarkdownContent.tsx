import { memo, useEffect, useRef } from "react"
import hljs from "highlight.js/lib/core"
import javascript from "highlight.js/lib/languages/javascript"
import typescript from "highlight.js/lib/languages/typescript"
import python from "highlight.js/lib/languages/python"
import json from "highlight.js/lib/languages/json"
import bash from "highlight.js/lib/languages/bash"
import xml from "highlight.js/lib/languages/xml"
import "highlight.js/styles/github.css"

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
import TreeBlock from "./TreeBlock"
import { ProviderComparison } from "./ProviderComparison"
import { InteractiveTokenDemo } from "./InteractiveTokenDemo"
import { TokenCostCalculator } from "./TokenCostCalculator"
import { PipelineVisualizer } from "./PipelineVisualizer"

// ============================================================================
// Types
// ============================================================================

export interface MarkdownContentProps {
  /** Raw markdown content (fallback) */
  readonly content: string
  /** Pre-rendered HTML content from server */
  readonly htmlContent?: string
}

// ============================================================================
// Constants
// ============================================================================

const TREE_CHARS_REGEX = /[├└│─┌┐┘┴┬┤╭╮╯╰]/
const INTERACTIVE_DEMO_PREFIX = "@@TOKEN-DEMO:" as const

/** HTML entity escape map */
const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
} as const

/**
 * MarkdownContent component that renders markdown content.
 * 
 * Uses pre-rendered HTML from PostService (via Bun.markdown) when available,
 * with post-processing for syntax highlighting and interactive components.
 * Falls back to raw content display when htmlContent is not provided.
 * 
 * Requirements: 6.2, 6.5, 3.7
 */
const MarkdownContent = memo(function MarkdownContent({ content, htmlContent }: MarkdownContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Apply syntax highlighting to code blocks
    const codeBlocks = containerRef.current.querySelectorAll("pre code")
    codeBlocks.forEach((block) => {
      // Skip if already highlighted
      if (block.classList.contains("hljs")) return
      hljs.highlightElement(block as HTMLElement)
    })

    // Process tree structures in code blocks
    processTreeBlocks(containerRef.current)

    // Process interactive token demos
    processInteractiveBlocks(containerRef.current)
  }, [htmlContent, content])

  // If we have pre-rendered HTML, use it with dangerouslySetInnerHTML
  if (htmlContent) {
    return (
      <div
        ref={containerRef}
        className="markdown-content prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    )
  }

  // Fallback: display raw content (shouldn't happen in normal usage)
  return (
    <div ref={containerRef} className="markdown-content prose prose-gray max-w-none">
      <pre className="whitespace-pre-wrap">{content}</pre>
    </div>
  )
})

MarkdownContent.displayName = "MarkdownContent"

export default MarkdownContent

/**
 * Process code blocks containing tree structures and replace them with TreeBlock components.
 */
function processTreeBlocks(container: HTMLElement): void {
  const codeBlocks = container.querySelectorAll("pre code")

  codeBlocks.forEach((codeBlock) => {
    const textContent = codeBlock.textContent?.trim() ?? ""
    const hasTreeChars = TREE_CHARS_REGEX.test(textContent)

    if (hasTreeChars) {
      const pre = codeBlock.parentElement
      if (!pre?.parentElement) return

      // Create a wrapper for the TreeBlock
      const wrapper = document.createElement("div")
      wrapper.className = "tree-structure font-mono text-sm bg-gray-50 p-4 rounded-lg overflow-x-auto"

      // Render TreeBlock content
      const lines = textContent.split("\n")
      for (const line of lines) {
        const lineDiv = document.createElement("div")
        lineDiv.style.whiteSpace = "pre"
        lineDiv.innerHTML = colorizeTreeLine(line)
        wrapper.appendChild(lineDiv)
      }

      // Replace the pre element with our custom tree block
      pre.parentElement.replaceChild(wrapper, pre)
    }
  })
}

/**
 * Colorize a single line of tree structure.
 */
function colorizeTreeLine(line: string): string {
  let result = ""
  let i = 0

  while (i < line.length) {
    const char = line[i]
    
    // Check for tree characters
    if (TREE_CHARS_REGEX.test(char)) {
      result += `<span style="color: #6e7781">${escapeHtml(char)}</span>`
      i++
      continue
    }

    // Check for node types (must start with capital letter)
    const nodeTypeMatch = line.substring(i).match(/^([A-Z][a-zA-Z]*(?:Declaration|Statement|Expression|Literal|Definition|Block))/)
    if (nodeTypeMatch) {
      result += `<span style="color: #0969da; font-weight: 600">${escapeHtml(nodeTypeMatch[1])}</span>`
      i += nodeTypeMatch[1].length
      continue
    }

    // Check for Identifier (special node type)
    const identifierMatch = line.substring(i).match(/^(Identifier)\b/)
    if (identifierMatch) {
      result += `<span style="color: #1f883d; font-weight: 600">${escapeHtml(identifierMatch[1])}</span>`
      i += identifierMatch[1].length
      continue
    }

    // Check for quoted strings
    if (char === '"') {
      const endQuote = line.indexOf('"', i + 1)
      if (endQuote !== -1) {
        const quotedText = line.substring(i, endQuote + 1)
        result += `<span style="color: #0a3069">${escapeHtml(quotedText)}</span>`
        i = endQuote + 1
        continue
      }
    }

    // Check for property names (word followed by colon)
    const propertyMatch = line.substring(i).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)
    if (propertyMatch) {
      result += `<span style="color: #8250df; font-weight: 500">${escapeHtml(propertyMatch[1])}</span>`
      i += propertyMatch[1].length
      continue
    }

    // Check for type annotations after colon
    if (char === ":") {
      result += `<span style="color: #24292f">:</span>`
      i++
      // Skip whitespace
      while (i < line.length && /\s/.test(line[i])) {
        result += line[i]
        i++
      }
      // Check for type name
      const typeMatch = line.substring(i).match(/^([A-Z][a-zA-Z0-9<>,\s]*?)(?=\s|$|├|└|│)/)
      if (typeMatch) {
        result += `<span style="color: #1f883d">${escapeHtml(typeMatch[1])}</span>`
        i += typeMatch[1].length
        continue
      }
      continue
    }

    // Check for keywords
    const keywordMatch = line.substring(i).match(/^(private|public|protected|const|let|var|function|class|return|async|await|assigns|returns)\b/)
    if (keywordMatch) {
      result += `<span style="color: #cf222e; font-weight: 500">${escapeHtml(keywordMatch[1])}</span>`
      i += keywordMatch[1].length
      continue
    }

    // Check for brackets and punctuation
    if (/[[\](){},]/.test(char)) {
      result += `<span style="color: #24292f">${escapeHtml(char)}</span>`
      i++
      continue
    }

    // Default: regular text
    result += escapeHtml(char)
    i++
  }

  return result
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

/**
 * Process interactive token demo blocks.
 * These are marked with @@TOKEN-DEMO: prefix in code blocks.
 */
function processInteractiveBlocks(container: HTMLElement): void {
  const codeBlocks = container.querySelectorAll("pre code")

  codeBlocks.forEach((codeBlock) => {
    const textContent = codeBlock.textContent?.trim() ?? ""

    if (textContent.startsWith(INTERACTIVE_DEMO_PREFIX)) {
      const demoType = textContent.slice(INTERACTIVE_DEMO_PREFIX.length).trim()
      const pre = codeBlock.parentElement
      if (!pre?.parentElement) return

      // Create a placeholder div with data attribute for React to hydrate
      const wrapper = document.createElement("div")
      wrapper.className = "interactive-demo-placeholder"
      wrapper.setAttribute("data-demo-type", demoType)

      // Replace the pre element
      pre.parentElement.replaceChild(wrapper, pre)
    }
  })
}

// Re-export interactive components for use in BlogPost when needed
export { TreeBlock, ProviderComparison, InteractiveTokenDemo, TokenCostCalculator, PipelineVisualizer }
