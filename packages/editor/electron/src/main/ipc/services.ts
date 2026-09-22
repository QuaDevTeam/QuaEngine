import type {
  EditorBounds,
  EditorProject,
} from '@quajs/editor-core'
import type { NovelWriterHost } from '@quajs/editor-novel-writer/host'
import type {
  BrowserWindow,
} from 'electron'
import type { PluginManager } from '../../plugins/manager.js'

import type { PluginPublisher } from '../../plugins/publisher.js'
import type { PreviewPresentation } from '../../preview-host/presentation.js'
import type { PreviewWorkbench } from '../../preview-host/workbench.js'
import type { ProjectClient } from '../../project-service/client.js'
import type { ProjectGit } from '../../project-service/git.js'
import type { ProjectSearch } from '../../project-service/search.js'
import type { ProjectBuild } from '../../runtime/project-build.js'
import type { ProjectRuntime } from '../../runtime/project-runtime.js'
import type { TerminalClient } from '../../terminal/client.js'
import type { AssetProtocol } from '../assets.js'
import type { WindowChrome } from '../window-chrome.js'

/** Host-owned services. IPC handlers retain sender validation and project/session guards. */
export interface MainServices {
  build: ProjectBuild
  assetPreviewWindows: Map<number, BrowserWindow>
  assets: AssetProtocol
  bounds: EditorBounds
  chrome: WindowChrome
  closePending: boolean
  closing: boolean
  currentProject: EditorProject | undefined
  documentDirty: boolean
  ensureRuntime: (retry?: boolean) => Promise<void>
  fileOperationBusy: boolean
  git: ProjectGit
  handle: <Args extends unknown[]>(channel: string, action: (...args: Args) => unknown) => void
  openRoot: (root: string) => Promise<EditorProject>
  pluginOperation: boolean
  plugins: PluginManager
  presentation: PreviewPresentation
  previews: PreviewWorkbench
  project: ProjectClient
  projectLocation: string | undefined
  projectOpening: boolean
  publicationOperation: <T>(action: () => Promise<T>) => Promise<T>
  publisher: PluginPublisher
  runtime: ProjectRuntime
  search: ProjectSearch
  storageSession: string | undefined
  syncPlugins: () => Promise<EditorProject | undefined>
  terminalFocused: boolean
  terminalReset: Promise<void> | undefined
  terminals: TerminalClient
  window: BrowserWindow
  writer: NovelWriterHost
  writerBounds: (value: EditorBounds) => EditorBounds
}
