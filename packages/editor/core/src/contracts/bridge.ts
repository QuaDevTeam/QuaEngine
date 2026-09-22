import type { PreviewCommand, PreviewCommandResult, PreviewIdentity, PreviewPointer, PreviewState } from '../preview/contracts.js'
import type { PreviewInspectorDetails, PreviewInspectorTree } from '../preview/inspector.js'
import type { PreviewPerformance } from '../preview/performance.js'
import type { EditorGitDiff, EditorGitState, EditorGitSwitchResult } from './git.js'
import type { EditorAnalysis, EditorCompletion, EditorDefinition, EditorHover, EditorLanguageRequest, EditorProjectCheck, EditorTextEdit } from './language.js'
import type { EditorDocument, EditorFileMenuAction, EditorFileOperation, EditorFileOperationResult, EditorImageMetadata, EditorImportResult, EditorProject, EditorProjectChange, EditorSearchRequest, EditorSearchResult, PreviewTarget } from './project.js'
import type { EditorTerminalEvent, EditorTerminalSession } from './terminal.js'

export interface EditorBounds {
  x: number
  y: number
  width: number
  height: number
}
export interface EditorWindowState {
  platform: 'macos' | 'windows' | 'linux'
  maximized: boolean
  fullscreen: boolean
  focused: boolean
}
export type EditorWindowAction = 'minimize' | 'maximize' | 'fullscreen' | 'close' | 'menu'
/** Narrow preload API. Explicit file, preview and terminal capabilities only; no generic host IPC. */
export interface EditorBridge {
  buildProject: (root: string, target: PreviewTarget) => Promise<void>
  buildState: () => Promise<import('./project.js').EditorBuildState | undefined>
  cancelBuild: () => Promise<void>
  revealBuild: () => Promise<void>
  onBuildState: (listener: (state: import('./project.js').EditorBuildState) => void) => () => void
  onAuthoringRequest: (listener: (request: import('./writing.js').EditorAuthoringRequest) => void) => () => void
  replyAuthoring: (id: number, result?: import('./writing.js').EditorWritingDocument, error?: string) => void
  pluginPublishingState: (root: string) => Promise<import('../plugins/publishing.js').EditorPublishingState>
  setPluginRegistry: (url: string) => Promise<void>
  pluginLogin: () => Promise<{ userCode: string, expiresIn: number }>
  pollPluginLogin: () => Promise<import('../plugins/publishing.js').EditorRegistryAccount | undefined>
  pluginLogout: () => Promise<void>
  claimPlugin: (root: string) => Promise<import('../plugins/contracts.js').EditorSourceEdit | undefined>
  preparePluginPublication: (root: string) => Promise<import('../plugins/publishing.js').EditorPublication>
  publishPlugin: (root: string, artifact: string, otp?: string) => Promise<void>
  submitPlugin: (root: string) => Promise<import('../plugins/publishing.js').EditorPluginSubmission>
  cancelPluginPublication: () => Promise<void>
  pluginMarketplace: (root: string, query?: string) => Promise<import('../plugins/marketplace.js').EditorMarketplaceSnapshot>
  pluginDetails: (root: string, name: string) => Promise<import('../plugins/marketplace.js').EditorPluginDetails>
  setPluginCatalog: (url: string) => Promise<void>
  installPlugin: (root: string, name: string, version: string) => Promise<void>
  cancelPluginInstall: () => Promise<void>
  enablePlugin: (root: string, name: string, enabled: boolean) => Promise<void>
  onPluginInstall: (listener: (event: import('../plugins/marketplace.js').EditorPluginInstallEvent) => void) => () => void
  navigationMenu: (items: { id: string, label: string, checked: boolean, enabled: boolean }[]) => Promise<string | undefined>
  presentNovelWriter: (active: boolean, bounds: EditorBounds) => Promise<void>
  resizeNovelWriter: (bounds: EditorBounds) => Promise<void>
  onNovelWriterState: (listener: (state: { phase: 'idle' | 'starting' | 'ready' | 'error', error?: string }) => void) => () => void
  createTerminal: (root: string, cols: number, rows: number) => Promise<EditorTerminalSession>
  writeTerminal: (id: string, data: string) => Promise<void>
  resizeTerminal: (id: string, cols: number, rows: number) => Promise<void>
  acknowledgeTerminal: (id: string, sequence: number) => Promise<void>
  closeTerminal: (id: string) => Promise<void>
  focusTerminal: (focused: boolean) => Promise<void>
  onTerminalEvent: (listener: (event: EditorTerminalEvent) => void) => () => void
  fileOperation: (root: string, operation: EditorFileOperation) => Promise<EditorFileOperationResult>
  fileMenu: (root: string, path: string, canPaste: boolean) => Promise<EditorFileMenuAction | undefined>
  windowState: () => Promise<EditorWindowState>
  windowAction: (action: EditorWindowAction, menuPosition?: { x: number, y: number }) => Promise<void>
  onWindowState: (listener: (state: EditorWindowState) => void) => () => void
  openProject: () => Promise<EditorProject | undefined>
  chooseProjectLocation: () => Promise<string | undefined>
  createProject: (request: import('./project.js').EditorCreateProject) => Promise<EditorProject>
  runtimeState: () => Promise<import('./project.js').EditorRuntimeState | undefined>
  repairRuntime: (root: string) => Promise<void>
  cancelRuntime: () => Promise<void>
  onRuntimeState: (listener: (state: import('./project.js').EditorRuntimeState) => void) => () => void
  currentProject: () => Promise<EditorProject | undefined>
  refreshProject: () => Promise<EditorProject>
  onCommand: (listener: (command: 'build-project' | 'source-workspace' | 'new-project' | 'open-project' | 'refresh-project' | 'settings' | 'save' | 'save-all' | 'close-tab' | 'format' | 'undo' | 'redo' | 'terminal' | 'new-terminal') => void) => () => void
  gitStatus: (root: string) => Promise<EditorGitState>
  onGitChange: (listener: (state: EditorGitState) => void) => () => void
  gitDiff: (root: string, path: string, staged: boolean) => Promise<EditorGitDiff>
  gitStage: (root: string, path: string, staged: boolean) => Promise<EditorGitState>
  gitCommit: (root: string, message: string) => Promise<EditorGitState>
  gitBranches: (root: string) => Promise<string[]>
  gitSwitch: (root: string, branch: string, create: boolean) => Promise<EditorGitSwitchResult>
  searchProject: (request: EditorSearchRequest) => Promise<EditorSearchResult>
  cancelSearch: () => Promise<void>
  assetUrl: (root: string, path: string, thumbnail: boolean) => Promise<string>
  imageMetadata: (root: string, path: string) => Promise<EditorImageMetadata>
  revealFile: (root: string, path: string) => Promise<void>
  importAssets: (root: string, directory: string) => Promise<EditorImportResult>
  openAssetPreview: (root: string, path: string) => Promise<void>
  onProjectChange: (listener: (change: EditorProjectChange) => void) => () => void
  readDocument: (path: string) => Promise<EditorDocument>
  saveDocument: (document: EditorDocument) => Promise<EditorDocument>
  setDocumentDirty: (dirty: boolean) => Promise<void>
  confirmDiscard: () => Promise<boolean>
  analyzeDocument: (path: string, text: string) => Promise<EditorAnalysis>
  checkProject: (root: string) => Promise<void>
  onProjectCheck: (listener: (check: EditorProjectCheck) => void) => () => void
  completeDocument: (request: EditorLanguageRequest) => Promise<EditorCompletion[]>
  signatureDocument: (request: EditorLanguageRequest) => Promise<import('./language.js').EditorSignatureHelp | undefined>
  hoverDocument: (request: EditorLanguageRequest) => Promise<EditorHover | undefined>
  defineDocument: (request: EditorLanguageRequest) => Promise<EditorDefinition[]>
  formatDocument: (path: string, text: string, options?: import('./language.js').EditorFormatOptions) => Promise<EditorTextEdit[]>
  syncDocuments: (root: string, documents: { path: string, text: string }[]) => Promise<void>
  startPreview: (target: PreviewTarget) => Promise<void>
  reloadPreview: () => Promise<void>
  setPreviewMuted: (muted: boolean) => Promise<void>
  presentPreview: (mode: 'embedded' | 'window' | 'fullscreen') => Promise<void>
  previewPerformance: (sessionId: string, enabled: boolean) => Promise<PreviewPerformance | undefined>
  inspectPreview: (sessionId: string) => Promise<PreviewInspectorTree>
  previewStorage: (sessionId: string, request: import('../preview/storage.js').PreviewStorageRequest) => Promise<import('../preview/storage.js').PreviewStorageResult>
  inspectPreviewNode: (sessionId: string, nodeId: number) => Promise<PreviewInspectorDetails>
  previewCommand: (sessionId: string, command: PreviewCommand) => Promise<PreviewCommandResult>
  stopPreview: () => Promise<void>
  previewState: () => Promise<PreviewState>
  setPreviewBounds: (bounds: EditorBounds) => Promise<void>
  previewPointer: (sessionId: string, event: PreviewPointer) => Promise<void>
  onPreviewState: (listener: (state: PreviewState) => void) => () => void
  onLog: (listener: (entry: {
    identity: PreviewIdentity
    message: string
  }) => void) => () => void
}
