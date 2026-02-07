import type { ToolExecutionResult } from "@bibboy/shared"
import type { AgentTool } from "./types"
import { jsonResult, errorResult, readStringParam } from "./types"
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  resetWorkspace,
  getWorkspaceDir,
} from "../workspace"

// ============================================================================
// Read File Tool
// ============================================================================

export function createReadFileTool(agentId: string): AgentTool {
  return {
    label: "Read File",
    name: "read_file",
    description: "Read the contents of a workspace file. Use this to view SOUL.md, MEMORY.md, TOOLS.md, USER.md or any other .md file in the workspace.",
    parameters: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "The name of the file to read (e.g., 'MEMORY.md', 'SOUL.md')",
        },
      },
      required: ["filename"],
    },
    execute: async (_toolCallId, args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const filename = readStringParam(args, "filename")

      if (!filename) {
        return errorResult("Missing required parameter: filename")
      }

      // Ensure .md extension
      const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`

      const file = await readWorkspaceFile(agentId, normalizedFilename)

      if (!file) {
        return errorResult(`File not found: ${normalizedFilename}`)
      }

      return jsonResult({
        filename: file.name,
        content: file.content,
        path: file.path,
      })
    },
  }
}

// ============================================================================
// Write File Tool
// ============================================================================

export function createWriteFileTool(agentId: string): AgentTool {
  return {
    label: "Write File",
    name: "write_file",
    description: "Write or update a workspace file. Use this to update MEMORY.md with important information, modify SOUL.md personality, or create new .md files.",
    parameters: {
      type: "object" as const,
      properties: {
        filename: {
          type: "string",
          description: "The name of the file to write (e.g., 'MEMORY.md'). Must end with .md",
        },
        content: {
          type: "string",
          description: "The full content to write to the file",
        },
      },
      required: ["filename", "content"],
    },
    execute: async (_toolCallId, args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const filename = readStringParam(args, "filename")
      const content = readStringParam(args, "content")

      if (!filename) {
        return errorResult("Missing required parameter: filename")
      }

      if (content === undefined) {
        return errorResult("Missing required parameter: content")
      }

      // Ensure .md extension
      const normalizedFilename = filename.endsWith(".md") ? filename : `${filename}.md`

      const success = await writeWorkspaceFile(agentId, normalizedFilename, content)

      if (!success) {
        return errorResult(`Failed to write file: ${normalizedFilename}. Only .md files are allowed.`)
      }

      return jsonResult({
        success: true,
        filename: normalizedFilename,
        message: `Successfully wrote ${content.length} characters to ${normalizedFilename}`,
      })
    },
  }
}

// ============================================================================
// List Files Tool
// ============================================================================

export function createListFilesTool(agentId: string): AgentTool {
  return {
    label: "List Files",
    name: "list_files",
    description: "List all markdown files in the workspace directory.",
    parameters: {
      type: "object" as const,
      properties: {},
      required: [],
    },
    execute: async (_toolCallId): Promise<ToolExecutionResult> => {
      const files = await listWorkspaceFiles(agentId)
      const workspaceDir = getWorkspaceDir(agentId)

      return jsonResult({
        workspaceDir,
        files: files.map((f) => ({
          name: f.name,
          size: f.content.length,
        })),
        count: files.length,
      })
    },
  }
}

// ============================================================================
// Reset Workspace Tool
// ============================================================================

export function createResetWorkspaceTool(agentId: string): AgentTool {
  return {
    label: "Reset Workspace",
    name: "reset_workspace",
    description: "Reset all workspace files to their default state. This will restore SOUL.md, MEMORY.md, TOOLS.md, and USER.md to their original templates. Use this when the user asks to clear context or reset the agent.",
    parameters: {
      type: "object" as const,
      properties: {
        confirm: {
          type: "boolean",
          description: "Must be true to confirm the reset",
        },
      },
      required: ["confirm"],
    },
    execute: async (_toolCallId, args: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const confirm = args.confirm

      if (confirm !== true) {
        return errorResult("Reset not confirmed. Set confirm: true to proceed.")
      }

      try {
        await resetWorkspace(agentId)

        return jsonResult({
          success: true,
          message: "Workspace reset to default state. All context files have been restored to their original templates.",
          filesReset: ["SOUL.md", "MEMORY.md", "TOOLS.md", "USER.md"],
        })
      } catch (error) {
        return errorResult(`Failed to reset workspace: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    },
  }
}

// ============================================================================
// Create All Workspace Tools
// ============================================================================

export function createWorkspaceTools(agentId: string): AgentTool[] {
  return [
    createReadFileTool(agentId),
    createWriteFileTool(agentId),
    createListFilesTool(agentId),
    createResetWorkspaceTool(agentId),
  ]
}
