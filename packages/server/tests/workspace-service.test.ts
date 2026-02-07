import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { resetGlobalConfig } from "../src/config"
import {
  initializeWorkspace,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
} from "../src/workspace"

describe("WorkspaceService", () => {
  let tempRoot = ""
  let originalWorkspaceDir: string | undefined

  beforeEach(() => {
    originalWorkspaceDir = process.env.WORKSPACE_DIR
    tempRoot = mkdtempSync(join(tmpdir(), "bibboy-workspace-"))
    process.env.WORKSPACE_DIR = tempRoot
    resetGlobalConfig()
  })

  afterEach(() => {
    if (originalWorkspaceDir === undefined) {
      delete process.env.WORKSPACE_DIR
    } else {
      process.env.WORKSPACE_DIR = originalWorkspaceDir
    }
    resetGlobalConfig()
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it("reads and writes a normal workspace file", async () => {
    await initializeWorkspace("agent-1")

    const wrote = await writeWorkspaceFile("agent-1", "NOTES.md", "hello")
    expect(wrote).toBe(true)

    const file = await readWorkspaceFile("agent-1", "NOTES.md")
    expect(file).not.toBeNull()
    expect(file?.name).toBe("NOTES.md")
    expect(file?.content).toBe("hello")
    expect(file?.path.startsWith(join(tempRoot, "agent-1"))).toBe(true)
  })

  it("blocks traversal attempts that exploit simple startsWith checks", async () => {
    await initializeWorkspace("agent-2")

    // This path shares the same prefix but is outside the workspace directory.
    const attemptedFilename = "../agent-2-escape.md"

    const wrote = await writeWorkspaceFile("agent-2", attemptedFilename, "escaped")
    const read = await readWorkspaceFile("agent-2", attemptedFilename)
    const deleted = await deleteWorkspaceFile("agent-2", attemptedFilename)

    expect(wrote).toBe(false)
    expect(read).toBeNull()
    expect(deleted).toBe(false)
    expect(existsSync(join(tempRoot, "agent-2-escape.md"))).toBe(false)
  })

  it("still protects default template files from deletion", async () => {
    await initializeWorkspace("agent-3")
    const deleted = await deleteWorkspaceFile("agent-3", "SOUL.md")
    expect(deleted).toBe(false)
  })
})
