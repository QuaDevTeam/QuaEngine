import type {
  EditorPlugin,
  EditorPluginContext,
  EditorPluginPanel,
  EditorProject,
  EditorSourceLocation,
} from '@quajs/editor-core'
import { element, html, nothing, render } from '@quajs/editor-controls'
import { validateEditorPlugins } from '@quajs/editor-core'

interface Panel {
  key: string
  tab: HTMLButtonElement
  host: HTMLElement
  mount: EditorPlugin['panels'][number]['mount']
  acceptsSource?: EditorPlugin['panels'][number]['acceptsSource']
  source?: EditorSourceLocation
  instance?: EditorPluginPanel
  loading?: Promise<void>
  failed: boolean
  mountToken?: object
  statusDisposers: (() => void)[]
}

/** Workbench-owned contribution slots; plugins never receive the full host bridge. */
export class PluginPanels {
  private readonly panels: Panel[] = []
  private project?: EditorProject
  private active: ReadonlySet<string> = new Set()
  private disposed = false
  private source?: EditorSourceLocation

  constructor(
    plugins: readonly EditorPlugin[],
    tabs: HTMLElement,
    content: HTMLElement,
    private readonly context: EditorPluginContext,
    private readonly select: (key: string) => void,
    private readonly mountStatus?: (key: string, element: HTMLElement) => () => void,
  ) {
    validateEditorPlugins(plugins)
    const keys = new Set<string>()
    for (const plugin of plugins) {
      validateEditorPlugins(
        plugin.panels.map(panel => ({ id: panel.id, apiVersion: 1 })),
      )
      for (const panel of plugin.panels) {
        const key = `plugin-${plugin.id}-${panel.id}`
        if (keys.has(key))
          throw new Error(`Duplicate editor panel: ${key}`)
        keys.add(key)
      }
    }
    for (const plugin of plugins) {
      for (const contribution of plugin.panels) {
        const key = `plugin-${plugin.id}-${contribution.id}`
        const tab = element<HTMLButtonElement>(html`<button></button>`)
        tab.id = `tab-${key}`
        tab.textContent = contribution.title
        tab.setAttribute('role', 'tab')
        tab.setAttribute('aria-controls', `panel-${key}`)
        tab.onclick = () => select(key)
        const host = element<HTMLElement>(html`<section></section>`)
        host.id = `panel-${key}`
        host.className = 'editor-plugin-panel'
        host.setAttribute('role', 'tabpanel')
        host.setAttribute('aria-labelledby', tab.id)
        host.hidden = true
        tabs.append(tab)
        content.append(host)
        this.panels.push({
          key,
          tab,
          host,
          mount: contribution.mount,
          acceptsSource: contribution.acceptsSource,
          failed: false,
          statusDisposers: [],
        })
      }
    }
  }

  entries(): ReadonlyArray<Pick<Panel, 'key' | 'tab' | 'host'>> {
    return this.panels
  }

  has(key: string): boolean {
    return this.panels.some(panel => panel.key === key)
  }

  update(project: EditorProject): void {
    if (this.project?.root !== project.root) {
      this.source = undefined
      for (const panel of this.panels) {
        this.release(panel)
        panel.source = undefined
        panel.failed = false
      }
    }
    this.project = project
    for (const panel of this.panels) {
      if (panel.instance)
        this.run(panel, () => panel.instance!.update(project))
    }
    this.routeSource(false)
    this.show(this.active)
  }

  documentOpened(source: EditorSourceLocation | undefined, reveal = true): void {
    this.source = source
    this.routeSource(reveal)
  }

  private routeSource(reveal: boolean): void {
    if (this.disposed)
      return
    let match: Panel | undefined
    if (this.project && this.source) {
      for (const panel of this.panels) {
        this.run(panel, () => {
          if (!match && panel.acceptsSource?.(this.project!, this.source!))
            match = panel
        })
      }
    }
    const newlyMatched = Boolean(match && !match.source)
    for (const panel of this.panels) {
      const source = panel === match ? this.source : undefined
      const changed = panel.source !== source
      panel.source = source
      if (panel.instance && (changed || reveal))
        this.run(panel, () => panel.instance!.revealSource?.(source))
    }
    if (match && (reveal || newlyMatched))
      this.select(match.key)
  }

  show(active: ReadonlySet<string>): void {
    const previous = this.active
    this.active = new Set(active)
    for (const panel of this.panels) {
      const visible = active.has(panel.key)
      panel.host.hidden = !visible
      panel.tab.setAttribute('aria-selected', String(visible))
      panel.tab.tabIndex = visible ? 0 : -1
      if (panel.instance && previous.has(panel.key) !== visible)
        this.run(panel, () => panel.instance!.setVisible(visible))
      if (
        visible
        && !panel.instance
        && !panel.loading
        && !panel.failed
        && !this.disposed
      ) {
        const project = this.project
        const token = {}
        panel.mountToken = token
        // A unique mount element prevents a late module from painting into a new project.
        const mount = element<HTMLDivElement>(html`<div></div>`)
        mount.className = 'editor-plugin-content'
        render(mount, panel.host)
        const loading = Promise.resolve()
          .then(() => panel.mount(mount, {
            ...this.context,
            mountStatus: this.mountStatus
              ? (element) => {
                  if (!this.disposed && panel.mountToken === token)
                    panel.statusDisposers.push(this.mountStatus!(panel.key, element))
                }
              : undefined,
          }))
          .then((instance) => {
            if (
              this.disposed
              || panel.loading !== loading
              || this.project?.root !== project?.root
            ) {
              instance.dispose()
              return
            }
            panel.instance = instance
            if (this.project)
              instance.update(this.project)
            instance.revealSource?.(panel.source)
            instance.setVisible(this.active.has(panel.key))
          })
          .catch((error) => {
            if (panel.loading === loading)
              this.fail(panel, error)
          })
          .finally(() => {
            if (panel.loading === loading)
              panel.loading = undefined
          })
        panel.loading = loading
      }
    }
  }

  dispose(): void {
    this.disposed = true
    for (const panel of this.panels) {
      this.release(panel)
      panel.host.remove()
      panel.tab.remove()
    }
  }

  private run(panel: Panel, action: () => void): void {
    try {
      action()
    }
    catch (error) {
      this.fail(panel, error)
    }
  }

  private fail(panel: Panel, error: unknown): void {
    this.release(panel)
    panel.failed = true
    render(html`<p role="alert">插件加载失败：${error instanceof Error ? error.message : String(error)}</p>`, panel.host)
    this.context.reportError(error)
  }

  private release(panel: Panel): void {
    panel.mountToken = undefined
    for (const dispose of panel.statusDisposers.splice(0))
      dispose()
    panel.loading = undefined
    const instance = panel.instance
    panel.instance = undefined
    try {
      instance?.dispose()
    }
    catch (error) {
      this.context.reportError(error)
    }
    render(nothing, panel.host)
  }
}
