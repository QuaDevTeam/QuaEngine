import type { EditorBridge, EditorProject, EditorSearchMatch } from '@quajs/editor-core'
import { disclosure, element, nothing } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { VirtualList } from '../../shared/virtual-list'

type SearchRow = { path: string, count: number } | EditorSearchMatch
export class SearchPanel {
  private project?: EditorProject
  private generation = 0
  private timer?: ReturnType<typeof setTimeout>
  private readonly list: VirtualList<SearchRow>
  private readonly query: HTMLInputElement
  private readonly summary: HTMLElement
  private visible = false
  private readonly collapsed = new Set<string>()
  private matches: EditorSearchMatch[] = []
  private rows: SearchRow[] = []
  private active = 0
  private readonly results: HTMLElement

  constructor(private readonly host: HTMLElement, private readonly bridge: EditorBridge, private readonly open: (path: string, line: number, column: number) => void) {
    render(html`<div class="search-controls"><div class="search-query search-field"><input id="content-search" aria-label="搜索项目内容" placeholder="搜索项目内容"><div class="search-options" role="group" aria-label="搜索匹配选项"><button id="search-case" class="search-option" aria-label="区分大小写" title="区分大小写" aria-pressed="false">Aa</button><button id="search-word" class="search-option" aria-label="全词匹配（词边界）" title="全词匹配（词边界）：cat 不匹配 catalog 或 cat_2" aria-pressed="false"><span class="whole-word-symbol" aria-hidden="true">ab</span></button><button id="search-regex" class="search-option" aria-label="正则表达式" title="正则表达式（Rust regex）" aria-pressed="false">.*</button></div></div>${disclosure('包含 / 排除文件', html`<label>包含<input id="search-include" placeholder="例如 **/*.qs, **/*.ts"></label><label>排除<input id="search-exclude" placeholder="例如 **/generated/**"></label>`)}<div class="search-meta"><span id="search-summary" role="status"></span><button id="search-cancel" hidden>取消</button></div></div><div id="search-results" aria-label="搜索结果"></div>`, host)
    this.query = host.querySelector('#content-search')!
    this.summary = host.querySelector('#search-summary')!
    this.results = host.querySelector('#search-results')!
    this.results.setAttribute('role', 'tree')
    this.results.tabIndex = 0
    this.list = new VirtualList(this.results, 28, (row, index) => element(html`
      <button type="button" id=${`search-row-${index}`} tabindex="-1" role="treeitem"
        aria-level=${'count' in row ? '1' : '2'} aria-selected=${String(this.active === index)}
        aria-expanded=${'count' in row ? String(!this.collapsed.has(row.path)) : nothing}
        class=${'count' in row ? 'search-file' : 'search-match'}
        title=${'count' in row ? row.path : `${row.path}:${row.line}:${row.column}\n${row.text}`}
        @click=${() => {
          this.active = index
          this.results.focus()
          this.activate(row)
        }}>
        ${'count' in row
          ? `${this.collapsed.has(row.path) ? '▸' : '▾'} ${row.path}  (${row.count})`
          : html`<span class="line-number">${row.line}</span><span>${row.text.slice(Math.max(0, row.start - 35), row.start)}<mark>${row.text.slice(row.start, row.end) || '│'}</mark>${row.text.slice(row.end, row.end + 180)}</span>`}
      </button>`))
    host.querySelectorAll('input').forEach(input => input.addEventListener('input', () => this.schedule()))
    this.query.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        clearTimeout(this.timer)
        void this.search()
      }
      else if (event.key === 'ArrowDown' && this.rows.length) {
        event.preventDefault()
        this.active = this.rows.length > 1 ? 1 : 0
        this.results.focus()
        this.focusRow()
      }
    })
    this.results.addEventListener('keydown', (event) => {
      const row = this.rows[this.active]
      if (!row)
        return
      if (event.key === 'ArrowDown') {
        this.active++
      }
      else if (event.key === 'ArrowUp') {
        this.active--
      }
      else if (event.key === 'Home') {
        this.active = 0
      }
      else if (event.key === 'End') {
        this.active = this.rows.length - 1
      }
      else if (event.key === 'Enter' || event.key === ' ') {
        this.activate(row)
      }
      else if (event.key === 'ArrowRight' && 'count' in row) {
        if (this.collapsed.has(row.path))
          this.activate(row)
        else this.active++
      }
      else if (event.key === 'ArrowLeft') {
        if ('count' in row) {
          this.collapsed.add(row.path)
          this.render()
        }
        else {
          this.active = this.rows.findIndex(item => 'count' in item && item.path === row.path)
        }
      }
      else {
        return
      }
      event.preventDefault()
      this.active = Math.max(0, Math.min(this.rows.length - 1, this.active))
      this.focusRow()
    })
    host.querySelectorAll<HTMLButtonElement>('.search-option').forEach(button => button.onclick = () => {
      button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'))
      this.schedule()
    })
    host.querySelector<HTMLButtonElement>('#search-cancel')!.onclick = () => this.cancel('搜索已取消')
  }

  update(project: EditorProject): void {
    const changed = this.project?.root !== project.root
    this.project = project
    if (changed) {
      this.cancel('')
      this.matches = []
      this.collapsed.clear()
      this.render()
    }
    if (this.visible && this.query.value)
      this.schedule()
  }

  setVisible(visible: boolean): void {
    this.visible = visible
    if (!visible)
      this.cancel()
    else if (this.query.value)
      this.schedule()
  }

  focus(): void {
    this.query.focus()
    this.query.select()
  }

  private cancel(message?: string): void {
    clearTimeout(this.timer)
    ++this.generation
    void this.bridge.cancelSearch().catch(() => {})
    this.host.querySelector<HTMLElement>('#search-cancel')!.hidden = true
    if (message !== undefined)
      this.summary.textContent = message
  }

  private schedule(): void {
    this.cancel()
    this.summary.classList.remove('error')
    this.timer = setTimeout(() => void this.search(), 220)
  }

  private async search(): Promise<void> {
    const generation = ++this.generation
    if (!this.project) {
      this.summary.textContent = ''
      return
    }
    const query = this.query.value
    if (!query) {
      this.matches = []
      this.render()
      this.summary.textContent = ''
      return
    }
    this.summary.textContent = '正在搜索…'
    this.host.querySelector<HTMLElement>('#search-cancel')!.hidden = false
    const pressed = (id: string): boolean => this.host.querySelector(`#${id}`)!.getAttribute('aria-pressed') === 'true'
    try {
      const result = await this.bridge.searchProject({ root: this.project.root, query, caseSensitive: pressed('search-case'), wholeWord: pressed('search-word'), regex: pressed('search-regex'), include: this.host.querySelector<HTMLInputElement>('#search-include')!.value, exclude: this.host.querySelector<HTMLInputElement>('#search-exclude')!.value })
      if (generation !== this.generation || result.cancelled)
        return
      this.matches = result.matches.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column)
      this.collapsed.clear()
      this.render(true)
      this.summary.textContent = `${result.matches.length} 处匹配，${new Set(result.matches.map(match => match.path)).size} 个文件${result.truncated ? '，已达上限，请缩小范围' : ''}`
      this.summary.classList.remove('error')
    }
    catch (error) {
      if (generation !== this.generation)
        return
      this.matches = []
      this.render()
      this.summary.textContent = String(error).replace(/^Error: /, '')
      this.summary.classList.add('error')
    }
    finally {
      if (generation === this.generation)
        this.host.querySelector<HTMLElement>('#search-cancel')!.hidden = true
    }
  }

  private render(reset = false): void {
    const groups = new Map<string, EditorSearchMatch[]>()
    for (const match of this.matches) {
      const list = groups.get(match.path) || []
      list.push(match)
      groups.set(match.path, list)
    }
    const rows: SearchRow[] = []
    for (const [path, matches] of groups) {
      rows.push({ path, count: matches.length })
      if (!this.collapsed.has(path))
        rows.push(...matches)
    }
    this.rows = rows
    this.active = reset ? 0 : Math.max(0, Math.min(rows.length - 1, this.active))
    this.list.set(rows, reset, this.active)
    if (rows.length)
      this.results.setAttribute('aria-activedescendant', `search-row-${this.active}`)
    else this.results.removeAttribute('aria-activedescendant')
  }

  private focusRow(): void {
    this.list.reveal(this.active)
    this.results.setAttribute('aria-activedescendant', `search-row-${this.active}`)
  }

  private activate(row: SearchRow): void {
    if ('count' in row) {
      if (this.collapsed.has(row.path))
        this.collapsed.delete(row.path)
      else this.collapsed.add(row.path)
      this.render()
    }
    else {
      this.focusRow()
      this.open(row.path, row.line, row.column)
    }
  }
}
