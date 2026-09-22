import type { EditorDocument, EditorFileEntry, EditorProject } from '../contracts/project.js'

export const EDITOR_PLUGIN_API_VERSION = 1

export interface EditorSourceLocation {
  path: string
  line: number
  column: number
}

/** A source change becomes an undoable document draft, never a direct disk write. */
export interface EditorSourceEdit {
  root: string
  path: string
  revision: string
  start: number
  end: number
  expectedText: string
  newText: string
}

export interface EditorPluginContext {
  /** Mount concise feedback in the workbench footer; owned and removed with this panel. */
  mountStatus?: (element: HTMLElement) => void
  createScenePreview?: () => import('../preview/animation.js').EditorAnimationScenePreview
  /** Exclusively create an empty source file, then apply an undoable draft. Returns the disk baseline. */
  createDocument?: (root: string, path: string, text: string) => Promise<EditorDocument>
  openSource: (location: EditorSourceLocation) => void
  applyEdit: (edit: EditorSourceEdit) => Promise<void>
  assetUrl: (root: string, path: string, thumbnail: boolean) => Promise<string>
  reportError: (error: unknown) => void
}

export interface EditorPluginPanel {
  update: (project: EditorProject) => void
  /** Follow the active indexed source. Undefined cancels a pending source selection. */
  revealSource?: (location: EditorSourceLocation | undefined) => void
  setVisible: (visible: boolean) => void
  dispose: () => void
}

/** Trusted, explicitly installed editor code. This is separate from game/renderer plugins. */
export interface EditorPluginWorkspace {
  active: boolean
  show: (active: boolean) => void
  resize: () => void
}

export interface EditorPlugin {
  id: string
  apiVersion: typeof EDITOR_PLUGIN_API_VERSION
  workspace?: {
    id: string
    title: string
    mount: (bridge: import('../contracts/bridge.js').EditorBridge, changed: (active: boolean) => void, icon: string) => EditorPluginWorkspace
  }
  panels: readonly {
    id: string
    title: string
    /** Match existing project metadata only; must not read or execute project code. */
    acceptsSource?: (project: EditorProject, location: EditorSourceLocation) => boolean
    mount: (host: HTMLElement, context: EditorPluginContext) => EditorPluginPanel | Promise<EditorPluginPanel>
  }[]
}

export interface EditorPluginIndexContext {
  root: string
  entries: readonly EditorFileEntry[]
  /** Canonical, indexed project documents only, with the host's size limits. */
  readDocument: (path: string) => Promise<EditorDocument>
}

/** Runs in the project worker. Results must be structured-cloneable authoring metadata. */
export interface EditorProjectIndexer {
  id: string
  apiVersion: typeof EDITOR_PLUGIN_API_VERSION
  index: (context: EditorPluginIndexContext) => Promise<unknown>
}

export interface EditorPluginData {
  data?: unknown
  error?: string
}
