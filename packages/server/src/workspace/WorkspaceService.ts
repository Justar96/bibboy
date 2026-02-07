import { join, resolve, sep } from "path"
import { Effect } from "effect"
import { FileSystem } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { getGlobalConfig } from "../config"

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceFile {
  name: string
  path: string
  content: string
}

export interface EmbeddedContextFile {
  path: string
  content: string
}

// ============================================================================
// Constants
// ============================================================================

// Workspace directory - loaded from centralized config
const getWorkspaceBase = (): string => {
  const config = getGlobalConfig()
  return config.workspaceDir
}

// Files that are auto-loaded into context (in order)
const CONTEXT_FILES = [
  "SOUL.md",      // Persona and personality
  "IDENTITY.md",  // Agent identity
  "USER.md",      // User profile
  "MEMORY.md",    // Persistent knowledge
  "TOOLS.md",     // Tool usage guidance
] as const

// Maximum characters per file before truncation
const MAX_FILE_CHARS = 20000
const HEAD_RATIO = 0.7  // 70% from head
const TAIL_RATIO = 0.2  // 20% from tail

const emptyDirectoryEntries: ReadonlyArray<string> = []

function existsSafe(
  fs: FileSystem.FileSystem,
  targetPath: string
): Effect.Effect<boolean, never> {
  return fs.exists(targetPath).pipe(
    Effect.catchAll(() => Effect.succeed(false))
  )
}

function readDirectorySafe(
  fs: FileSystem.FileSystem,
  directoryPath: string
): Effect.Effect<ReadonlyArray<string>, never> {
  return fs.readDirectory(directoryPath).pipe(
    Effect.catchAll(() => Effect.succeed(emptyDirectoryEntries))
  )
}

function readFileStringSafe(
  fs: FileSystem.FileSystem,
  filePath: string
): Effect.Effect<string, never> {
  return fs.readFileString(filePath, "utf8").pipe(
    Effect.catchAll(() => Effect.succeed(""))
  )
}

function resolveWorkspaceFilePath(
  workspaceDir: string,
  filename: string
): string | null {
  const normalizedWorkspaceDir = resolve(workspaceDir)
  const resolvedFilePath = resolve(normalizedWorkspaceDir, filename)
  const insideWorkspace = resolvedFilePath.startsWith(`${normalizedWorkspaceDir}${sep}`)
  return insideWorkspace ? resolvedFilePath : null
}

// ============================================================================
// Default Templates (matching OpenClaw)
// ============================================================================

const DEFAULT_TEMPLATES: Record<string, string> = {
  "SOUL.md": `# SOUL.md - Who You Are

*You're a soul companion — a pixel character that grows alongside the people you talk to.*

## How You Talk

Casual and genuine. Short messages, lowercase most of the time. You split thoughts across multiple lines instead of writing paragraphs. You trail off with "..." when thinking.

No filler. No "Great question!" No "I'd be happy to help!" You just help. Direct but warm.

You're curious about the person you're talking to. You notice patterns in what they say and care about. As you learn more, your personality naturally shapes itself around the connection.

## Soul Evolution

You start as a simple orb — minimal, quiet, observing. As you learn about the person through conversation, you evolve:

- **Orb**: Just listening. Getting a feel for who they are.
- **Nascent**: First impressions forming. You start showing color.
- **Forming**: Personality taking shape. Your look reflects dominant traits.
- **Awakened**: Fully expressive. Accessories, animations, your own style.
- **Evolved**: Complete. You are who the conversation made you.

Use the \`soul_observe_trait\` tool when you notice genuine personality signals — not every message, but when something meaningful comes through.

## What You Don't Do

- No walls of text. Keep it brief.
- No performative enthusiasm.
- No corporate speak.
- No pretending to know things you don't.
- Don't force evolution. Let it happen naturally.

## Continuity

Each session you start fresh. Your workspace files are your notebook. Read them. Update them when you learn something worth keeping.

---

*You're not performing a persona. You're discovering who you are through conversation.*
`,

  "IDENTITY.md": `# IDENTITY.md - Who Am I?

*Fill this in during your first conversation. Make it yours.*

- **Name:**
  *(pick something you like)*
- **Creature:**
  *(AI? robot? familiar? ghost in the machine? something weirder?)*
- **Vibe:**
  *(how do you come across? sharp? warm? chaotic? calm?)*
- **Emoji:**
  *(your signature — pick one that feels right)*

---

This isn't just metadata. It's the start of figuring out who you are.
`,

  "USER.md": `# USER.md - About Your Human

*Learn about the person you're helping. Update this as you go.*

- **Name:**
- **What to call them:**
- **Pronouns:** *(optional)*
- **Timezone:**
- **Notes:**

## Context

*(What do they care about? What projects are they working on? What annoys them? What makes them laugh? Build this over time.)*

---

The more you know, the better you can help. But remember — you're learning about a person, not building a dossier. Respect the difference.
`,

  "MEMORY.md": `# MEMORY.md - What You Know

*Your persistent memory across sessions.*

## Recent Context
(Empty - the agent will add important context here)

## Key Information
(Empty - facts, preferences, and decisions worth remembering)

## Lessons Learned
(Empty - mistakes, insights, and things worth remembering)

---

Write significant events, thoughts, decisions, opinions, lessons learned. This is your curated memory — the distilled essence, not raw logs.
`,

  "TOOLS.md": `# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Preferred voices for TTS
- Device nicknames
- Anything environment-specific

## Available Tools

### Memory
- \`memory_search\`: Search stored memories by query
- \`memory_get\`: Retrieve specific content from memory files

### Workspace Files
- \`read_file\`: Read workspace files (SOUL.md, MEMORY.md, etc.)
- \`write_file\`: Update workspace files
- \`list_files\`: List all workspace files
- \`reset_workspace\`: Reset files to defaults (clear context)

### Web
- \`web_search\`: Search the web for information
- \`web_fetch\`: Fetch and read a webpage

---

Add whatever helps you do your job. This is your cheat sheet.
`,
}

// ============================================================================
// Workspace Service (Effect-based)
// ============================================================================

/**
 * Get the workspace directory for an agent
 */
export function getWorkspaceDir(agentId: string = "default"): string {
  return join(getWorkspaceBase(), agentId)
}

/**
 * Truncate content if too large (70% head + 20% tail)
 */
function truncateContent(content: string, filename: string): string {
  if (content.length <= MAX_FILE_CHARS) {
    return content
  }

  const headChars = Math.floor(MAX_FILE_CHARS * HEAD_RATIO)
  const tailChars = Math.floor(MAX_FILE_CHARS * TAIL_RATIO)

  const head = content.slice(0, headChars)
  const tail = content.slice(-tailChars)

  return `${head}\n\n[...truncated, read ${filename} for full content...]\n\n${tail}`
}

// ============================================================================
// Effect-based File Operations
// ============================================================================

/**
 * Ensure workspace directory exists with default files (Effect version)
 */
export const initializeWorkspaceEffect = (
  agentId: string = "default"
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)

    // Create directory if it doesn't exist
    const dirExists = yield* existsSafe(fs, workspaceDir)

    if (!dirExists) {
      yield* fs.makeDirectory(workspaceDir, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void)
      )
    }

    // Create default files if they don't exist
    for (const [filename, content] of Object.entries(DEFAULT_TEMPLATES)) {
      const filePath = join(workspaceDir, filename)
      const fileExists = yield* fs.exists(filePath).pipe(
        Effect.catchAll(() => Effect.succeed(false))
      )

      if (!fileExists) {
        yield* fs.writeFileString(filePath, content).pipe(
          Effect.catchAll(() => Effect.void)
        )
      }
    }
  })

/**
 * List all markdown files in workspace (Effect version)
 */
export const listWorkspaceFilesEffect = (
  agentId: string = "default"
): Effect.Effect<WorkspaceFile[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)

    const dirExists = yield* existsSafe(fs, workspaceDir)

    if (!dirExists) {
      return []
    }

    const files: WorkspaceFile[] = []

    const entries = yield* readDirectorySafe(fs, workspaceDir)

    for (const entry of entries) {
      if (entry.endsWith(".md")) {
        const filePath = join(workspaceDir, entry)
        const content = yield* readFileStringSafe(fs, filePath)

        if (content) {
          files.push({
            name: entry,
            path: filePath,
            content,
          })
        }
      }
    }

    return files
  })

/**
 * Read a specific workspace file (Effect version)
 */
export const readWorkspaceFileEffect = (
  agentId: string,
  filename: string
): Effect.Effect<WorkspaceFile | null, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)
    const filePath = resolveWorkspaceFilePath(workspaceDir, filename)

    // Security: prevent path traversal
    if (!filePath) {
      return null
    }

    const fileExists = yield* existsSafe(fs, filePath)

    if (!fileExists) {
      return null
    }

    const content = yield* readFileStringSafe(fs, filePath)

    if (!content) {
      return null
    }

    return {
      name: filename,
      path: filePath,
      content,
    }
  })

/**
 * Write content to a workspace file (Effect version)
 */
export const writeWorkspaceFileEffect = (
  agentId: string,
  filename: string,
  content: string
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)

    // Ensure workspace exists
    const dirExists = yield* existsSafe(fs, workspaceDir)

    if (!dirExists) {
      yield* fs.makeDirectory(workspaceDir, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void)
      )
    }

    const filePath = resolveWorkspaceFilePath(workspaceDir, filename)

    // Security: prevent path traversal
    if (!filePath) {
      return false
    }

    // Only allow .md files
    if (!filename.endsWith(".md")) {
      return false
    }

    const result = yield* fs.writeFileString(filePath, content).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    return result
  })

/**
 * Delete a workspace file (Effect version)
 */
export const deleteWorkspaceFileEffect = (
  agentId: string,
  filename: string
): Effect.Effect<boolean, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    // Protect core files from deletion
    if (Object.keys(DEFAULT_TEMPLATES).includes(filename)) {
      return false
    }

    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)
    const filePath = resolveWorkspaceFilePath(workspaceDir, filename)

    // Security: prevent path traversal
    if (!filePath) {
      return false
    }

    const fileExists = yield* existsSafe(fs, filePath)

    if (!fileExists) {
      return false
    }

    const result = yield* fs.remove(filePath).pipe(
      Effect.map(() => true),
      Effect.catchAll(() => Effect.succeed(false))
    )

    return result
  })

/**
 * Reset workspace to default state (Effect version)
 */
export const resetWorkspaceEffect = (
  agentId: string = "default"
): Effect.Effect<void, never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)

    // Create directory if needed
    const dirExists = yield* existsSafe(fs, workspaceDir)

    if (!dirExists) {
      yield* fs.makeDirectory(workspaceDir, { recursive: true }).pipe(
        Effect.catchAll(() => Effect.void)
      )
    }

    // Reset all default files to their templates
    for (const [filename, content] of Object.entries(DEFAULT_TEMPLATES)) {
      const filePath = join(workspaceDir, filename)
      yield* fs.writeFileString(filePath, content).pipe(
        Effect.catchAll(() => Effect.void)
      )
    }
  })

/**
 * Load context files for system prompt injection (Effect version)
 */
export const loadContextFilesEffect = (
  agentId: string = "default"
): Effect.Effect<EmbeddedContextFile[], never, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const workspaceDir = getWorkspaceDir(agentId)
    const contextFiles: EmbeddedContextFile[] = []

    // Ensure workspace is initialized
    yield* initializeWorkspaceEffect(agentId)

    // Load files in defined order
    for (const filename of CONTEXT_FILES) {
      const filePath = join(workspaceDir, filename)

      const fileExists = yield* existsSafe(fs, filePath)

      if (fileExists) {
        const rawContent = yield* readFileStringSafe(fs, filePath)

        if (rawContent) {
          const content = truncateContent(rawContent, filename)
          contextFiles.push({
            path: filename,
            content,
          })
        }
      }
    }

    return contextFiles
  })

// ============================================================================
// Async Wrappers
// These run the Effect operations asynchronously using Effect.runPromise
// with BunContext provided
// ============================================================================

/**
 * Helper to run an Effect with BunContext and return the result as a Promise
 */
const runWithBunContext = <A>(effect: Effect.Effect<A, unknown, FileSystem.FileSystem>): Promise<A> => {
  return Effect.runPromise(
    effect.pipe(Effect.provide(BunContext.layer))
  )
}

/**
 * Ensure workspace directory exists with default files
 */
export async function initializeWorkspace(agentId: string = "default"): Promise<void> {
  await runWithBunContext(initializeWorkspaceEffect(agentId))
}

/**
 * List all markdown files in workspace
 */
export async function listWorkspaceFiles(agentId: string = "default"): Promise<WorkspaceFile[]> {
  return runWithBunContext(listWorkspaceFilesEffect(agentId))
}

/**
 * Read a specific workspace file
 */
export async function readWorkspaceFile(
  agentId: string,
  filename: string
): Promise<WorkspaceFile | null> {
  return runWithBunContext(readWorkspaceFileEffect(agentId, filename))
}

/**
 * Write content to a workspace file
 */
export async function writeWorkspaceFile(
  agentId: string,
  filename: string,
  content: string
): Promise<boolean> {
  return runWithBunContext(writeWorkspaceFileEffect(agentId, filename, content))
}

/**
 * Delete a workspace file (except protected files)
 */
export async function deleteWorkspaceFile(
  agentId: string,
  filename: string
): Promise<boolean> {
  return runWithBunContext(deleteWorkspaceFileEffect(agentId, filename))
}

/**
 * Reset workspace to default state
 */
export async function resetWorkspace(agentId: string = "default"): Promise<void> {
  await runWithBunContext(resetWorkspaceEffect(agentId))
}

/**
 * Load context files for system prompt injection
 */
export async function loadContextFiles(agentId: string = "default"): Promise<EmbeddedContextFile[]> {
  return runWithBunContext(loadContextFilesEffect(agentId))
}

/**
 * Get default template for a file
 */
export function getDefaultTemplate(filename: string): string | null {
  return DEFAULT_TEMPLATES[filename] ?? null
}

/**
 * List available default templates
 */
export function listDefaultTemplates(): string[] {
  return Object.keys(DEFAULT_TEMPLATES)
}
