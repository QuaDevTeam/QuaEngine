import type { EditorFileEntry, EditorFileMenuAction, EditorProject } from '@quajs/editor-core'
import type { TreeNode, TreeRow } from './model'
import { element, nothing, styleMap } from '@quajs/editor-controls'
import { html } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon } from '../../shared/icons'
import { VirtualList } from '../../shared/virtual-list'
import { createTree, flattenTree } from './model'

export class FileTree {
  private root = createTree([], [])
  private projectRoot = ''
  private expanded = new Set<string>()
  private rows: TreeRow[] = []
  private selected = ''
  private active = ''
  private query = ''
  private readonly list: VirtualList<TreeRow>
  interactions?: { context: (path: string) => void, drop: (path: string, directory: string) => void, action: (action: EditorFileMenuAction) => void }
  private hoverTimer?: ReturnType<typeof setTimeout>
  private dropPath?: string

  constructor(readonly host: HTMLElement, private readonly open: (entry: EditorFileEntry) => void, private readonly selectFolder?: (path: string) => void, private readonly foldersOnly = false) {
    host.setAttribute('role', 'tree')
    host.setAttribute('aria-label', foldersOnly ? '资源文件夹' : '项目文件')
    host.tabIndex = 0
    this.list = new VirtualList(host, 22, (row, index) => this.renderRow(row, index))
    host.addEventListener('keydown', event => this.keydown(event))
    host.addEventListener('contextmenu', (event) => {
      if (!this.interactions)
        return
      event.preventDefault()
      const path = (event.target as Element).closest<HTMLElement>('[data-path]')?.dataset.path || ''
      this.selected = path
      this.refresh()
      host.focus()
      this.interactions.context(path)
    })
    this.bindDrop(host)
  }

  selection(): string {
    return this.selected
  }

  bindDrop(host: HTMLElement): void {
    const clear = (): void => {
      clearTimeout(this.hoverTimer)
      this.dropPath = undefined
      host.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'))
      host.classList.remove('drop-target')
    }
    host.addEventListener('dragover', (event) => {
      if (!this.interactions || !event.dataTransfer?.types.includes('application/x-qua-file'))
        return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const row = (event.target as Element).closest<HTMLElement>('[data-path]')
      const node = row ? this.rows.find(item => item.node.path === row.dataset.path)?.node : undefined
      const directory = node?.directory ? node.path : node?.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
      if (directory !== this.dropPath) {
        clear()
        this.dropPath = directory
        ;
        (row || host).classList.add('drop-target')
        if (node?.directory && !this.expanded.has(directory)) {
          this.hoverTimer = setTimeout(() => {
            this.expanded.add(directory)
            this.refresh()
          }, 600)
        }
      }
      const bounds = this.host.getBoundingClientRect()
      if (event.clientY < bounds.top + 24)
        this.host.scrollTop -= 22
      if (event.clientY > bounds.bottom - 24)
        this.host.scrollTop += 22
    })
    host.addEventListener('dragleave', (event) => {
      if (!(event.relatedTarget instanceof Node) || !host.contains(event.relatedTarget))
        clear()
    })
    host.addEventListener('drop', (event) => {
      if (!this.interactions || !event.dataTransfer?.types.includes('application/x-qua-file'))
        return
      event.preventDefault()
      const directory = this.dropPath ?? ''
      clear()
      try {
        const source = JSON.parse(event.dataTransfer.getData('application/x-qua-file'))
        if (source.root === this.projectRoot && typeof source.path === 'string')
          this.interactions.drop(source.path, directory)
      }
      catch { /* Only internal project drag payloads are accepted. */ }
    })
    host.addEventListener('dragend', clear)
  }

  update(project: EditorProject): void {
    this.host.dataset.projectName = project.name
    if (project.root !== this.projectRoot) {
      this.projectRoot = project.root
      this.query = ''
      this.active = ''
      this.selected = ''
      this.expanded = new Set()
      try {
        const saved = JSON.parse(localStorage.getItem(`qua-tree-${this.foldersOnly ? 'assets' : 'files'}`) || 'null') as { root: string, paths: string[] } | null
        if (saved?.root === project.root && Array.isArray(saved.paths))
          this.expanded = new Set(saved.paths)
      }
      catch { /* Layout persistence is optional. */ }
      this.host.scrollTop = 0
    }
    this.root = createTree(this.foldersOnly ? [] : project.entries, project.directories)
    this.refresh()
  }

  filter(query: string): void {
    this.query = query.trim()
    this.refresh(true)
  }

  collapse(): void {
    this.expanded.clear()
    this.query = ''
    this.refresh(true)
    this.persist()
  }

  reveal(path: string): void {
    this.query = ''
    const parts = path.split('/')
    for (let index = 1; index < parts.length; index++) this.expanded.add(parts.slice(0, index).join('/'))
    this.active = path
    this.selected = path
    this.refresh()
    this.list.reveal(this.rows.findIndex(row => row.node.path === path))
    this.persist()
  }

  markActive(path: string): void {
    this.active = path
    this.refresh()
  }

  private refresh(reset = false): void {
    this.rows = flattenTree(this.root, this.expanded, this.query)
    if (!this.rows.some(row => row.node.path === this.selected))
      this.selected = this.rows[0]?.node.path || ''
    this.list.set(this.rows, reset, this.rows.findIndex(row => row.node.path === this.selected))
    this.updateFocus()
  }

  private updateFocus(): void {
    const index = this.rows.findIndex(row => row.node.path === this.selected)
    if (index >= 0)
      this.host.setAttribute('aria-activedescendant', `${this.host.id}-row-${index}`)
    else this.host.removeAttribute('aria-activedescendant')
  }

  private renderRow({ node, depth, position, siblings }: TreeRow, index: number): HTMLElement {
    const expanded = this.query !== '' || this.expanded.has(node.path)
    const button = element<HTMLButtonElement>(html`
      <button type="button" id=${`${this.host.id}-row-${index}`} class=${`tree-row${node.path === this.selected ? ' selected' : ''}${node.path === this.active ? ' active-file' : ''}`}
        tabindex="-1" data-path=${node.path} role="treeitem" aria-level=${depth + 1} aria-posinset=${position} aria-setsize=${siblings}
        aria-selected=${String(node.path === this.selected)} aria-expanded=${node.directory ? String(expanded) : nothing}
        style=${styleMap({ '--tree-depth': String(depth) })} title=${node.path}>
        <span class=${`tree-chevron${expanded ? ' expanded' : ''}`}>${unsafeHTML(node.directory ? icon('chevron') : '')}</span>
        <span class=${`file-icon kind-${node.entry?.kind || 'folder'}`}>${unsafeHTML(icon(node.directory ? expanded ? 'folderOpen' : 'folder' : node.entry?.kind === 'document' && /\.(?:qs|[cm]?[jt]sx?)$/i.test(node.path) ? 'code' : node.entry?.kind || 'other'))}</span>
        <span class="tree-label">${node.name}</span>
      </button>`)
    if (this.interactions) {
      button.draggable = true
      button.ondragstart = (event) => {
        event.dataTransfer?.setData('application/x-qua-file', JSON.stringify({ root: this.projectRoot, path: node.path }))
        if (event.dataTransfer)
          event.dataTransfer.effectAllowed = 'move'
      }
    }
    button.onclick = () => {
      this.selected = node.path
      this.host.focus()
      this.activate(node)
    }
    return button
  }

  private activate(node: TreeNode): void {
    if (node.directory) {
      if (this.expanded.has(node.path))
        this.expanded.delete(node.path)
      else this.expanded.add(node.path)
      this.selectFolder?.(node.path)
      this.refresh()
      this.persist()
    }
    else if (node.entry) {
      this.refresh()
      this.open(node.entry)
    }
  }

  private keydown(event: KeyboardEvent): void {
    if (this.interactions && !event.isComposing) {
      const modifier = event.ctrlKey || event.metaKey
      const action = event.key === 'F2' ? 'rename' : event.key === 'Delete' || (event.metaKey && event.key === 'Backspace') ? 'delete' : modifier && event.key.toLowerCase() === 'c' ? 'copy' : modifier && event.key.toLowerCase() === 'x' ? 'cut' : modifier && event.key.toLowerCase() === 'v' ? 'paste' : undefined
      if (action) {
        event.preventDefault()
        event.stopPropagation()
        this.interactions.action(action)
        return
      }
      if ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu') {
        event.preventDefault()
        this.interactions.context(this.selected)
        return
      }
    }
    let index = this.rows.findIndex(row => row.node.path === this.selected)
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
      if (row.node.directory && !this.expanded.has(row.node.path)) {
        this.expanded.add(row.node.path)
        this.refresh()
        this.persist()
      }
      else if (row.node.directory && this.rows[index + 1]?.depth > row.depth) {
        index++
      }
    }
    else if (event.key === 'ArrowLeft') {
      if (this.expanded.has(row.node.path)) {
        this.expanded.delete(row.node.path)
        this.refresh()
        this.persist()
      }
      else if (row.node.path.includes('/')) {
        index = this.rows.findIndex(item => item.node.path === row.node.path.slice(0, row.node.path.lastIndexOf('/')))
      }
    }
    else if (event.key === 'Enter' || event.key === ' ') {
      this.activate(row.node)
    }
    else {
      return
    }
    event.preventDefault()
    index = Math.max(0, Math.min(this.rows.length - 1, index))
    this.selected = this.rows[index]?.node.path || ''
    this.list.reveal(index)
    this.updateFocus()
  }

  private persist(): void {
    try {
      localStorage.setItem(`qua-tree-${this.foldersOnly ? 'assets' : 'files'}`, JSON.stringify({ root: this.projectRoot, paths: [...this.expanded] }))
    }
    catch { /* Private or full storage does not disable navigation. */ }
  }
}
