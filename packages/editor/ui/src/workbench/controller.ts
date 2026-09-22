import type {
  EditorBridge,
  EditorFileEntry,
  EditorFileOperation,
  EditorGitDiff,
  EditorPluginWorkspace,
  EditorProject,
  EditorSourceEdit,
  EditorSourceLocation,
  PreviewSourceRequest,
  PreviewState,
} from '@quajs/editor-core'
import type { TerminalPanel } from '../features/terminal/controller'
import type { SidebarView } from './sidebar/views'
import { element as createElement, html } from '@quajs/editor-controls'
import { novelWriterEditorPlugin } from '@quajs/editor-novel-writer'
import { AssetsBrowser } from '../features/assets/browser'
import { ExplorerActions } from '../features/explorer/actions'
import { FileTree } from '../features/explorer/tree'
import { MarketplaceWorkspace } from '../features/extensions/marketplace'
import { GitPanel } from '../features/git/panel'
import { PreviewInspector } from '../features/inspector/panel'
import { StoryOutline } from '../features/outline/panel'
import { PerformancePanel } from '../features/performance/panel'
import { AnimationScenePreviewHost } from '../features/preview/animation-scene'
import { SceneDebugger } from '../features/scene-debugger/controller'
import { SearchPanel } from '../features/search/panel'
import { QuickOpen } from '../features/search/quick-open'
import { PreviewStorage } from '../features/storage/panel'
import { icon } from '../shared/icons'
import { DockWorkbench } from './layout/controller'
import { defaultDockState } from './layout/model'
import { connectNavigation } from './navigation'
import { PluginPanels } from './plugins/panels'
import { editorPlugins, loadEditorPlugin } from './plugins/registry'
import { Sidebar } from './sidebar/controller'
import { ContextStatus } from './status'

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T
}
type PanelView = string

export class Workbench {
  readonly animationScene: AnimationScenePreviewHost
  private readonly messages = new ContextStatus(element('context-status'))
  readonly dock: DockWorkbench
  private readonly sidebar: Sidebar
  private visible: ReadonlySet<string> = new Set()
  private pluginViews: string[] = []
  private plugins: PluginPanels
  private pluginKey = ''
  private pluginGeneration = 0
  readonly marketplace: MarketplaceWorkspace
  readonly writer: EditorPluginWorkspace
  private terminal?: TerminalPanel
  private terminalLoading?: Promise<TerminalPanel>
  private readonly sceneDebugger: SceneDebugger
  private readonly performance: PerformancePanel
  private readonly storage: PreviewStorage
  private readonly inspector: PreviewInspector
  private readonly outline: StoryOutline
  private readonly tree: FileTree
  private readonly search: SearchPanel
  private readonly assets: AssetsBrowser
  private readonly git: GitPanel
  private readonly quickOpen: QuickOpen
  private readonly actions: ExplorerActions
  private panel: PanelView = 'console'
  private activeDocument = ''
  private activeSource?: EditorSourceLocation
  private project?: EditorProject

  constructor(
    private readonly bridge: EditorBridge,
    private readonly open: (
      path: string,
      line?: number,
      column?: number,
    ) => void,
    private readonly error: (error: unknown) => void,
    status: (text: string) => void,
    showGitDiff: (diff: EditorGitDiff) => void,
    saveAll: () => Promise<void>,
    private readonly mutate: (operation: EditorFileOperation, openCreated?: boolean) => Promise<boolean>,
    private readonly modalChanged: () => void,
    private readonly applyEdit: (edit: EditorSourceEdit) => Promise<void>,
    openPreviewSource: (request: PreviewSourceRequest, replay?: boolean) => Promise<void>,
  ) {
    this.animationScene = new AnimationScenePreviewHost(bridge, () => this.project, saveAll, modalChanged)
    this.plugins = new PluginPanels(
      editorPlugins,
      element('panel-tabs'),
      document.querySelector('.bottom-panel')!,
      {
        openSource: location =>
          open(location.path, location.line, location.column),
        applyEdit,
        createScenePreview: () => this.animationScene.create(),
        createDocument: (root, path, text) => this.createPluginDocument(root, path, text),
        assetUrl: (root, path, thumbnail) =>
          bridge.assetUrl(root, path, thumbnail),
        reportError: error,
      },
      key => this.showPanel(key),
      (key, message) => this.messages.mount(`panel:${key}`, message),
    )
    window.addEventListener('beforeunload', () => this.plugins.dispose(), {
      once: true,
    })
    this.outline = new StoryOutline(element('story'), open)
    this.performance = new PerformancePanel(
      element('panel-performance'),
      bridge,
    )
    this.sceneDebugger = new SceneDebugger(element('panel-scene-debugger'), bridge, openPreviewSource)
    this.inspector = new PreviewInspector(element('panel-inspector'), bridge)
    this.storage = new PreviewStorage(element('panel-storage'), bridge)
    this.tree = new FileTree(element('files'), (entry: EditorFileEntry) => {
      if (entry.kind === 'document') {
        open(entry.path)
      }
      else {
        this.showPanel('assets')
        this.assets.selectPath(entry.path)
      }
    })
    this.search = new SearchPanel(element('view-search'), bridge, open)
    this.assets = new AssetsBrowser(
      element('panel-assets'),
      bridge,
      error,
      status,
      (path) => {
        this.showSidebar('explorer')
        element<HTMLInputElement>('file-search').value = ''
        this.tree.reveal(path)
        element('files').focus()
      },
      (text, title = '') => {
        const status = element('asset-status')
        status.textContent = text
        status.title = title
        status.hidden = !text
      },
    )
    this.git = new GitPanel(
      element('view-git'),
      bridge,
      showGitDiff,
      open,
      saveAll,
    )
    for (const [key, id] of [
      ['sidebar:git', 'git-message'],
      ['sidebar:story', 'outline-message'],
      ['panel:inspector', 'inspector-status'],
      ['panel:storage', 'storage-status'],
    ]) this.messages.mount(key, element(id))
    this.messages.mount('panel:scene-debugger', element('panel-scene-debugger').querySelector<HTMLElement>('.scene-debug-message')!)
    this.quickOpen = new QuickOpen((entry, line, column) => {
      if (entry.kind === 'document') {
        open(entry.path, line, column)
      }
      else {
        this.showPanel('assets')
        this.assets.selectPath(entry.path)
      }
    }, modalChanged)
    this.actions = new ExplorerActions(
      this.tree,
      bridge,
      mutate,
      modalChanged,
      error,
      status,
    )
    connectNavigation(((owner: Workbench) => ({
      get tree() {
        return owner.tree
      },
      get actions() {
        return owner.actions
      },
      showSidebar: (...args) => this.showSidebar(...args),
      get git() {
        return owner.git
      },
      showPanel: (...args) => this.showPanel(...args),
      get activeDocument() {
        return owner.activeDocument
      },
      get outline() {
        return owner.outline
      },
      togglePanel: (...args) => this.togglePanel(...args),
      closeFileFilter: (...args) => this.closeFileFilter(...args),
      bindTabKeys: (...args) => this.bindTabKeys(...args),
      get dock() {
        return owner.dock
      },
      openTerminal: (...args) => this.openTerminal(...args),
      get search() {
        return owner.search
      },
      get quickOpen() {
        return owner.quickOpen
      },
      get error() {
        return owner.error
      },
    }))(this))
    this.writer = novelWriterEditorPlugin.workspace!.mount(bridge, modalChanged, icon('writer'))
    this.marketplace = new MarketplaceWorkspace(bridge, modalChanged, this.applyEdit)
    this.messages.mount('workspace:extensions', element('plugin-marketplace').querySelector<HTMLElement>('.market-issues')!)
    const root = createElement(html`<div></div>`)
    root.id = 'dock-workspace'
    document.querySelector('.workspace')!.append(root)
    element('app').classList.add('docked')
    this.dock = new DockWorkbench(root, () => defaultDockState([
      'properties',
      'problems',
      'console',
      'terminal',
      'assets',
      'storage',
      'inspector',
      'scene-debugger',
      'performance',
      ...this.pluginViews,
    ]), (visible, active) => this.visibilityChanged(visible, active), () => {
      document.body.classList.toggle('dock-interacting', this.interacting)
      this.modalChanged()
    })
    this.sidebar = new Sidebar(document.querySelector('.sidebar')!, element('sidebar-splitter'), () => {
      this.search.setVisible(this.sidebar.active === 'search')
      this.updateContextStatus()
    }, () => {
      document.body.classList.toggle('dock-interacting', this.interacting)
      this.modalChanged()
    })
    this.search.setVisible(this.sidebar.active === 'search')
    this.dock.register({ id: 'source', title: '代码编辑器', content: document.querySelector('.source-pane')!, home: 'source' })
    this.dock.register({ id: 'preview', title: '预览', content: document.querySelector('.preview-pane')!, home: 'preview' })
    this.dock.register({ id: 'writer', title: 'Novel Writer', content: element('novel-writer'), home: 'source' })
    this.dock.register({ id: 'extensions', title: '插件', content: element('plugin-marketplace'), home: 'source' })
    const consoleActions = createElement(html`<div></div>`)
    consoleActions.append(element('clear-log'))
    for (const id of ['properties', 'problems', 'console', 'terminal', 'assets', 'inspector', 'storage', 'performance', 'scene-debugger']) {
      const tab = element<HTMLButtonElement>(`tab-${id}`)
      this.dock.register({ id, title: tab.textContent!.replace(/0$/u, ''), tab, content: element(`panel-${id}`), actions: id === 'console' ? consoleActions : undefined, available: !['inspector', 'storage'].includes(id) })
    }
    this.syncPluginViews()
    for (const id of ['writer', 'extensions']) {
      const button = element(`activity-${id}`)
      button.onclick = () => this.dock.open(id)
      button.draggable = true
      button.dataset.dockView = id
    }
    element('workbench-views').onclick = () => this.dock.showViews()
    this.dock.start()
    // The hidden registry only receives freshly contributed plugin nodes.
    for (const selector of ['#content', '#panel-splitter', '.bottom-panel'])
      document.querySelector<HTMLElement>(selector)!.hidden = true
  }

  private syncPluginViews(): void {
    for (const id of this.pluginViews) this.dock.unregister(id)
    this.pluginViews = this.plugins.entries().map(panel => panel.key)
    for (const panel of this.plugins.entries())
      this.dock.register({ id: panel.key, title: panel.tab.textContent!, tab: panel.tab, content: panel.host })
    this.dock.refresh()
  }

  private visibilityChanged(visible: ReadonlySet<string>, active?: string): void {
    const previous = this.visible
    this.visible = visible
    if (active && !['source', 'preview', 'writer', 'extensions'].includes(active))
      this.panel = active
    this.plugins.show(visible)
    for (const [id, panel] of [
      ['assets', this.assets],
      ['inspector', this.inspector],
      ['storage', this.storage],
      ['performance', this.performance],
      ['scene-debugger', this.sceneDebugger],
    ] as const) {
      if (previous.has(id) !== visible.has(id))
        panel.setVisible(visible.has(id))
    }
    if (previous.has('terminal') !== visible.has('terminal')) {
      this.terminal?.setVisible(visible.has('terminal'))
      if (visible.has('terminal')) {
        void this.loadTerminal().then((terminal) => {
          if (this.dock.isVisible('terminal')) {
            terminal.setVisible(true)
            void terminal.open()
          }
        }).catch(this.error)
      }
    }
    if (previous.has('writer') !== visible.has('writer'))
      this.writer.show(visible.has('writer'))
    if (previous.has('extensions') !== visible.has('extensions'))
      this.marketplace.show(visible.has('extensions'))
    for (const id of ['writer', 'extensions']) {
      element(`activity-${id}`).setAttribute('aria-selected', String(visible.has(id)))
      element(`activity-${id}`).tabIndex = visible.has(id) ? 0 : -1
    }
    this.updateContextStatus()
  }

  get interacting(): boolean {
    return this.dock.interacting || Boolean(this.sidebar?.interacting)
  }

  private updateContextStatus(): void {
    this.messages.show([`sidebar:${this.sidebar.active}`, ...[...this.visible].flatMap(id => [`panel:${id}`, `workspace:${id}`])])
  }

  findFile(): void {
    this.quickOpen.show()
  }

  openTerminal(fresh = false): void {
    if (!fresh && this.dock.isVisible('terminal')) {
      this.dock.close('terminal')
      return
    }
    this.showPanel('terminal')
    if (fresh) {
      void this.loadTerminal()
        .then(terminal => terminal.open(true))
        .catch(this.error)
    }
  }

  private loadTerminal(): Promise<TerminalPanel> {
    this.terminalLoading ??= import('../features/terminal/controller')
      .then(async ({ TerminalPanel }) => {
        const project = this.project ?? await this.bridge.currentProject()
        this.terminal = new TerminalPanel(
          element('panel-terminal'),
          this.bridge,
          this.error,
        )
        this.terminal.setRoot(this.project?.root ?? project?.root ?? '')
        return this.terminal
      })
      .catch((error) => {
        this.terminalLoading = undefined
        throw error
      })
    return this.terminalLoading
  }

  private closeFileFilter(): void {
    element('file-filter').hidden = true
    element<HTMLInputElement>('file-search').value = ''
    this.tree.filter('')
    element('files').focus()
  }

  update(project: EditorProject): void {
    if (this.project?.root !== project.root) {
      this.activeDocument = ''
      this.activeSource = undefined
      element('file-filter').hidden = true
      element<HTMLInputElement>('file-search').value = ''
    }
    this.project = project
    this.dock.available('preview', !project.pluginProject)
    this.plugins.update(project)
    void this.updatePlugins(project)
    this.marketplace.update(project)
    this.terminal?.setRoot(project.root)
    this.outline.update(project)
    this.tree.update(project)
    this.search.update(project)
    this.assets.update(project)
    this.git.update(project)
    this.quickOpen.update(project)
    this.actions.update(project)
  }

  private async createPluginDocument(root: string, path: string, text: string) {
    if (this.project?.root !== root || text.length > 2 * 1024 * 1024)
      throw new Error('项目已切换或源文件过大。')
    // applyEdit opens the document itself; an Explorer deferred open would race it.
    if (!await this.mutate({ kind: 'create-file', destination: path }, false))
      throw new Error('未创建源文件。')
    if (this.project?.root !== root)
      throw new Error('项目已切换。')
    const document = await this.bridge.readDocument(path)
    if (this.project?.root !== root || document.text !== '')
      throw new Error('新文件已被外部修改。')
    await this.applyEdit({ root, path, revision: document.revision, start: 0, end: 0, expectedText: '', newText: text })
    return document
  }

  private async updatePlugins(project: EditorProject): Promise<void> {
    const key = JSON.stringify([project.root, project.devtools ?? []])
    if (key === this.pluginKey)
      return
    this.pluginKey = key
    const generation = ++this.pluginGeneration
    // Revoke old contributions immediately when a project or enabled version changes.
    this.plugins.dispose()
    const context = {
      openSource: (location: { path: string, line: number, column: number }) =>
        this.open(location.path, location.line, location.column),
      applyEdit: this.applyEdit,
      createScenePreview: () => this.animationScene.create(),
      createDocument: (root: string, path: string, text: string) => this.createPluginDocument(root, path, text),
      assetUrl: (root: string, path: string, thumbnail: boolean) =>
        this.bridge.assetUrl(root, path, thumbnail),
      reportError: this.error,
    }
    this.plugins = new PluginPanels(
      editorPlugins,
      element('panel-tabs'),
      document.querySelector('.bottom-panel')!,
      context,
      key => this.showPanel(key),
      (key, message) => this.messages.mount(`panel:${key}`, message),
    )
    this.syncPluginViews()
    this.plugins.update(project)
    this.plugins.documentOpened(this.activeSource, false)
    const installed = await Promise.all(
      (project.devtools ?? []).map(async (descriptor) => {
        try {
          return await loadEditorPlugin(descriptor)
        }
        catch (error) {
          if (generation === this.pluginGeneration)
            this.error(error)
          return undefined
        }
      }),
    )
    if (generation !== this.pluginGeneration)
      return
    this.plugins.dispose()
    this.plugins = new PluginPanels(
      [
        ...editorPlugins,
        ...installed.filter((plugin): plugin is NonNullable<typeof plugin> =>
          Boolean(plugin),
        ),
      ],
      element('panel-tabs'),
      document.querySelector('.bottom-panel')!,
      context,
      key => this.showPanel(key),
      (key, message) => this.messages.mount(`panel:${key}`, message),
    )
    this.syncPluginViews()
    this.plugins.update(this.project!)
    this.plugins.documentOpened(this.activeSource, false)
  }

  previewChanged(state: PreviewState): void {
    this.performance.setState(state)
    this.sceneDebugger.setState(state)
    this.inspector.setState(state)
    this.storage.setState(state)
    this.dock.available('inspector', Boolean(state.identity))
    this.dock.available('storage', Boolean(state.identity))
  }

  documentOpened(path: string, line = 1, column = 1): void {
    this.activeDocument = path
    this.activeSource = { path, line, column }
    this.plugins.documentOpened(this.activeSource)
    this.outline.setActive(path)
    element<HTMLInputElement>('file-search').value = ''
    this.tree.reveal(path)
    this.quickOpen.remember(path)
  }

  revealFile(path: string): void {
    this.showSidebar('explorer')
    element<HTMLInputElement>('file-search').value = ''
    this.tree.reveal(path)
  }

  documentMoved(path: string): void {
    this.activeDocument = path
    this.activeSource = { path, line: 1, column: 1 }
    this.plugins.documentOpened(this.activeSource)
    this.outline.setActive(path)
    this.tree.markActive(path)
    this.quickOpen.remember(path)
  }

  documentClosed(): void {
    this.activeSource = undefined
    this.plugins.documentOpened(undefined)
  }

  cancelGitDiff(): void {
    this.git.cancelDiff()
  }

  showSidebar(view: SidebarView): void {
    this.sidebar.show(view)
  }

  showPanel(view: PanelView): void {
    this.dock.open(view)
  }

  private togglePanel(): void {
    this.dock.toggleGroup(this.panel)
  }

  private bindTabKeys(
    id: string,
    views: string[],
    prefix: string,
    activate: (view: string) => void,
  ): void {
    element(id).addEventListener('keydown', (event) => {
      const visible = views.filter(
        view => !element(`${prefix}${view}`).hidden,
      )
      const current = visible.findIndex(
        view => element(`${prefix}${view}`) === document.activeElement,
      )
      if (current < 0)
        return
      const next
        = event.key === 'ArrowRight' || event.key === 'ArrowDown'
          ? (current + 1) % visible.length
          : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
            ? (current + visible.length - 1) % visible.length
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? visible.length - 1
                : -1
      if (next < 0)
        return
      event.preventDefault()
      activate(visible[next])
      element(`${prefix}${visible[next]}`).focus()
    })
  }
}
