import type { EditorProject, EditorStoryNode } from '@quajs/editor-core'
import { element, nothing, styleMap } from '@quajs/editor-controls'
import { html } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import { VirtualList } from '../../shared/virtual-list'
import { fuzzyScore } from '../explorer/model'

interface OutlineRow { node: EditorStoryNode, depth: number, parent?: string, position: number, siblings: number }
const kindLabels = { chapter: '章节', file: '文件', scene: '场景', entry: '入口', node: '节点', label: '标签', choice: '选项' }

export class StoryOutline {
  private roots: EditorStoryNode[] = []
  private rows: OutlineRow[] = []
  private expanded = new Set<string>()
  private known = new Set<string>()
  private selected = ''
  private root = ''
  private query = ''
  private fingerprint = ''
  private activePath = ''
  private errors = 0
  private readonly list: VirtualList<OutlineRow>
  private readonly input: HTMLInputElement
  private readonly message: HTMLElement
  constructor(private readonly host: HTMLElement, private readonly open: (path: string, line?: number, column?: number) => void) {
    host.setAttribute('role', 'tree')
    host.setAttribute('aria-label', '故事大纲')
    host.tabIndex = 0
    this.list = new VirtualList(host, 22, (row, index) => this.render(row, index))
    this.input = document.getElementById('outline-search') as HTMLInputElement
    this.message = document.getElementById('outline-message')!
    this.input.oninput = () => {
      this.query = this.input.value.trim()
      this.refresh(true)
    }
    this.input.onkeydown = (event) => {
      if (event.key === 'Escape') {
        this.input.value = ''
        this.query = ''
        this.refresh(true)
        host.focus()
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        host.focus()
      }
    }
    host.onkeydown = event => this.keydown(event)
  }

  update(project: EditorProject): void {
    if (this.root !== project.root) {
      this.root = project.root
      this.expanded.clear()
      this.known.clear()
      this.selected = ''
      this.query = ''
      this.input.value = ''
      this.fingerprint = ''
      this.activePath = ''
    }
    const errors = project.diagnostics.filter(item => item.code === 'story.source_parse_failed').length
    const fingerprint = JSON.stringify([project.story, errors])
    if (fingerprint === this.fingerprint)
      return
    this.fingerprint = fingerprint
    this.errors = errors
    this.roots = project.story
    const known = new Set<string>()
    const visit = (nodes: EditorStoryNode[]): void => {
      for (const node of nodes) {
        known.add(node.key)
        if (!this.known.has(node.key) && ['chapter', 'file', 'scene', 'entry'].includes(node.kind))
          this.expanded.add(node.key)
        visit(node.children)
      }
    }
    visit(this.roots)
    this.known = known
    this.expanded = new Set([...this.expanded].filter(key => known.has(key)))
    this.refresh()
  }

  setActive(path: string): void {
    const normalized = path.replaceAll('\\', '/')
    const prefix = `${this.root.replaceAll('\\', '/')}/`
    this.activePath = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
  }

  revealActive(): void {
    this.query = ''
    this.input.value = ''
    const visit = (nodes: EditorStoryNode[], parents: string[]): boolean => {
      for (const node of nodes) {
        if (node.kind === 'file' && node.filePath === this.activePath) {
          parents.forEach(key => this.expanded.add(key))
          this.expanded.add(node.key)
          this.selected = node.key
          return true
        }
        if (visit(node.children, [...parents, node.key]))
          return true
      }
      return false
    }
    visit(this.roots, [])
    this.refresh()
    this.list.reveal(this.rows.findIndex(row => row.node.key === this.selected))
    this.host.focus()
  }

  collapse(): void {
    this.query = ''
    this.input.value = ''
    this.expanded.clear()
    this.selected = this.roots[0]?.key || ''
    this.refresh(true)
  }

  private refresh(reset = false): void {
    const matches = new Set<string>()
    const match = (node: EditorStoryNode): boolean => {
      const children = node.children.map(match).some(Boolean)
      const own = fuzzyScore(`${node.title} ${node.id} ${node.filePath || ''}`, this.query) >= 0
      if (own || children)
        matches.add(node.key)
      return own || children
    }
    if (this.query)
      this.roots.forEach(match)
    this.rows = []
    const visit = (nodes: EditorStoryNode[], depth: number, parent?: string): void => {
      const visible = this.query ? nodes.filter(node => matches.has(node.key)) : nodes
      visible.forEach((node, index) => {
        this.rows.push({ node, depth, parent, position: index + 1, siblings: visible.length })
        if (this.query || this.expanded.has(node.key)) {
          // A single scene shares the file's row; multiple scenes keep distinct rows.
          const scene = this.compactScene(node)
          visit(scene?.children || node.children, depth + 1, node.key)
        }
      })
    }
    visit(this.roots, 0)
    if (!this.rows.some(row => row.node.key === this.selected))
      this.selected = this.rows[0]?.node.key || ''
    const selected = this.rows.findIndex(row => row.node.key === this.selected)
    this.list.set(this.rows, reset, selected)
    if (selected >= 0)
      this.host.setAttribute('aria-activedescendant', `outline-row-${selected}`)
    else this.host.removeAttribute('aria-activedescendant')
    this.message.hidden = this.rows.length > 0 && !this.errors
    this.message.textContent = this.errors ? `${this.errors} 个文件无法解析大纲，请查看“问题”。` : this.query ? '没有匹配的章节、节点或选项。' : '项目中暂无故事声明。'
  }

  private render({ node, depth, position, siblings }: OutlineRow, index: number): HTMLElement {
    const expanded = Boolean(this.query) || this.expanded.has(node.key)
    const button = element<HTMLButtonElement>(html`
      <button type="button" class=${`tree-row outline-row${node.key === this.selected ? ' selected' : ''}`} tabindex="-1" id=${`outline-row-${index}`}
        data-kind=${node.kind} data-path=${node.filePath} data-symbol=${node.id} role="treeitem"
        aria-level=${depth + 1} aria-posinset=${position} aria-setsize=${siblings} aria-selected=${String(node.key === this.selected)}
        aria-expanded=${node.children.length ? String(expanded) : nothing} style=${styleMap({ '--tree-depth': String(depth) })}
        title=${`${kindLabels[node.kind]}，${node.title}\n${node.id}\n${node.filePath || ''}:${node.line || 1}:${node.column || 1}`}>
        <span class=${`tree-chevron${expanded ? ' expanded' : ''}`}>${unsafeHTML(node.children.length ? icon('chevron') : '')}</span>
        <span class=${`file-icon outline-${node.kind}`}>${unsafeHTML(icon(node.kind === 'chapter' ? 'folder' : node.kind === 'file' ? 'code' : node.kind === 'choice' ? 'branch' : 'story'))}</span>
        <span class="tree-label">${node.title}</span>${node.kind === 'chapter' ? html`<span class="outline-detail">${node.id}</span>` : nothing}
      </button>`)
    const scene = this.compactScene(node)
    if (scene)
      button.title += `\n场景，${scene.title} (${scene.id})`
    button.onclick = (event) => {
      this.selected = node.key
      if (node.children.length && (event.target as Element).closest('.tree-chevron')) {
        this.toggle(node)
        this.host.focus()
      }
      else {
        this.refresh()
        this.navigate(node)
      }
    }
    return button
  }

  private navigate(node: EditorStoryNode): void {
    node = this.compactScene(node) || node
    if (node.filePath)
      this.open(node.filePath, node.line, node.column)
  }

  private compactScene(node: EditorStoryNode): EditorStoryNode | undefined {
    return !this.query && node.kind === 'file' && node.children.length === 1 && node.children[0].kind === 'scene' ? node.children[0] : undefined
  }

  private toggle(node: EditorStoryNode): void {
    if (this.expanded.has(node.key))
      this.expanded.delete(node.key)
    else this.expanded.add(node.key)
    this.refresh()
  }

  private keydown(event: KeyboardEvent): void {
    let index = this.rows.findIndex(row => row.node.key === this.selected)
    const row = this.rows[index]
    if (!row)
      return
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
      index = this.rows.length - 1
    }
    else if (event.key === 'ArrowRight') {
      if (row.node.children.length && !this.expanded.has(row.node.key))
        this.toggle(row.node)
      else if (row.node.children.length)
        index++
    }
    else if (event.key === 'ArrowLeft') {
      if (this.expanded.has(row.node.key))
        this.toggle(row.node)
      else if (row.parent)
        index = this.rows.findIndex(item => item.node.key === row.parent)
    }
    else if (event.key === 'Enter') {
      this.navigate(row.node)
    }
    else if (event.key === ' ') {
      this.toggle(row.node)
    }
    else {
      return
    }
    event.preventDefault()
    this.selected = this.rows[Math.max(0, Math.min(index, this.rows.length - 1))]?.node.key || ''
    this.refresh()
    this.list.reveal(this.rows.findIndex(item => item.node.key === this.selected))
  }
}
