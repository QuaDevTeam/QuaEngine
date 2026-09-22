import type {
  EditorBridge,
  PreviewState,
  PreviewStorageRequest,
  PreviewStorageResult,
  PreviewStorageSource,
} from '@quajs/editor-core'
import { html, nothing, render } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon, setIconButton } from '../../shared/icons'
import { jsonTree } from '../console/json'
import './styles.scss'

export class PreviewStorage {
  private state?: PreviewState
  private visible = false
  private generation = 0
  private pending = false
  private queued?: PreviewStorageRequest
  private warning = ''
  private sources: PreviewStorageSource[] = []
  private source?: PreviewStorageSource
  private offset = 0
  private filterTimer?: ReturnType<typeof setTimeout>
  private detail?: NonNullable<PreviewStorageResult['detail']>
  private readonly sidebar: HTMLElement
  private readonly table: HTMLTableElement
  private readonly contents: HTMLElement
  private readonly message: HTMLElement
  private readonly filter: HTMLInputElement
  private readonly previous: HTMLButtonElement
  private readonly next: HTMLButtonElement

  constructor(
    private readonly host: HTMLElement,
    private readonly bridge: EditorBridge,
  ) {
    render(html`<div class="storage-toolbar" role="toolbar" aria-label="存储操作">
      <span id="storage-target">存储</span><button id="storage-refresh" class="icon-button"></button>
      <label class="storage-search">${unsafeHTML(icon('search'))}<input id="storage-filter" placeholder="筛选 Key / 路径" aria-label="筛选存储记录" spellcheck="false" autocomplete="off"></label>
      <span id="storage-resident-legend" title="绿色背景：资源字节驻留内存" hidden><i></i>内存</span>
      <span id="storage-status" role="status" hidden></span>
      <span id="storage-page"></span><button id="storage-previous" class="icon-button"></button><button id="storage-next" class="icon-button"></button>
    </div><div class="storage-layout"><nav id="storage-sources" aria-label="预览存储位置"></nav><div class="storage-records"><div class="storage-table-scroll"><table id="storage-table" aria-label="存储记录"></table></div></div><section class="storage-value"><div class="storage-detail-toolbar" role="toolbar" aria-label="记录内容操作"><span id="storage-detail-label">内容</span><div class="storage-view-toggle"><button id="storage-tree" class="icon-button" aria-pressed="true"></button><button id="storage-raw" class="icon-button" aria-pressed="false"></button></div><button id="storage-copy" class="icon-button"></button></div><div id="storage-detail"></div></section></div>`, host)
    const element = <T extends HTMLElement>(id: string) =>
      host.querySelector<T>(`#${id}`)!
    this.sidebar = element('storage-sources')
    this.table = element('storage-table')
    this.contents = element('storage-detail')
    this.message = element('storage-status')
    this.filter = element('storage-filter')
    this.previous = element('storage-previous')
    this.next = element('storage-next')
    setIconButton(element('storage-refresh'), 'refresh', '刷新存储')
    setIconButton(this.previous, 'chevron', '上一页')
    setIconButton(this.next, 'chevron', '下一页')
    setIconButton(element('storage-tree'), 'tree', '结构视图')
    setIconButton(element('storage-raw'), 'code', '原文视图')
    setIconButton(element('storage-copy'), 'copy', '复制内容')
    element('storage-refresh').onclick = () => this.load({ action: 'catalog' })
    this.previous.onclick = () => {
      this.offset = Math.max(0, this.offset - 50)
      this.page()
    }
    this.next.onclick = () => {
      this.offset += 50
      this.page()
    }
    this.filter.oninput = () => {
      clearTimeout(this.filterTimer)
      this.filterTimer = setTimeout(() => {
        this.offset = 0
        this.page()
      }, 250)
    }
    this.filter.maxLength = 256
    element('storage-tree').onclick = () => this.renderDetail(true)
    element('storage-raw').onclick = () => this.renderDetail(false)
    element('storage-copy').onclick = () => {
      if (this.detail) {
        void navigator.clipboard
          .writeText(this.detail.text)
          .then(() => setIconButton(element('storage-copy'), 'check', '已复制'))
          .catch(error => this.setMessage(String(error)))
      }
    }
    this.previous.disabled = this.next.disabled = true
    this.clearDetail()
  }

  setState(state: PreviewState): void {
    const changed
      = state.identity?.sessionId !== this.state?.identity?.sessionId
        || state.phase !== this.state?.phase
        || Boolean(state.reloading) !== Boolean(this.state?.reloading)
    this.state = state
    this.host.dataset.target = state.identity?.target ?? ''
    this.host.querySelector('#storage-target')!.textContent
      = state.identity?.target === 'native'
        ? 'Native / QPK'
        : 'Web'
    if (!changed)
      return
    ++this.generation
    this.queued = undefined
    this.warning = ''
    this.sources = []
    this.source = undefined
    render(nothing, this.sidebar)
    render(nothing, this.table)
    this.clearDetail()
    this.offset = 0
    this.filter.value = ''
    this.previous.disabled = this.next.disabled = true
    this.host.querySelector('#storage-page')!.textContent = ''
    this.host.querySelector<HTMLElement>('#storage-resident-legend')!.hidden = true
    this.setMessage(state.reloading ? '预览刷新中…' : '')
    if (this.available && this.visible)
      this.load({ action: 'catalog' })
  }

  setVisible(visible: boolean): void {
    if (visible === this.visible)
      return
    this.visible = visible
    ++this.generation
    this.queued = undefined
    clearTimeout(this.filterTimer)
    if (visible && this.available)
      this.load({ action: 'catalog' })
  }

  private get available(): boolean {
    return this.state?.phase === 'running' && !this.state.reloading
  }

  private clearDetail(): void {
    this.detail = undefined
    render(nothing, this.contents)
    this.host.querySelector('#storage-detail-label')!.textContent = '内容'
    for (const id of ['storage-tree', 'storage-raw', 'storage-copy'])
      this.host.querySelector<HTMLButtonElement>(`#${id}`)!.disabled = true
    setIconButton(this.host.querySelector<HTMLButtonElement>('#storage-copy')!, 'copy', '复制内容')
  }

  private setMessage(text: string): void {
    this.message.textContent = text
    this.message.title = text
    this.message.hidden = !text
  }

  private page(): void {
    if (this.source) {
      this.load({
        action: 'page',
        source: this.source.id,
        offset: this.offset,
        filter: this.filter.value,
      })
    }
  }

  private load(request: PreviewStorageRequest): void {
    if (!this.visible || !this.available)
      return
    // One IPC request at a time. Coalesce rapid source/filter/detail selections.
    this.queued = request
    ++this.generation
    if (!this.pending)
      void this.drain()
  }

  private async drain(): Promise<void> {
    const request = this.queued
    const session = this.state?.identity?.sessionId
    if (!request || !session || !this.visible || !this.available)
      return
    this.queued = undefined
    this.pending = true
    const generation = this.generation
    if (request.action === 'catalog')
      this.warning = ''
    this.setMessage(this.warning)
    this.host.setAttribute('aria-busy', 'true')
    try {
      const result = await this.bridge.previewStorage(session, request)
      if (generation !== this.generation)
        return
      if (request.action === 'catalog') {
        this.sources = result.sources ?? []
        this.source
          = this.sources.find(source => source.id === this.source?.id)
            ?? this.sources[0]
        this.renderSources()
        this.page()
      }
      else if (request.action === 'page') {
        this.renderRows(result)
      }
      else {
        this.detail = result.detail
        this.renderDetail(true)
      }
      this.warning = result.warning ?? this.warning
      this.setMessage(this.warning)
    }
    catch (error) {
      if (generation === this.generation) {
        this.setMessage(`${String(error).replace(/^Error: /, '')}。点击刷新重试。`)
        if (request.action === 'detail')
          this.clearDetail()
      }
    }
    finally {
      this.pending = false
      this.host.setAttribute('aria-busy', 'false')
      if (this.queued)
        void this.drain()
    }
  }

  private renderSources(): void {
    const groups = new Map<string, PreviewStorageSource[]>()
    for (const source of this.sources) {
      const group = groups.get(source.group) ?? []
      group.push(source)
      groups.set(source.group, group)
    }
    render(html`${[...groups].map(([name, sources]) => html`<section><h4>${name}</h4>
      ${repeat(sources, source => source.id, source => html`<button type="button" title=${source.description} data-source=${source.id}
        class=${source.id === this.source?.id ? 'active' : ''} aria-pressed=${String(source.id === this.source?.id)} @click=${() => {
          this.source = source
          this.offset = 0
          this.filter.value = ''
          render(nothing, this.table)
          this.clearDetail()
          this.renderSources()
          this.page()
        }}>${source.label}</button>`)}
    </section>`)}`, this.sidebar)
    this.table.title = this.source?.description ?? ''
    if (!this.sources.length)
      this.setMessage('没有可用的存储')
  }

  private renderRows(result: PreviewStorageResult): void {
    this.clearDetail()
    render(nothing, this.table)
    this.host.querySelector<HTMLElement>('#storage-resident-legend')!.hidden
      = !result.rows?.some(row => row.resident === true)
    render(html`<thead><tr>${(result.columns ?? []).map(name => html`<th>${name}</th>`)}</tr></thead>
      <tbody>${repeat(result.rows ?? [], row => row.key, row => html`<tr data-key=${row.key} data-resident=${row.resident === true ? 'true' : nothing} title=${row.resident === true ? '内存驻留' : nothing}>
        ${row.cells.map((value, index) => html`<td title=${value}>${index === 0
          ? html`<button type="button" aria-label=${row.resident === true ? `${value}（内存驻留）` : nothing} @click=${(event: Event) => {
            this.table.querySelector('.selected')?.classList.remove('selected')
            ;
            (event.currentTarget as HTMLElement).closest('tr')!.classList.add('selected')
            this.clearDetail()
            this.load({ action: 'detail', source: this.source!.id, key: row.key })
          }}>${value}</button>`
          : value}</td>`)}
      </tr>`)}</tbody>`, this.table)
    this.previous.disabled = this.offset === 0
    this.next.disabled = !result.hasMore
    this.host.querySelector('#storage-page')!.textContent
      = `${this.offset / 50 + 1}${result.hasMore ? ' / …' : ''}`
    this.host.querySelector('#storage-page')!.setAttribute('aria-label', `第 ${this.offset / 50 + 1} 页`)
    if (!result.rows?.length)
      render('当前存储为空，或没有匹配记录。', this.contents)
  }

  private renderDetail(tree: boolean): void {
    if (!this.detail)
      return
    render(nothing, this.contents)
    this.host.querySelector<HTMLButtonElement>('#storage-copy')!.disabled = false
    this.host.querySelector<HTMLButtonElement>('#storage-raw')!.disabled = false
    let parsed: unknown
    let structured = false
    try {
      parsed = JSON.parse(this.detail.text)
      structured = true
    }
    catch { /* Plain text and hex have only a raw view. */ }
    tree &&= structured
    this.host.querySelector<HTMLButtonElement>('#storage-tree')!.disabled = !structured
    this.host.querySelector('#storage-tree')!.setAttribute('aria-pressed', String(tree))
    this.host.querySelector('#storage-raw')!.setAttribute('aria-pressed', String(!tree))
    this.host.querySelector('#storage-detail-label')!.textContent
      = `${this.detail.bytes === undefined ? '内容' : `${this.detail.bytes} 字节`}${this.detail.truncated ? '（已截断）' : ''}`
    if (tree) {
      const node = jsonTree(parsed)
      if (node instanceof HTMLDetailsElement)
        node.open = true
      render(node, this.contents)
      return
    }
    render(html`<pre>${this.detail.text}</pre>`, this.contents)
  }
}
