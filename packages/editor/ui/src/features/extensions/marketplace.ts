import type {
  EditorBridge,
  EditorInstalledPlugin,
  EditorMarketplaceSnapshot,
  EditorPluginDetails,
  EditorPluginListing,
  EditorProject,
  EditorSourceEdit,
} from '@quajs/editor-core'
import { element, html, nothing, render, repeat } from '@quajs/editor-controls'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import { PluginPublisherView } from './publisher'
import './styles.scss'

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export class MarketplaceWorkspace {
  active = false
  private project?: EditorProject
  private snapshot?: EditorMarketplaceSnapshot
  private mode: 'installed' | 'catalog' | 'publish' = 'installed'
  private selected = ''
  private generation = 0
  private detailGeneration = 0
  private busy = false
  private timer?: ReturnType<typeof setTimeout>
  private readonly host = document.getElementById('plugin-marketplace')!
  private readonly button = document.getElementById('activity-extensions')!
  private readonly search = element<HTMLInputElement>(html`<input>`)
  private readonly list = element(html`<div class="market-list" aria-label="插件列表"></div>`)
  private readonly detail = element(html`<div class="market-detail"></div>`)
  private readonly subtitle = element(html`<p></p>`)
  private readonly issues = element(html`<div class="market-issues"></div>`)
  private readonly progress = element(html`<pre class="market-progress" role="status" hidden></pre>`)
  private readonly cancel = element<HTMLButtonElement>(html`<button type="button" hidden>取消安装</button>`)
  private readonly source = element<HTMLInputElement>(html`<input>`)
  private readonly registry = element<HTMLInputElement>(html`<input>`)
  private readonly publisher: PluginPublisherView
  private readonly modes: HTMLButtonElement[] = []

  constructor(
    private readonly bridge: EditorBridge,
    private readonly changed: (active: boolean) => void,
    applyEdit: (edit: EditorSourceEdit) => Promise<void>,
  ) {
    this.publisher = new PluginPublisherView(bridge, applyEdit)
    render(unsafeHTML(icon('extensions')), this.button)
    this.button.onclick = () => this.show(true)
    this.search.type = 'search'
    this.search.placeholder = '搜索插件或输入 npm 包名'
    this.search.setAttribute('aria-label', '搜索插件或输入 npm 包名')
    this.search.oninput = () => {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => void this.refresh(), 250)
    }
    this.registry.type = this.source.type = 'url'
    this.registry.placeholder = 'https://registry.quaengine.com'
    this.registry.setAttribute('aria-label', 'Plugin Registry 服务地址')
    this.source.placeholder = '使用官方目录，或填写 HTTPS JSON 地址'
    this.source.setAttribute('aria-label', '市场目录 JSON 地址')
    const configure = async (form: HTMLFormElement, task: () => Promise<unknown>) => {
      for (const button of form.querySelectorAll('button')) button.disabled = true
      try {
        await task()
        await this.refresh()
      }
      catch (error) {
        this.issues.textContent = message(error)
      }
      finally {
        for (const button of form.querySelectorAll('button')) button.disabled = false
      }
    }
    this.cancel.onclick = () => {
      this.cancel.disabled = true
      void (this.mode === 'publish' ? bridge.cancelPluginPublication() : bridge.cancelPluginInstall()).catch((error) => {
        this.issues.textContent = message(error)
      })
    }
    render(html`
      <header class="market-heading"><div><h1>插件</h1>${this.subtitle}</div><button type="button" class="market-refresh" @click=${() => void this.refresh()}>刷新</button></header>
      ${this.issues}
      <div class="market-body"><aside class="market-browser"><div class="market-tabs" role="tablist" aria-label="插件来源">
        ${([['installed', '项目内'], ['catalog', '插件市场'], ['publish', '发布']] as const).map(([mode, label]) => html`<button type="button" role="tab" aria-selected=${String(mode === this.mode)} @click=${() => {
          this.mode = mode
          this.selected = ''
          this.renderList()
          this.detail.hidden = mode === 'publish'
          this.publisher.host.hidden = mode !== 'publish'
          this.search.hidden = mode === 'publish'
          if (mode === 'publish') {
            void this.publisher.refresh()
          }
          else {
            this.emptyDetail()
            this.search.focus()
          }
        }}>${label}</button>`)}
      </div>${this.search}${this.list}</aside>${this.detail}${this.publisher.host}</div>
      ${this.progress}${this.cancel}
      <details class="market-source"><summary>目录源</summary>
        <form @submit=${(event: SubmitEvent) => {
          event.preventDefault()
          void configure(event.currentTarget as HTMLFormElement, () => bridge.setPluginRegistry(this.registry.value.trim()))
        }}>
          ${this.registry}<button type="submit">应用 Registry</button>
        </form><p>自定义 JSON 目录用于浏览；启用 Registry 时，安装仍需通过其审核。</p>
        <form @submit=${(event: SubmitEvent) => {
          event.preventDefault()
          void configure(event.currentTarget as HTMLFormElement, () => bridge.setPluginCatalog(this.source.value.trim()))
        }}>
          ${this.source}<button type="submit">应用</button><button type="button" @click=${(event: Event) => void configure((event.currentTarget as HTMLButtonElement).form!, () => bridge.setPluginCatalog(''))}>恢复官方目录</button>
        </form>
      </details>
    `, this.host)
    this.modes.push(...this.host.querySelectorAll<HTMLButtonElement>('.market-tabs button'))
    bridge.onPluginInstall((event) => {
      if (event.root !== this.project?.root)
        return
      this.progress.hidden = false
      this.progress.textContent = event.message
      this.progress.scrollTop = this.progress.scrollHeight
      this.cancel.hidden = event.phase !== 'installing'
      this.cancel.textContent
        = this.mode === 'publish' ? '取消操作' : '取消安装'
      this.cancel.disabled = false
    })
    this.emptyDetail()
  }

  update(project: EditorProject): void {
    const switched = this.project?.root !== project.root
    this.project = project
    this.publisher.update(project)
    this.subtitle.textContent = project.name
    if (switched) {
      this.generation++
      this.detailGeneration++
      this.snapshot = undefined
      this.selected = ''
      this.issues.textContent = ''
      render(nothing, this.list)
      this.progress.hidden = true
      this.emptyDetail()
    }
    if (this.active && !this.busy)
      void this.refresh()
  }

  show(active: boolean): void {
    if (this.active === active)
      return
    this.active = active
    this.host.hidden = !active
    this.button.setAttribute('aria-selected', String(active))
    this.button.tabIndex = active ? 0 : -1
    this.changed(active)
    if (active) {
      void this.refresh()
      this.search.focus()
    }
  }

  private async refresh(): Promise<void> {
    const root = this.project?.root
    if (!root) {
      render(nothing, this.list)
      return
    }
    if (this.mode === 'publish') {
      await this.publisher.refresh()
      return
    }
    const generation = ++this.generation
    try {
      const snapshot = await this.bridge.pluginMarketplace(root, this.search.value.trim())
      if (generation !== this.generation || this.project?.root !== root)
        return
      this.snapshot = snapshot
      if (document.activeElement !== this.registry)
        this.registry.value = snapshot.registryUrl
      if (document.activeElement !== this.source)
        this.source.value = snapshot.catalogUrl
      this.issues.textContent = snapshot.issues.join('\n')
      this.renderList()
      // Watched package changes can supersede an operation's refresh. Update
      // the selected detail from the same accepted snapshot as its list row.
      const selected = snapshot.installed.find(item => item.name === this.selected)
        ?? snapshot.catalog.find(item => item.name === this.selected)
      if (selected)
        await this.select(selected)
    }
    catch (error) {
      if (generation === this.generation)
        this.issues.textContent = message(error)
    }
  }

  private renderList(): void {
    this.modes.forEach((button, index) => button.setAttribute('aria-selected', String(index === (this.mode === 'installed' ? 0 : this.mode === 'catalog' ? 1 : 2))))
    if (this.mode === 'publish') {
      render(html`<p class="market-empty">认领发布权、检查 npm 包并查看上架状态。</p>`, this.list)
      return
    }
    const needle = this.search.value.trim().toLocaleLowerCase()
    const items: (EditorInstalledPlugin | EditorPluginListing)[] = this.mode === 'installed'
      ? this.snapshot?.installed.filter(item => `${item.name} ${item.metadata.title} ${item.description}`.toLocaleLowerCase().includes(needle)) ?? []
      : this.snapshot?.catalog ?? []
    render(html`${repeat(items, item => item.name, (item) => {
      const installed = 'metadata' in item ? item : this.snapshot?.installed.find(plugin => plugin.name === item.name)
      return html`<button type="button" class="market-item" data-package=${item.name} aria-pressed=${String(this.selected === item.name)} @click=${() => {
        this.selected = item.name
        this.renderList()
        void this.select(item)
      }}>
        <span class="market-mark">${unsafeHTML(icon(installed?.metadata.devtools ? 'extensions' : 'package'))}</span>
        <span class="market-item-info"><strong>${installed?.metadata.title ?? ('metadata' in item ? item.metadata.title : item.title)}</strong><small>${item.name}</small>
          <span class="market-description">${installed?.description || item.description}</span>${item.official || installed?.builtin ? html`<span class="market-official">✓ 官方</span>` : nothing}
        </span><span class="market-item-status">${installed?.builtin ? '内置' : installed?.metadata.devtools ? installed.enabled ? '已启用' : '未启用' : installed ? '已安装' : ''}</span>
      </button>`
    })}${!items.length && this.snapshot ? html`<p class="market-empty">${this.mode === 'installed' ? '未找到项目插件' : '输入完整 npm 包名以查找更多插件'}</p>` : nothing}`, this.list)
  }

  private emptyDetail(): void {
    this.detailGeneration++
    render(nothing, this.detail)
  }

  private async select(
    item: EditorInstalledPlugin | EditorPluginListing,
  ): Promise<void> {
    const generation = ++this.detailGeneration
    const root = this.project?.root
    if (!root)
      return
    const installed = this.snapshot?.installed.find(
      plugin => plugin.name === item.name,
    )
    render(nothing, this.detail)
    const content = element(html`<div></div>`)
    render(html`<header class="market-plugin-header"><div class="market-detail-mark">${unsafeHTML(icon('extensions'))}</div>
      <div><h2>${'metadata' in item ? item.metadata.title : item.title}</h2><code>${item.name}</code></div></header>
      <p class="market-detail-description">${item.description}</p>${content}`, this.detail)
    if (installed && (this.mode === 'installed' || installed.builtin)) {
      this.renderDetails(content, installed, installed)
      return
    }
    render('正在查询 npm…', content)
    try {
      const details = await this.bridge.pluginDetails(root, item.name)
      if (generation !== this.detailGeneration || this.project?.root !== root)
        return
      this.renderDetails(content, details, installed)
    }
    catch (error) {
      if (generation === this.detailGeneration)
        render(html`<p class="market-error">${message(error)}</p>`, content)
    }
  }

  private renderDetails(
    host: HTMLElement,
    item: EditorInstalledPlugin | EditorPluginDetails,
    installed?: EditorInstalledPlugin,
  ): void {
    render(html`<div class="market-badges"><span>v${item.version}</span>
      ${item.metadata.runtime ? html`<span>Runtime</span>` : nothing}${item.metadata.devtools ? html`<span>Devtools</span>` : nothing}
      ${item.official || item.builtin ? html`<span class="market-official">✓ 官方</span>` : nothing}${item.builtin ? html`<span>编辑器内置</span>` : nothing}
    </div>${item.error ? html`<p class="market-error">${item.error}</p>` : nothing}
    <div class="market-actions">
      ${'installable' in item && !installed?.builtin && installed?.version !== item.version
        ? html`
        <button type="button" class="primary" ?disabled=${!item.installable || this.busy} @click=${(event: Event) => void this.operate(event.currentTarget as HTMLButtonElement, () => this.bridge.installPlugin(this.project!.root, item.name, item.version), true)}>${installed ? `更新至 ${item.version}` : '安装到项目'}</button>`
        : nothing}
      ${installed?.metadata.devtools && !installed.builtin
        ? html`<button type="button" ?disabled=${Boolean(installed.error && !installed.enabled) || this.busy}
        @click=${(event: Event) => void this.operate(event.currentTarget as HTMLButtonElement, () => this.bridge.enablePlugin(this.project!.root, installed.name, !installed.enabled), false)}>${installed.enabled ? '停用 Devtools' : '启用 Devtools'}</button>`
        : nothing}
      ${installed ? html`<span class="market-installed">${installed.builtin ? '随编辑器提供' : `项目已安装 ${installed.version}`}</span>` : nothing}
    </div><div class="market-capabilities">
      ${item.metadata.runtime ? html`<h3>运行时</h3><p>作为项目依赖安装，在游戏入口中配置使用。</p>` : nothing}
      ${item.metadata.devtools ? html`<h3>编辑器扩展</h3><p>${item.builtin ? '提供角色浏览、差分预览和源码编辑。' : '安装后在当前项目启用，可贡献面板与项目索引。启用后会执行此包的编辑器代码。'}</p>` : nothing}
    </div>`, host)
  }

  private async operate(
    button: HTMLButtonElement,
    action: () => Promise<void>,
    installing: boolean,
  ): Promise<void> {
    if (this.busy)
      return
    this.busy = true
    button.disabled = true
    this.progress.hidden = false
    this.progress.textContent = installing ? '正在准备安装…' : '正在更新插件…'
    this.cancel.hidden = !installing
    this.cancel.disabled = false
    try {
      await action()
      this.progress.textContent = installing ? '安装完成' : '插件已更新'
    }
    catch (error) {
      this.progress.textContent = message(error)
    }
    finally {
      this.busy = false
      this.cancel.hidden = true
      await this.refresh()
      button.disabled = false
    }
  }
}
