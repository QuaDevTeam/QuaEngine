import type { EditorBridge, EditorFileEntry, EditorProject } from '@quajs/editor-core'
import { button, element, nothing, styleMap } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { workbenchEmpty } from '../../shared/empty-state'
import { icon } from '../../shared/icons'
import { VirtualList } from '../../shared/virtual-list'
import { fuzzyScore } from '../explorer/model'
import { FileTree } from '../explorer/tree'

const labels = { document: '文档', image: '图片', audio: '音频', video: '视频', font: '字体', package: '资源包', other: '其他' }
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
function sizeLabel(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export class AssetsBrowser {
  private project?: EditorProject
  private directory = ''
  private selected = ''
  private selectedVersion = 0
  private visible = false
  private generation = 0
  private mode: 'grid' | 'list' = 'grid'
  private columns = 1
  private filtered: EditorFileEntry[] = []
  private readonly list: VirtualList<EditorFileEntry[]>
  private readonly folders: FileTree
  private readonly viewport: HTMLElement
  private readonly details: HTMLElement
  private readonly thumbnails: Array<{ image: HTMLImageElement, entry: EditorFileEntry, root: string }> = []
  private readonly emptyAction = button('打开项目', () => document.getElementById(this.project ? 'asset-import' : 'welcome-open')?.click())
  private readonly empty = workbenchEmpty('image', '尚无项目资源', '打开项目后，在这里浏览图片、音频和其他资源。', [this.emptyAction])
  private loading = 0

  constructor(private readonly host: HTMLElement, private readonly bridge: EditorBridge, private readonly error: (error: unknown) => void, private readonly status: (text: string) => void, private readonly reveal: (path: string) => void, private readonly assetStatus: (text: string, title?: string) => void) {
    render(html`<div class="assets-toolbar"><button id="asset-root" title="浏览整个项目">全部资源</button><span id="asset-path">/</span><input id="asset-search" aria-label="查找资源" placeholder="按名称或路径查找资源"><select id="asset-type" aria-label="资源类型"><option value="">所有类型</option>${Object.entries(labels).filter(([kind]) => kind !== 'document').map(([kind, label]) => html`<option value=${kind}>${label}</option>`)}</select><select id="asset-sort" aria-label="资源排序"><option value="name">名称</option><option value="modified">最近修改</option><option value="size">文件大小</option></select><label class="recursive-label"><input type="checkbox" id="asset-recursive" checked>子文件夹</label><button id="asset-grid" class="icon-button" title="缩略图视图" aria-label="缩略图视图" aria-pressed="true">${unsafeHTML(icon('grid'))}</button><button id="asset-list" class="icon-button" title="列表视图" aria-label="列表视图" aria-pressed="false">${unsafeHTML(icon('list'))}</button><button id="asset-import" disabled>${unsafeHTML(icon('import'))} 导入</button></div><div class="assets-content"><div id="asset-folders"></div><div class="asset-center"><div id="asset-items" role="listbox" aria-label="项目资源" tabindex="0"></div><div id="asset-empty" class="empty-message" hidden></div><div id="asset-count" role="status">0 个资源</div></div><aside id="asset-details" aria-label="资源详情"></aside></div>`, host)
    this.empty.element.id = 'asset-empty'
    host.querySelector('#asset-empty')!.replaceWith(this.empty.element)
    this.viewport = host.querySelector('#asset-items')!
    this.details = host.querySelector('#asset-details')!
    this.folders = new FileTree(host.querySelector('#asset-folders')!, () => {}, (path) => {
      this.directory = path
      this.refresh(true)
    }, true)
    this.list = new VirtualList(this.viewport, 112, entries => this.renderRow(entries))
    new ResizeObserver(() => {
      const columns = this.mode === 'grid' ? Math.max(1, Math.floor(this.viewport.clientWidth / 112)) : 1
      if (columns !== this.columns) {
        this.columns = columns
        this.renderList()
      }
    }).observe(this.viewport)
    host.querySelector('#asset-search')!.addEventListener('input', () => this.refresh(true))
    for (const id of ['asset-type', 'asset-sort', 'asset-recursive']) host.querySelector(`#${id}`)!.addEventListener('change', () => this.refresh(true))
    host.querySelector<HTMLButtonElement>('#asset-root')!.onclick = () => {
      this.directory = ''
      this.refresh(true)
    }
    for (const mode of ['grid', 'list'] as const) {
      host.querySelector<HTMLButtonElement>(`#asset-${mode}`)!.onclick = () => {
        this.mode = mode
        this.list.setHeight(mode === 'grid' ? 112 : 30)
        this.columns = mode === 'grid' ? Math.max(1, Math.floor(this.viewport.clientWidth / 112)) : 1
        for (const name of ['grid', 'list']) host.querySelector(`#asset-${name}`)!.setAttribute('aria-pressed', String(mode === name))
        this.renderList(true)
      }
    }
    host.querySelector<HTMLButtonElement>('#asset-import')!.onclick = () => void this.import()
    this.viewport.addEventListener('keydown', (event) => {
      let index = Math.max(0, this.filtered.findIndex(entry => entry.path === this.selected))
      if (event.key === 'ArrowRight') {
        index++
      }
      else if (event.key === 'ArrowLeft') {
        index--
      }
      else if (event.key === 'ArrowDown') {
        index += this.columns
      }
      else if (event.key === 'ArrowUp') {
        index -= this.columns
      }
      else if (event.key === 'Home') {
        index = 0
      }
      else if (event.key === 'End') {
        index = this.filtered.length - 1
      }
      else if (event.key === 'Enter' && this.selected) {
        this.reveal(this.selected)
        event.preventDefault()
        return
      }
      else {
        return
      }
      event.preventDefault()
      const entry = this.filtered[Math.max(0, Math.min(this.filtered.length - 1, index))]
      if (entry) {
        this.select(entry)
        this.list.reveal(Math.floor(this.filtered.indexOf(entry) / this.columns))
      }
    })
  }

  update(project: EditorProject): void {
    const changed = this.project?.root !== project.root
    this.project = project
    if (changed) {
      this.directory = ''
      this.selected = ''
      this.thumbnails.length = 0
      this.clearDetails()
      this.host.querySelector<HTMLInputElement>('#asset-search')!.value = ''
    }
    else if (this.directory && !project.directories.includes(this.directory)) {
      this.directory = ''
    }
    this.folders.update(project)
    this.host.querySelector<HTMLButtonElement>('#asset-import')!.disabled = false
    this.refresh(changed)
    const selected = project.entries.find(entry => entry.path === this.selected)
    if (!selected) {
      this.selected = ''
      this.clearDetails()
    }
    else if (selected.modified !== this.selectedVersion && this.visible) {
      void this.preview(selected)
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible) {
      this.thumbnails.length = 0
      this.clearDetails()
      this.list.set([])
    }
    else {
      this.refresh()
      const entry = this.project?.entries.find(entry => entry.path === this.selected)
      if (entry)
        void this.preview(entry)
    }
  }

  selectPath(path: string): void {
    const entry = this.project?.entries.find(entry => entry.path === path)
    if (!entry)
      return
    this.directory = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
    this.host.querySelector<HTMLInputElement>('#asset-search')!.value = ''
    this.host.querySelector<HTMLSelectElement>('#asset-type')!.value = ''
    this.folders.reveal(this.directory)
    this.refresh(true)
    this.select(entry)
    this.list.reveal(Math.floor(this.filtered.indexOf(entry) / this.columns))
  }

  private refresh(reset = false): void {
    const query = this.host.querySelector<HTMLInputElement>('#asset-search')!.value.trim()
    const type = this.host.querySelector<HTMLSelectElement>('#asset-type')!.value
    const sort = this.host.querySelector<HTMLSelectElement>('#asset-sort')!.value
    const recursive = this.host.querySelector<HTMLInputElement>('#asset-recursive')!.checked
    const scores = new Map<string, number>()
    const score = (entry: EditorFileEntry): number => {
      if (!scores.has(entry.path))
        scores.set(entry.path, fuzzyScore(entry.path, query))
      return scores.get(entry.path)!
    }
    this.filtered = (this.project?.entries || []).filter(entry => entry.kind !== 'document' && (!type || entry.kind === type) && (!this.directory || entry.path.startsWith(`${this.directory}/`)) && (recursive || !entry.path.slice(this.directory.length + (this.directory ? 1 : 0)).includes('/')) && score(entry) >= 0)
    this.filtered.sort((a, b) => (query ? score(b) - score(a) : 0) || (sort === 'modified' ? b.modified - a.modified : sort === 'size' ? b.size - a.size : 0) || collator.compare(a.path, b.path))
    this.host.querySelector('#asset-path')!.textContent = this.directory ? ` / ${this.directory}` : ' /'
    this.host.querySelector('#asset-count')!.textContent = `${this.filtered.length} 个资源${this.directory ? `，${this.directory}` : ''}`
    this.empty.element.hidden = this.filtered.length > 0
    this.empty.heading.textContent = !this.project ? '尚无项目资源' : query || type ? '没有匹配的资源' : '此处还没有资源'
    this.empty.detail.textContent = !this.project ? '打开项目后，在这里浏览图片、音频和其他资源。' : query || type ? '尝试其他关键词或资源类型。' : '导入图片、音频或视频，开始布置场景。'
    this.emptyAction.textContent = this.project ? '导入资源' : '打开项目'
    this.emptyAction.hidden = Boolean(this.project && (query || type))
    this.renderList(reset)
  }

  private renderList(reset = false): void {
    if (!this.visible)
      return
    const rows: EditorFileEntry[][] = []
    for (let index = 0; index < this.filtered.length; index += this.columns) rows.push(this.filtered.slice(index, index + this.columns))
    const index = this.filtered.findIndex(entry => entry.path === this.selected)
    this.list.set(rows, reset, Math.floor(index / this.columns))
    if (index >= 0)
      this.viewport.setAttribute('aria-activedescendant', `asset-item-${index}`)
    else this.viewport.removeAttribute('aria-activedescendant')
  }

  private renderRow(entries: EditorFileEntry[]): HTMLElement {
    const row = element(html`<div class=${`asset-row ${this.mode}`} style=${styleMap({ gridTemplateColumns: `repeat(${this.columns}, minmax(0, 1fr))` })}>
      ${entries.map((entry) => {
        let image: HTMLImageElement | undefined
        if (this.mode === 'grid' && entry.kind === 'image') {
          image = element(html`<img alt="" decoding="async" hidden>`)
          this.thumbnails.push({ image, entry, root: this.project!.root })
          if (this.thumbnails.length > 128)
            this.thumbnails.splice(0, this.thumbnails.length - 128)
        }
        return html`<button type="button" id=${`asset-item-${this.filtered.indexOf(entry)}`} class=${`asset-card${entry.path === this.selected ? ' selected' : ''}`}
          tabindex="-1" role="option" aria-selected=${String(entry.path === this.selected)} title=${`${entry.path}\n${labels[entry.kind]}，${sizeLabel(entry.size)}`} data-path=${entry.path}
          @click=${() => {
            this.viewport.focus()
            this.select(entry)
          }} @dblclick=${() => {
            if (['image', 'audio', 'video'].includes(entry.kind))
              void this.bridge.openAssetPreview(this.project!.root, entry.path).catch(this.error)
            else this.reveal(entry.path)
          }}>
          <span class=${`asset-thumb kind-${entry.kind}`}>${unsafeHTML(icon(entry.kind))}${image ?? nothing}</span>
          <span class="asset-name">${entry.path.slice(entry.path.lastIndexOf('/') + 1)}</span>
          <span class="asset-file-meta">${this.mode === 'grid' ? labels[entry.kind] : `${labels[entry.kind]}，${sizeLabel(entry.size)}，${entry.path}`}</span>
        </button>`
      })}
    </div>`)
    queueMicrotask(() => this.loadThumbnails())
    return row
  }

  private loadThumbnails(): void {
    while (this.loading < 4 && this.thumbnails.length) {
      const task = this.thumbnails.shift()!
      if (!task.image.isConnected || !this.visible || task.root !== this.project?.root)
        continue
      this.loading++
      const image = task.image
      let done = false
      let timer: ReturnType<typeof setTimeout>
      const finish = (): void => {
        if (done)
          return
        done = true
        clearTimeout(timer)
        this.loading--
        this.loadThumbnails()
      }
      timer = setTimeout(finish, 10000)
      image.onload = () => {
        image.hidden = false
        image.previousElementSibling?.remove()
        finish()
      }
      image.onerror = finish
      void this.bridge.assetUrl(task.root, task.entry.path, true).then((url) => {
        if (task.root !== this.project?.root || !this.visible || !image.isConnected) {
          finish()
          return
        }
        image.src = url
      }).catch(finish)
    }
  }

  private select(entry: EditorFileEntry): void {
    this.selected = entry.path
    this.list.pin(Math.floor(this.filtered.indexOf(entry) / this.columns))
    // Update selection without restarting visible thumbnail requests.
    this.viewport.querySelectorAll<HTMLElement>('.asset-card').forEach((card) => {
      const selected = card.dataset.path === entry.path
      card.classList.toggle('selected', selected)
      card.setAttribute('aria-selected', String(selected))
    })
    this.viewport.setAttribute('aria-activedescendant', `asset-item-${this.filtered.indexOf(entry)}`)
    void this.preview(entry)
  }

  private clearDetails(): void {
    ++this.generation
    this.assetStatus('')
    this.details.querySelectorAll<HTMLMediaElement>('audio, video').forEach((media) => {
      media.pause()
      media.removeAttribute('src')
      media.load()
    })
    render(nothing, this.details)
  }

  private async preview(entry: EditorFileEntry): Promise<void> {
    this.clearDetails()
    render(nothing, this.details)
    this.selectedVersion = entry.modified
    const generation = this.generation
    const root = this.project!.root
    const info = element(html`<p class="asset-info">${`${labels[entry.kind]}，${sizeLabel(entry.size)}\n${entry.path}\n${new Date(entry.modified).toLocaleString()}`}</p>`)
    const format = entry.path.includes('.') ? entry.path.slice(entry.path.lastIndexOf('.') + 1).toUpperCase() : labels[entry.kind]
    const tooltip = `${entry.path}\n${entry.size.toLocaleString()} 字节\n修改于 ${new Date(entry.modified).toLocaleString()}`
    this.assetStatus(`${format}，${sizeLabel(entry.size)}${entry.kind === 'image' ? '，正在读取尺寸…' : ''}`, tooltip)
    if (entry.kind === 'image') {
      void this.bridge.imageMetadata(root, entry.path).then((metadata) => {
        if (generation !== this.generation || !this.visible)
          return
        const dimensions = `${metadata.width} × ${metadata.height} px`
        const summary = `${metadata.format.toUpperCase()}，${dimensions}，${sizeLabel(entry.size)}${metadata.hasAlpha ? '，含透明通道' : ''}`
        this.assetStatus(summary, `原图 ${dimensions}\n${tooltip}`)
        info.textContent = `${summary}\n${entry.path}\n${new Date(entry.modified).toLocaleString()}`
      }).catch((error) => {
        if (generation === this.generation && this.visible)
          this.assetStatus(`${format}，${sizeLabel(entry.size)}，尺寸不可读`, `${tooltip}\n${String(error).replace(/^Error: /, '')}`)
      })
    }
    const mediaHost = element(html`<div class="asset-media"></div>`)
    render(html`<strong>${entry.path.slice(entry.path.lastIndexOf('/') + 1)}</strong>${mediaHost}${info}
      <div class="asset-actions">
        <button type="button" @click=${() => void navigator.clipboard.writeText(entry.path).then(() => this.status('已复制项目相对路径')).catch(this.error)}>复制路径</button>
        <button type="button" @click=${() => this.reveal(entry.path)}>在项目树中定位</button>
        <button type="button" @click=${() => void this.bridge.revealFile(root, entry.path).catch(this.error)}>在文件管理器中显示</button>
      </div>`, this.details)
    if (!['image', 'audio', 'video'].includes(entry.kind)) {
      render(unsafeHTML(icon(entry.kind)), mediaHost)
      return
    }
    if (entry.kind === 'image' && entry.size > 32 * 1024 * 1024) {
      render('图片超过 32 MB 预览上限', mediaHost)
      return
    }
    try {
      const url = await this.bridge.assetUrl(root, entry.path, false)
      if (generation !== this.generation || !this.visible)
        return
      const unsupported = () => {
        if (generation === this.generation)
          render(entry.kind === 'image' ? '此图片格式暂不能预览' : '当前平台不支持此媒体编码', mediaHost)
      }
      render(entry.kind === 'image'
        ? html`<img alt=${entry.path} src=${url} @error=${unsupported}>`
        : entry.kind === 'audio'
          ? html`<audio controls preload="metadata" src=${url} @error=${unsupported}></audio>`
          : html`<video controls preload="metadata" src=${url} @error=${unsupported}></video>`, mediaHost)
    }
    catch (error) {
      if (generation === this.generation)
        render(String(error).replace(/^Error: /, ''), mediaHost)
    }
  }

  private async import(): Promise<void> {
    if (!this.project)
      return
    const button = this.host.querySelector<HTMLButtonElement>('#asset-import')!
    button.disabled = true
    try {
      const root = this.project.root
      const result = await this.bridge.importAssets(root, this.directory)
      if (root !== this.project?.root)
        return
      this.status(`已导入 ${result.imported.length} 个资源${result.skipped.length ? `；${result.skipped.length} 个同名、不支持或不可读取的文件已跳过：${result.skipped.slice(0, 3).join('、')}` : ''}`)
    }
    catch (error) {
      this.error(error)
    }
    finally {
      button.disabled = !this.project
    }
  }
}
