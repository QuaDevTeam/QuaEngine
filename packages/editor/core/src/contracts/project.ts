export type PreviewTarget = 'web' | 'native'
export interface EditorCreateProject {
  name: string
  kind: 'game' | 'plugin'
}
export interface EditorRuntimeState {
  root: string
  phase: 'checking' | 'installing' | 'ready' | 'error' | 'cancelled'
  message: string
  missing: string[]
  /** Bounded installation output, not game logs. */
  log: string
  dependenciesChanged?: boolean
}
export type EditorFileKind = 'document' | 'image' | 'audio' | 'video' | 'font' | 'package' | 'other'
export interface EditorFileEntry {
  path: string
  kind: EditorFileKind
  size: number
  modified: number
}
export interface EditorImageMetadata {
  /** Original frame dimensions after applying EXIF orientation, before preview resizing. */
  width: number
  height: number
  format: string
  hasAlpha: boolean
}
export interface EditorSearchRequest {
  root: string
  query: string
  caseSensitive: boolean
  wholeWord: boolean
  regex: boolean
  /** Comma separated ripgrep globs. */
  include: string
  exclude: string
}
export interface EditorSearchMatch {
  path: string
  line: number
  column: number
  text: string
  /** UTF-16 offsets inside text, suitable for DOM highlighting. */
  start: number
  end: number
}
export interface EditorSearchResult {
  matches: EditorSearchMatch[]
  truncated: boolean
  cancelled: boolean
}
export interface EditorImportResult {
  imported: string[]
  skipped: string[]
}
export type EditorFileOperation
  = | { kind: 'create-file' | 'create-directory', destination: string }
    | { kind: 'move' | 'copy', path: string, destination: string }
    | { kind: 'delete', path: string }
export type EditorFileMenuAction = 'new-file' | 'new-folder' | 'rename' | 'copy' | 'cut' | 'paste' | 'delete' | 'copy-path' | 'reveal'
export interface EditorFileOperationResult {
  applied: boolean
  project?: EditorProject
}
export interface EditorDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  filePath?: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}
export interface EditorStoryNode {
  /** Stable source identity; separate from authored ids which may repeat across files. */
  key: string
  id: string
  title: string
  kind: 'chapter' | 'file' | 'scene' | 'entry' | 'node' | 'label' | 'choice'
  filePath?: string
  line?: number
  column?: number
  children: EditorStoryNode[]
}
export interface EditorProject {
  pluginProject?: import('../plugins/publishing.js').EditorPluginProject
  devtools?: import('../plugins/marketplace.js').EditorDevtoolsDescriptor[]
  /** Editor-only contributions, keyed by installed plugin id. */
  plugins?: Record<string, import('../plugins/contracts.js').EditorPluginData>
  root: string
  name: string
  bundleId: string
  files: string[]
  entries: EditorFileEntry[]
  directories: string[]
  story: EditorStoryNode[]
  diagnostics: EditorDiagnostic[]
  targets: Record<PreviewTarget, {
    enabled: boolean
    script?: string
    reason?: string
  }>
}
export interface EditorDocument {
  path: string
  text: string
  /** Hash of the bytes last read from disk, for conflict detection. */
  revision: string
}
export interface EditorProjectChange {
  project: EditorProject
  /** Paths relative to project.root. An empty path means the whole project. */
  paths: string[]
}

export interface EditorBuildStep {
  id: string
  title: string
  description: string
  phase: 'pending' | 'running' | 'completed' | 'skipped' | 'error' | 'cancelled'
  detail?: string
  startedAt?: number
  finishedAt?: number
  completed?: number
  total?: number
}

export interface EditorBuildState {
  root: string
  target: PreviewTarget
  phase: 'building' | 'completed' | 'error' | 'cancelled'
  message: string
  log: string
  steps: EditorBuildStep[]
  startedAt: number
  finishedAt?: number
  artifact?: string
  signing?: 'adhoc' | 'developer-id'
  notarized?: boolean
}
