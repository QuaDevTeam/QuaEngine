import type { EditorBridge, PreviewInspectorDetails, PreviewState } from '@quajs/editor-core'
import type { InspectorEntry, InspectorRow } from './tree'
import { element, nothing, styleMap } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import { VirtualList } from '../../shared/virtual-list'
import { flattenInspectorTree, indexInspectorTree, inspectorNodeLabel, renderInspectorLabel } from './tree'

export class PreviewInspector {
  private state: PreviewState = { phase: 'idle' }
  private visible = false
  private busy = false
  private generation = 0
  private detailsRequest = 0
  private detailsBusy = false
  private detailJob?: { request: number, session: string, nodeId: number, loading: HTMLElement }
  private timer?: ReturnType<typeof setTimeout>
  private entries = new Map<number, InspectorEntry>()
  private rows: InspectorRow[] = []
  private collapsed = new Set<number>()
  private selected?: number
  private signature = ''
  private truncated = false
  private detailTab: 'styles' | 'attributes' = 'styles'
  private readonly list: VirtualList<InspectorRow>
  private readonly tree: HTMLElement
  private readonly details: HTMLElement
  private readonly message: HTMLElement
  private readonly breadcrumb: HTMLElement
  private readonly filter: HTMLInputElement
  private readonly live: HTMLInputElement
  private readonly refreshButton: HTMLButtonElement

  constructor(host: HTMLElement, private readonly bridge: EditorBridge) {
    render(html`<div class="inspector-toolbar"><span class="inspector-heading">元素</span><input id="inspector-filter" type="search" placeholder="筛选元素、属性或文本" aria-label="筛选预览元素" spellcheck="false"><button id="inspector-refresh" class="icon-button" title="刷新元素树" aria-label="刷新元素树">${unsafeHTML(icon('refresh'))}</button><button id="inspector-collapse" class="icon-button" title="折叠全部元素" aria-label="折叠全部元素">${unsafeHTML(icon('collapse'))}</button><label><input id="inspector-live" type="checkbox" checked>实时</label><span id="inspector-status" role="status"></span></div><div class="inspector-content"><div class="inspector-tree-pane"><div id="inspector-tree" role="tree" aria-label="预览元素层级" tabindex="0"></div><p id="inspector-empty" hidden></p><nav id="inspector-breadcrumb" aria-label="所选元素路径"></nav></div><div class="inspector-properties"><div class="inspector-detail-tabs" role="tablist" aria-label="元素属性"><button id="inspector-styles-tab" role="tab" aria-selected="true" aria-controls="inspector-details">计算样式</button><button id="inspector-attributes-tab" role="tab" aria-selected="false" aria-controls="inspector-details" tabindex="-1">属性</button></div><div id="inspector-details" role="tabpanel" aria-labelledby="inspector-styles-tab"></div></div></div>`, host)
    this.tree = host.querySelector('#inspector-tree')!
    this.details = host.querySelector('#inspector-details')!
    this.message = host.querySelector('#inspector-status')!
    this.breadcrumb = host.querySelector('#inspector-breadcrumb')!
    this.filter = host.querySelector('#inspector-filter')!
    this.live = host.querySelector('#inspector-live')!
    this.refreshButton = host.querySelector('#inspector-refresh')!
    this.list = new VirtualList(this.tree, 20, row => this.renderRow(row))
    this.tree.onkeydown = event => this.keydown(event)
    this.filter.oninput = () => {
      if (!this.filter.value)
        this.revealAncestors()
      this.render(true)
    }
    this.filter.onkeydown = (event) => {
      if (event.key === 'Escape') {
        this.filter.value = ''
        this.revealAncestors()
        this.render(true)
        this.tree.focus()
      }
      else if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.tree.focus()
      }
    }
    this.refreshButton.onclick = () => void this.refresh(true)
    host.querySelector<HTMLButtonElement>('#inspector-collapse')!.onclick = () => {
      this.filter.value = ''
      this.collapsed = new Set([...this.entries.values()].filter(entry => entry.children.length).map(entry => entry.node.nodeId))
      // Keep the document shell open so its top-level elements remain discoverable.
      const root = this.entries.values().next().value
      if (root)
        this.collapsed.delete(root.node.nodeId)
      this.render(true)
      if (root)
        this.select(root, true)
    }
    this.live.onchange = () => this.schedule()
    document.addEventListener('visibilitychange', () => this.schedule())
    for (const tab of ['styles', 'attributes'] as const) {
      const button = host.querySelector<HTMLButtonElement>(`#inspector-${tab}-tab`)!
      button.onclick = () => this.setDetailTab(tab)
      button.onkeydown = (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
          return
        event.preventDefault()
        const next = tab === 'styles' ? 'attributes' : 'styles'
        this.setDetailTab(next)
        host.querySelector<HTMLButtonElement>(`#inspector-${next}-tab`)!.focus()
      }
    }
    this.clearSelection()
    this.render()
  }

  setState(state: PreviewState): void {
    if (state.identity?.sessionId !== this.state.identity?.sessionId)
      this.filter.value = ''
    const reset = state.identity?.sessionId !== this.state.identity?.sessionId || (state.reloading && !this.state.reloading) || state.phase === 'idle'
    if (reset) {
      ++this.generation
      this.entries.clear()
      this.signature = ''
      this.truncated = false
      this.collapsed.clear()
      this.clearSelection()
    }
    this.state = state
    this.updateStatus()
    if (reset)
      this.render()
    void this.refresh()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    this.schedule()
    if (visible)
      void this.refresh()
  }

  private schedule(): void {
    clearTimeout(this.timer)
    if (this.visible && !document.hidden && this.live.checked && this.state.phase === 'running')
      this.timer = setTimeout(() => void this.refresh(), 1200)
  }

  private async refresh(forceDetails = false): Promise<void> {
    if (!this.visible || document.hidden || this.busy || this.state.phase !== 'running' || this.state.reloading || this.state.renderError || !this.state.identity) {
      this.schedule()
      return
    }
    this.busy = true
    this.refreshButton.disabled = true
    const generation = this.generation
    try {
      const result = await this.bridge.inspectPreview(this.state.identity.sessionId)
      if (generation !== this.generation)
        return
      const signature = JSON.stringify(result.root)
      this.truncated = result.truncated
      if (signature !== this.signature) {
        this.signature = signature
        const next = indexInspectorTree(result.root)
        for (const entry of next.values()) {
          if (!this.entries.has(entry.node.nodeId) && entry.children.length && (entry.depth >= 4 || entry.node.name === 'head'))
            this.collapsed.add(entry.node.nodeId)
        }
        this.entries = next
        this.collapsed = new Set([...this.collapsed].filter(id => next.has(id)))
        if (this.selected !== undefined && !next.has(this.selected))
          this.clearSelection()
        this.render()
        this.showBreadcrumb()
        this.showDetails()
      }
      else if (forceDetails) {
        this.showDetails()
      }
      this.updateStatus()
    }
    catch (error) {
      if (generation === this.generation)
        this.message.textContent = String(error).replace(/^Error: /u, '')
    }
    finally {
      this.busy = false
      this.refreshButton.disabled = false
      this.schedule()
    }
  }

  private updateStatus(): void {
    this.message.textContent = this.state.phase !== 'running' ? '' : this.state.reloading ? '正在更新…' : this.state.renderError ? '预览渲染失败' : `${this.state.identity?.target === 'native' ? 'Native QUI' : 'Web DOM'}${this.truncated ? '，已达到节点上限' : ''}`
  }

  private render(reset = false): void {
    this.rows = flattenInspectorTree(this.entries, this.collapsed, this.filter.value)
    this.list.set(this.rows, reset, this.selectedIndex())
    this.updateSelection()
    const empty = document.getElementById('inspector-empty')!
    empty.textContent = this.filter.value ? '没有匹配的元素' : this.state.reloading ? '正在更新…' : ''
    empty.hidden = this.rows.length > 0 || !empty.textContent
  }

  private selectedIndex(): number {
    return this.rows.findIndex(row => !row.closing && row.entry.node.nodeId === this.selected)
  }

  private revealAncestors(): void {
    let parent = this.selected === undefined ? undefined : this.entries.get(this.selected)?.parent
    while (parent !== undefined) {
      this.collapsed.delete(parent)
      parent = this.entries.get(parent)?.parent
    }
  }

  private renderRow(row: InspectorRow): HTMLElement {
    const { entry, closing, expanded, position, siblings } = row
    const { node } = entry
    return element(html`<button type="button" class=${`inspector-row${closing ? ' inspector-closing' : ''}${node.nodeId === this.selected ? ' selected' : ''}`}
      id=${`inspector-${closing ? 'close' : 'node'}-${node.nodeId}`} data-node-id=${node.nodeId} style=${styleMap({ '--inspector-depth': String(entry.depth) })} tabindex="-1"
      title=${closing ? `</${node.name}>` : inspectorNodeLabel(node)} role=${closing ? 'presentation' : 'treeitem'} aria-hidden=${closing ? 'true' : nothing}
      aria-level=${closing ? nothing : entry.depth + 1} aria-posinset=${closing ? nothing : position} aria-setsize=${closing ? nothing : siblings}
      aria-selected=${closing ? nothing : String(node.nodeId === this.selected)} aria-expanded=${!closing && entry.children.length ? String(expanded) : nothing}
      @click=${() => {
        this.select(entry)
        this.tree.focus()
      }} @dblclick=${() => this.toggle(entry)}>
      <span class=${`inspector-chevron${expanded ? ' expanded' : ''}`} @mousedown=${(event: MouseEvent) => event.preventDefault()}
        @click=${(event: MouseEvent) => {
          if (closing || !entry.children.length)
            return
          event.stopPropagation()
          this.toggle(entry, event.altKey)
          this.tree.focus()
        }}>${!closing && entry.children.length ? html`<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M3 1 8 5 3 9Z"/></svg>` : nothing}</span>
      ${renderInspectorLabel(row, this.state.identity?.target === 'web')}
    </button>`)
  }

  private updateSelection(): void {
    const index = this.selectedIndex()
    this.list.pin(index)
    for (const element of this.tree.querySelectorAll<HTMLElement>('.inspector-row')) {
      const selected = Number(element.dataset.nodeId) === this.selected
      element.classList.toggle('selected', selected)
      if (element.getAttribute('role') === 'treeitem')
        element.setAttribute('aria-selected', String(selected))
    }
    if (index >= 0)
      this.tree.setAttribute('aria-activedescendant', `inspector-node-${this.selected}`)
    else this.tree.removeAttribute('aria-activedescendant')
  }

  private toggle(entry: InspectorEntry, recursive = false): void {
    if (!entry.children.length)
      return
    const collapsing = !this.collapsed.has(entry.node.nodeId)
    const visit = (entry: InspectorEntry): void => {
      if (collapsing)
        this.collapsed.add(entry.node.nodeId)
      else this.collapsed.delete(entry.node.nodeId)
      if (recursive)
        entry.children.forEach(id => visit(this.entries.get(id)!))
    }
    visit(entry)
    // A collapsed branch must not leave keyboard focus on an invisible descendant.
    if (collapsing) {
      let current = this.selected === undefined ? undefined : this.entries.get(this.selected)
      while (current?.parent !== undefined) {
        if (current.parent === entry.node.nodeId) {
          this.select(entry)
          break
        }
        current = this.entries.get(current.parent)
      }
    }
    this.render()
  }

  private select(entry: InspectorEntry, reveal = false): void {
    this.selected = entry.node.nodeId
    this.updateSelection()
    if (reveal)
      this.list.reveal(this.selectedIndex())
    this.showBreadcrumb()
    this.showDetails()
  }

  private keydown(event: KeyboardEvent): void {
    const rows = this.rows.filter(row => !row.closing)
    if (!rows.length)
      return
    let index = Math.max(0, rows.findIndex(row => row.entry.node.nodeId === this.selected))
    const row = rows[index]
    if (event.key === 'ArrowDown') {
      index++
    }
    else if (event.key === 'ArrowUp') {
      index--
    }
    else if (event.key === 'Home') {
      index = 0
    }
    else if (event.key === 'End') {
      index = rows.length - 1
    }
    else if (event.key === 'ArrowRight') {
      if (event.altKey && row.entry.children.length) {
        this.collapsed.add(row.entry.node.nodeId)
        this.toggle(row.entry, true)
      }
      else if (row.entry.children.length && !row.expanded) {
        this.toggle(row.entry, event.altKey)
      }
      else if (row.expanded) {
        index++
      }
    }
    else if (event.key === 'ArrowLeft') {
      if (event.altKey && row.entry.children.length && !this.filter.value) {
        this.collapsed.delete(row.entry.node.nodeId)
        this.toggle(row.entry, true)
      }
      else if (row.expanded && !this.filter.value) {
        this.toggle(row.entry, event.altKey)
      }
      else if (row.entry.parent !== undefined) {
        index = rows.findIndex(item => item.entry.node.nodeId === row.entry.parent)
      }
    }
    else if (event.key === ' ' || event.key === 'Enter') {
      if (event.key === ' ')
        this.toggle(row.entry, event.altKey)
    }
    else {
      return
    }
    event.preventDefault()
    this.select(rows[Math.max(0, Math.min(index, rows.length - 1))].entry, true)
  }

  private clearSelection(): void {
    this.selected = undefined
    ++this.detailsRequest
    this.detailJob = undefined
    this.tree.removeAttribute('aria-activedescendant')
    render(nothing, this.details)
    render(nothing, this.breadcrumb)
  }

  private showBreadcrumb(): void {
    render(nothing, this.breadcrumb)
    let current = this.selected === undefined ? undefined : this.entries.get(this.selected)
    const path: InspectorEntry[] = []
    while (current) {
      path.unshift(current)
      current = current.parent === undefined ? undefined : this.entries.get(current.parent)
    }
    render(html`${path.map(entry => html`<button type="button" title=${inspectorNodeLabel(entry.node)} aria-current=${String(entry.node.nodeId === this.selected)} @click=${() => {
      this.filter.value = ''
      let parent = entry.parent
      while (parent !== undefined) {
        this.collapsed.delete(parent)
        parent = this.entries.get(parent)?.parent
      }
      this.render()
      this.select(entry, true)
      this.tree.focus()
    }}>${inspectorNodeLabel(entry.node)}</button>`)}`, this.breadcrumb)
    this.breadcrumb.lastElementChild?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  private setDetailTab(tab: 'styles' | 'attributes'): void {
    this.detailTab = tab
    for (const name of ['styles', 'attributes']) {
      const button = document.getElementById(`inspector-${name}-tab`)!
      button.setAttribute('aria-selected', String(name === tab))
      button.tabIndex = name === tab ? 0 : -1
    }
    this.details.setAttribute('aria-labelledby', `inspector-${tab}-tab`)
    this.showDetails()
  }

  private showDetails(): void {
    const entry = this.selected === undefined ? undefined : this.entries.get(this.selected)
    if (!entry)
      return
    const { node } = entry
    const request = ++this.detailsRequest
    this.detailJob = undefined
    const title = html`<div class="inspector-detail-title">${inspectorNodeLabel(node)}</div>`
    if (this.detailTab === 'attributes') {
      render(html`${title}${this.properties(Object.entries(node.attributes).map(([name, value]) => ({ name, value })))}
        ${entry.inlineText || node.value ? html`<pre class="inspector-node-value">${entry.inlineText || node.value}</pre>` : nothing}`, this.details)
      return
    }
    if (node.nodeType !== 1) {
      render(html`${title}<p>${node.nodeType === 3 ? node.value : '此节点没有计算样式，请选择元素节点。'}</p>`, this.details)
      return
    }
    const session = this.state.identity?.sessionId
    if (!session) {
      render(title, this.details)
      return
    }
    const loading = element(html`<div></div>`)
    render('正在读取…', loading)
    render(html`${title}${loading}`, this.details)
    this.detailJob = { request, session, nodeId: node.nodeId, loading }
    void this.loadDetails()
  }

  private async loadDetails(): Promise<void> {
    if (this.detailsBusy || !this.detailJob)
      return
    const { request, session, nodeId, loading } = this.detailJob
    this.detailJob = undefined
    this.detailsBusy = true
    try {
      const result = await this.bridge.inspectPreviewNode(session, nodeId)
      if (request !== this.detailsRequest || session !== this.state.identity?.sessionId)
        return
      render(html`${result.box ? html`<div class="inspector-box">${result.box.width.toFixed(1)} × ${result.box.height.toFixed(1)} px<span>位置 ${result.box.x.toFixed(1)}, ${result.box.y.toFixed(1)}</span></div>` : nothing}${this.properties(result.styles)}`, loading)
    }
    catch (error) {
      if (request === this.detailsRequest && session === this.state.identity?.sessionId)
        render(String(error).replace(/^Error: /u, ''), loading)
    }
    finally {
      this.detailsBusy = false
      if (this.detailJob)
        void this.loadDetails()
    }
  }

  private properties(properties: PreviewInspectorDetails['styles']) {
    return html`<dl class="inspector-property-list">${properties.length
      ? properties.map(({ name, value }) => html`<dt>${name}</dt><dd>${value}</dd>`)
      : this.detailTab === 'styles' ? '没有可用的计算样式' : '无属性'}</dl>`
  }
}
