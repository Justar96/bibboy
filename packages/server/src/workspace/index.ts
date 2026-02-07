// Workspace exports
export {
  getWorkspaceDir,
  initializeWorkspace,
  listWorkspaceFiles,
  readWorkspaceFile,
  writeWorkspaceFile,
  deleteWorkspaceFile,
  resetWorkspace,
  loadContextFiles,
  getDefaultTemplate,
  listDefaultTemplates,
} from "./WorkspaceService"

export type {
  WorkspaceFile,
  EmbeddedContextFile,
} from "./WorkspaceService"
