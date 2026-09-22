import type { EditorFileEntry, EditorProject } from '@quajs/editor-core'
import { element as createElement, html as template } from '@quajs/editor-controls'
import { html, render } from 'lit'
import { VirtualList } from '../../shared/virtual-list'
import { fuzzyScore } from '../explorer/model'

/** Search the shared index, never the filesystem or a second Monaco instance. */
export class QuickOpen {
  readonly dialog = createElement<HTMLDialogElement>(template`<dialog></dialog>`)
  private readonly input: HTMLInputElement
  private readonly list: VirtualList<EditorFileEntry>
  private project?: EditorProject
  private rows: EditorFileEntry[] = []
  private recent: string[] = []
  private selected = 0
  private timer?: ReturnType<typeof setTimeout>
  private previous?: HTMLElement

  constructor(private readonly open: (entry: EditorFileEntry, line?: number, column?: number) => void, private readonly visibilityChanged: () => void) {
    this.dialog.id = 'quick-open'
    this.dialog.setAttribute('aria-label', '快速打开文件')
    render(html`<input id="quick-open-input" role="combobox" aria-label="快速打开文件" aria-autocomplete="list" aria-expanded="true" aria-controls="quick-open-results" placeholder="输入文件名或路径，可附加 :行:列"><div id="quick-open-results" role="listbox" aria-label="匹配的文件"></div><p id="quick-open-empty" hidden>没有匹配的文件</p><div class="quick-open-help">↑↓ 选择 Enter 打开 Esc 返回</div>`, this.dialog)
    document.body.append(this.dialog)
    this.input = this.dialog.querySelector('input')!
    const host = this.dialog.querySelector<HTMLElement>('#quick-open-results')!
    this.list = new VirtualList(host, 42, (entry, index) => createElement(html`
      <button type="button" id=${`quick-result-${index}`} class=${`quick-result${index === this.selected ? ' selected' : ''}`} data-path=${entry.path}
        role="option" aria-selected=${String(index === this.selected)} tabindex="-1"
        @mousedown=${(event: MouseEvent) => event.preventDefault()} @click=${() => this.accept(index)}>
        <span>${entry.path.slice(entry.path.lastIndexOf('/') + 1)}</span><small>${entry.path}</small>
      </button>`))
    this.input.oninput = () => {
      clearTimeout(this.timer)
      this.timer = setTimeout(() => this.search(), 60)
    }
    this.input.onkeydown = (event) => {
      if (event.isComposing)
        return
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        this.selected = Math.max(0, Math.min(this.rows.length - 1, this.selected + (event.key === 'ArrowDown' ? 1 : -1)))
        this.list.reveal(this.selected)
        this.focus()
      }
      else if (event.key === 'Enter') {
        event.preventDefault()
        if (this.timer) {
          clearTimeout(this.timer)
          this.search()
        }
        this.accept(this.selected)
      }
    }
    this.dialog.addEventListener('click', (event) => {
      if (event.target === this.dialog) {
        const rect = this.dialog.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)
          this.dialog.close()
      }
    })
    this.dialog.addEventListener('close', () => {
      clearTimeout(this.timer)
      this.visibilityChanged()
      this.previous?.focus()
    })
  }

  update(project: EditorProject): void {
    if (this.project?.root !== project.root) {
      this.recent = []
      if (this.dialog.open)
        this.dialog.close()
    }
    this.project = project
    if (this.dialog.open)
      this.search()
  }

  remember(path: string): void {
    this.recent = [path, ...this.recent.filter(item => item !== path)].slice(0, 50)
  }

  show(): void {
    if (!this.project)
      return
    if (!this.dialog.open) {
      this.previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      this.input.value = ''
      this.dialog.showModal()
      this.visibilityChanged()
      this.search()
    }
    this.input.focus()
  }

  private search(): void {
    this.timer = undefined
    const query = this.input.value.replace(/:\d+(?::\d+)?$/u, '').trim()
    const entries = this.project?.entries || []
    this.rows = query
      ? entries.map(entry => ({ entry, score: fuzzyScore(entry.path, query) })).filter(item => item.score >= 0).sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path)).slice(0, 100).map(item => item.entry)
      : [...this.recent.map(path => entries.find(entry => entry.path === path)).filter((entry): entry is EditorFileEntry => Boolean(entry)), ...entries.filter(entry => !this.recent.includes(entry.path))].slice(0, 100)
    this.selected = 0
    this.list.host.style.height = `${Math.max(1, Math.min(10, this.rows.length)) * 42}px`
    this.list.set(this.rows, true, this.rows.length ? 0 : -1)
    this.dialog.querySelector<HTMLElement>('#quick-open-empty')!.hidden = this.rows.length > 0
    this.focus()
  }

  private focus(): void {
    if (this.rows.length)
      this.input.setAttribute('aria-activedescendant', `quick-result-${this.selected}`)
    else this.input.removeAttribute('aria-activedescendant')
  }

  private accept(index: number): void {
    const entry = this.rows[index]
    if (!entry)
      return
    const location = /:(\d+)(?::(\d+))?$/u.exec(this.input.value)
    this.previous = undefined
    this.dialog.close()
    this.remember(entry.path)
    this.open(entry, location ? Math.max(1, Number(location[1])) : undefined, location?.[2] ? Math.max(1, Number(location[2])) : undefined)
  }
}
