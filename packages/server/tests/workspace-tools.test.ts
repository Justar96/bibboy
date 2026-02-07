import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../src/workspace", () => ({
  listWorkspaceFiles: vi.fn(async () => []),
  readWorkspaceFile: vi.fn(async () => null),
  writeWorkspaceFile: vi.fn(async () => true),
  resetWorkspace: vi.fn(async () => {}),
  getWorkspaceDir: vi.fn(() => "/tmp/workspace"),
}))

import {
  createReadFileTool,
  createWriteFileTool,
} from "../src/tools/workspace-tools"
import { readWorkspaceFile, writeWorkspaceFile } from "../src/workspace"

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

describe("workspace tools", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("read_file normalizes filename with .md extension", async () => {
    vi.mocked(readWorkspaceFile).mockResolvedValue({
      name: "SOUL.md",
      path: "/tmp/workspace/SOUL.md",
      content: "Soul content",
      updatedAt: new Date(),
    })

    const tool = createReadFileTool("agent-1")
    const result = await tool.execute("call_1", { filename: "SOUL" })

    expect(readWorkspaceFile).toHaveBeenCalledWith("agent-1", "SOUL.md")
    expect(result.error).toBeUndefined()
    expect(isRecord(result.details)).toBe(true)
    if (isRecord(result.details)) {
      expect(result.details.filename).toBe("SOUL.md")
    }
  })

  it("write_file returns error when content is missing", async () => {
    const tool = createWriteFileTool("agent-2")
    const result = await tool.execute("call_2", { filename: "MEMORY.md" })

    expect(result.error).toBe("Missing required parameter: content")
    expect(writeWorkspaceFile).not.toHaveBeenCalled()
  })

  it("write_file preserves exact content without trimming", async () => {
    const rawContent = "  line one\nline two  "

    const tool = createWriteFileTool("agent-3")
    const result = await tool.execute("call_3", {
      filename: "MEMORY",
      content: rawContent,
    })

    expect(writeWorkspaceFile).toHaveBeenCalledWith("agent-3", "MEMORY.md", rawContent)
    expect(result.error).toBeUndefined()
  })
})
