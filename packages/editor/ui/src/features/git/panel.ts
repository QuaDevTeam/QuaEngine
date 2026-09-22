import type { EditorBridge, EditorGitChange, EditorGitDiff, EditorGitState, EditorProject } from '@quajs/editor-core'
import type { GitTreeNode, GitTreeRow } from './tree'
import { element as createElement, styleMap } from '@quajs/editor-controls'
import { html, nothing, render } from 'lit'
import { unsafeHTML } from 'lit/directives/unsafe-html.js'
import { icon, iconButton } from '../../shared/icons'
import { VirtualList } from '../../shared/virtual-list'
import { changeStatus, createGitTree, flattenGitTree, stagedChange, statusLabels } from './tree'

export class GitPanel {
  private root?: string
  private state?: EditorGitState
  private generation = 0
  private diffGeneration = 0
  private busy = false
  private rowsKey = ''
  private renderedBusy = false
  private roots: GitTreeNode[] = []
  private rows: GitTreeRow[] = []
  private collapsed = new Set<string>()
  private selected = ''
  private mode: 'tree' | 'list' = 'tree'
  private query = ''
  private defaultMessage = false
  private filterTimer?: ReturnType<typeof setTimeout>
  private readonly list: VirtualList<GitTreeRow>
  private readonly message: HTMLElement
  private readonly commit: HTMLButtonElement
  private readonly text: HTMLTextAreaElement
  private readonly footer = document.getElementById('git-branch') as HTMLButtonElement

  constructor(private readonly host: HTMLElement, private readonly bridge: EditorBridge, private readonly showDiff: (diff: EditorGitDiff) => void, private readonly open: (path: string) => void, private readonly saveAll: () => Promise<void>) {
    render('Git', this.footer)
    render(html`<div class="git-toolbar-actions" id="git-actions" role="toolbar" aria-label="源代码管理操作"><button id="git-choose-branch" class="icon-button" title="切换分支" aria-label="切换分支">${unsafeHTML(icon('branch'))}</button><button id="git-view-mode" class="icon-button" title="切换为列表视图" aria-label="切换为列表视图"></button><button id="git-collapse" class="icon-button" title="折叠全部" aria-label="折叠全部">${unsafeHTML(icon('collapse'))}</button><button id="git-refresh" class="icon-button" title="刷新 Git 状态" aria-label="刷新 Git 状态">${unsafeHTML(icon('refresh'))}</button></div><div id="git-branch-picker" hidden><div class="git-branch-picker-row"><select id="git-branches" aria-label="本地分支"></select><button id="git-switch">切换</button></div><div class="git-branch-picker-row"><input id="git-new-branch" aria-label="新分支名称" placeholder="新建分支名称"><button id="git-create-branch">创建并切换</button></div></div><div id="git-controls" hidden><div class="git-commit-row"><textarea id="git-commit-message" rows="1" aria-label="提交说明" placeholder="提交说明（⌘/Ctrl+Enter 提交）" maxlength="10000" spellcheck="false"></textarea><button id="git-commit" class="icon-button" title="提交已暂存更改（⌘/Ctrl+Enter）" aria-label="提交已暂存更改" disabled>${unsafeHTML(icon('check'))}</button></div></div><div id="git-message" role="status"></div><div class="git-summary-row"><span id="git-summary">Git</span></div><input id="git-filter" aria-label="筛选 Git 更改" placeholder="筛选更改的文件…"><div id="git-files" role="tree" tabindex="0" aria-label="Git 文件变更"></div><div id="git-filter-empty" hidden>没有匹配的更改</div>`, host)
    this.message = this.element('git-message')
    this.commit = this.element('git-commit')
    this.text = this.element('git-commit-message')
    this.list = new VirtualList(this.element('git-files'), 22, (row, index) => this.renderRow(row, index))
    this.element('git-files').addEventListener('keydown', event => this.keydown(event))
    this.element<HTMLInputElement>('git-filter').oninput = (event) => {
      clearTimeout(this.filterTimer)
      const query = (event.target as HTMLInputElement).value.trim()
      this.filterTimer = setTimeout(() => {
        this.query = query
        this.refreshRows(true)
      }, 120)
    }
    this.element<HTMLInputElement>('git-filter').onkeydown = (event) => {
      if (event.key === 'Escape') {
        clearTimeout(this.filterTimer)
        this.query = ''
        this.element<HTMLInputElement>('git-filter').value = ''
        this.refreshRows(true)
      }
      else if (event.key === 'ArrowDown') {
        event.preventDefault()
        this.element('git-files').focus()
      }
    }
    try {
      this.mode = localStorage.getItem('qua-git-view') === 'list' ? 'list' : 'tree'
    }
    catch { /* View preferences are optional. */ }
    this.updateViewButton()
    this.element('git-view-mode').onclick = () => {
      this.mode = this.mode === 'tree' ? 'list' : 'tree'
      this.rowsKey = ''
      this.updateViewButton()
      try {
        localStorage.setItem('qua-git-view', this.mode)
      }
      catch { /* Keep the current session preference. */ }
      if (this.state)
        this.render(this.state)
    }
    this.element('git-collapse').onclick = () => {
      const collapse = (node: GitTreeNode): void => {
        if (node.kind !== 'file')
          this.collapsed.add(node.id)
        node.children.forEach(collapse)
      }
      this.roots.forEach(collapse)
      this.query = ''
      clearTimeout(this.filterTimer)
      this.element<HTMLInputElement>('git-filter').value = ''
      this.refreshRows(true)
      this.element('git-files').focus()
    }
    this.element('git-refresh').onclick = () => void this.refresh()
    this.element('git-choose-branch').onclick = () => void this.chooseBranch()
    this.text.oninput = () => {
      this.resizeMessage()
      this.updateCommit()
    }
    this.text.onkeydown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.isComposing) {
        event.preventDefault()
        this.commit.click()
      }
    }
    this.commit.onclick = () => void this.perform(async (root) => {
      const message = this.text.value
      const state = await bridge.gitCommit(root, message)
      if (root === this.root && this.text.value === message) {
        this.text.value = ''
        this.resizeMessage()
      }
      return state
    })
    this.element('git-switch').onclick = () => void this.perform(root => this.switchBranch(root, this.element<HTMLSelectElement>('git-branches').value, false))
    this.element('git-create-branch').onclick = () => void this.perform(root => this.switchBranch(root, this.element<HTMLInputElement>('git-new-branch').value.trim(), true))
    document.querySelector('.sidebar-heading')!.append(this.element('git-actions'))
    bridge.onGitChange(state => this.render(state))
  }

  update(project: EditorProject): void {
    if (project.root === this.root)
      return
    this.root = project.root
    this.state = undefined
    ++this.generation
    ++this.diffGeneration
    this.busy = false
    this.text.value = ''
    this.resizeMessage()
    this.element('git-controls').hidden = true
    this.setMessage('正在读取 Git 状态…')
    this.element('git-branch-picker').hidden = true
    this.element<HTMLInputElement>('git-new-branch').value = ''
    render('Git…', this.footer)
    this.footer.disabled = false
    this.list.set([])
    this.rowsKey = ''
    this.roots = []
    this.rows = []
    this.selected = ''
    this.collapsed.clear()
    this.query = ''
    clearTimeout(this.filterTimer)
    this.element<HTMLInputElement>('git-filter').value = ''
    this.refreshRows(true)
    void this.refresh()
  }

  async chooseBranch(): Promise<void> {
    if (!this.root || this.state?.state !== 'ready')
      return
    const root = this.root
    try {
      const branches = await this.bridge.gitBranches(root)
      if (root !== this.root)
        return
      const select = this.element<HTMLSelectElement>('git-branches')
      render(html`${branches.map(branch => html`<option value=${branch} .selected=${branch === this.state?.branch}>${branch}</option>`)}`, select)
      this.element('git-branch-picker').hidden = false
      select.focus()
    }
    catch (error) {
      if (root === this.root)
        this.setMessage(String(error), true)
    }
  }

  cancelDiff(): void {
    ++this.diffGeneration
  }

  private async refresh(): Promise<void> {
    if (!this.root)
      return
    const root = this.root
    this.setMessage('')
    try {
      this.render(await this.bridge.gitStatus(root))
    }
    catch (error) {
      if (root === this.root)
        this.setMessage(String(error), true)
    }
  }

  private render(state: EditorGitState): void {
    if (state.root !== this.root)
      return
    if (this.state && this.state.branch !== state.branch)
      this.element('git-branch-picker').hidden = true
    this.state = state
    this.element('git-controls').hidden = state.state !== 'ready'
    this.element<HTMLButtonElement>('git-choose-branch').disabled = state.state !== 'ready' || this.busy
    this.host.querySelectorAll<HTMLButtonElement>('#git-controls button, #git-branch-picker button').forEach((button) => {
      button.disabled = this.busy
    })
    const branch = state.branch === '(detached)' ? `HEAD ${state.oid?.slice(0, 7)}` : state.branch || 'Git'
    const label = state.state === 'ready' ? `${branch}${state.changes.length ? '*' : ''}${state.ahead ? ` ↑${state.ahead}` : ''}${state.behind ? ` ↓${state.behind}` : ''}` : state.state === 'not-repository' ? '未使用 Git' : 'Git 不可用'
    render(html`${unsafeHTML(icon('branch'))}<span>${label}</span>`, this.footer)
    const branchButton = this.element<HTMLButtonElement>('git-choose-branch')
    branchButton.title = `切换分支，${branch}`
    this.footer.title = state.state === 'ready' ? `${state.repositoryRoot}\n${branch}${state.upstream ? ` → ${state.upstream}` : ''}\n${state.changes.length} 个项目文件变更，点击打开源代码管理` : state.message || 'Git'
    this.element('git-summary').textContent = state.state === 'ready' ? `${state.changes.length} 个文件变更` : 'Git'
    if (state.state !== 'ready')
      this.setMessage(state.message || '当前项目不在 Git 仓库中。', false, true)
    else if (this.defaultMessage || !this.message.textContent)
      this.setMessage(state.changes.length ? '' : '工作区干净', false, true)
    const key = JSON.stringify([state.changes, this.mode])
    if (key !== this.rowsKey) {
      this.roots = createGitTree(state.changes, this.mode)
      const ids = new Set<string>()
      const collect = (node: GitTreeNode): void => {
        ids.add(node.id)
        node.children.forEach(collect)
      }
      this.roots.forEach(collect)
      this.collapsed = new Set([...this.collapsed].filter(id => ids.has(id)))
    }
    if (key !== this.rowsKey || this.renderedBusy !== this.busy)
      this.refreshRows()
    this.rowsKey = key
    this.renderedBusy = this.busy
    this.updateCommit()
  }

  private updateViewButton(): void {
    const button = this.element<HTMLButtonElement>('git-view-mode')
    render(unsafeHTML(icon(this.mode === 'tree' ? 'list' : 'files')), button)
    button.title = this.mode === 'tree' ? '切换为列表视图' : '切换为树视图'
    button.setAttribute('aria-label', button.title)
    button.dataset.mode = this.mode
  }

  private refreshRows(reset = false): void {
    this.rows = flattenGitTree(this.roots, this.collapsed, this.query)
    if (!this.rows.some(row => row.node.id === this.selected))
      this.selected = this.rows[0]?.node.id || ''
    const index = this.rows.findIndex(row => row.node.id === this.selected)
    this.list.set(this.rows, reset, index)
    this.updateFocus(index)
    this.element('git-filter-empty').hidden = !this.query || this.rows.length > 0
  }

  private updateFocus(index: number): void {
    const host = this.element('git-files')
    if (index >= 0)
      host.setAttribute('aria-activedescendant', `git-row-${index}`)
    else host.removeAttribute('aria-activedescendant')
  }

  private activate(node: GitTreeNode): void {
    this.selected = node.id
    if (node.kind !== 'file') {
      if (this.collapsed.has(node.id))
        this.collapsed.delete(node.id)
      else this.collapsed.add(node.id)
    }
    this.refreshRows()
    this.element('git-files').focus()
    if (node.entry)
      void this.diff(node.entry, node.staged)
  }

  private keydown(event: KeyboardEvent): void {
    if (event.target !== this.element('git-files'))
      return
    let index = this.rows.findIndex(row => row.node.id === this.selected)
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
    else if (event.key === 'ArrowRight' && row.node.kind !== 'file') {
      if (!this.query && this.collapsed.delete(row.node.id))
        this.refreshRows()
      else if (this.rows[index + 1]?.depth > row.depth)
        index++
    }
    else if (event.key === 'ArrowLeft') {
      if (row.node.kind !== 'file' && !this.query && !this.collapsed.has(row.node.id)) {
        this.collapsed.add(row.node.id)
        this.refreshRows()
      }
      else if (row.parent) {
        index = this.rows.findIndex(item => item.node.id === row.parent)
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
    this.selected = this.rows[index]?.node.id || ''
    this.list.reveal(index)
    this.updateFocus(index)
  }

  private renderRow({ node, depth, position, siblings }: GitTreeRow, index: number): HTMLElement {
    const expanded = Boolean(this.query) || !this.collapsed.has(node.id)
    const { entry, staged } = node
    const status = entry ? changeStatus(entry, staged) : ''
    const title = entry ? `${entry.previousPath ? `${entry.previousPath} → ` : ''}${entry.path}，${statusLabels[status] || status}，${staged ? 'HEAD ↔ 暂存区' : '暂存区 ↔ 磁盘'}` : node.path || node.label
    const open = entry ? iconButton('document', '打开源文件') : undefined
    const action = entry ? iconButton(staged ? 'minus' : 'plus', staged ? '取消暂存' : '暂存更改') : undefined
    if (entry && open && action) {
      open.onclick = () => this.open(entry.path)
      open.disabled = entry.worktree === 'D' || entry.index === 'D' || entry.outsideRename
      action.disabled = this.busy || entry.outsideRename || entry.submodule
      action.onclick = () => void this.perform(root => this.bridge.gitStage(root, entry.path, !staged))
    }
    return createElement(html`<div id=${`git-row-${index}`} class=${`git-tree-row git-${node.kind === 'file' ? 'change' : node.kind}${node.id === this.selected ? ' selected' : ''}`}
      data-path=${node.path} data-kind=${node.kind} data-staged=${String(staged)} data-status=${status || nothing}
      role="treeitem" aria-level=${depth + 1} aria-posinset=${position} aria-setsize=${siblings} aria-selected=${String(node.id === this.selected)}
      aria-expanded=${node.kind !== 'file' ? String(expanded) : nothing} aria-label=${entry ? `${entry.path}，${statusLabels[status] || status}，${staged ? '已暂存' : '未暂存'}` : nothing}
      style=${styleMap({ '--tree-depth': String(depth) })}>
      <button type="button" class="git-file" tabindex="-1" title=${title} @click=${() => this.activate(node)}>
        <span class=${`tree-chevron${expanded ? ' expanded' : ''}`}>${unsafeHTML(node.kind !== 'file' ? icon('chevron') : '')}</span>
        <span class="file-icon git-node-icon">${unsafeHTML(icon(node.kind === 'group' ? 'files' : node.kind === 'folder' ? expanded ? 'folderOpen' : 'folder' : /\.(?:qs|[cm]?[jt]sx?)$/iu.test(node.path) ? 'code' : 'document'))}</span>
        <span class="tree-label">${node.label}</span>
        ${entry && this.mode === 'list' && entry.path.includes('/') ? html`<span class="git-path">${entry.path.slice(0, entry.path.lastIndexOf('/'))}</span>` : nothing}
      </button>${entry ? html`<span class="git-status-letter" title=${statusLabels[status] || status}>${status}</span>${open}${action}` : html`<span class="git-count">${node.count}</span>`}
    </div>`)
  }

  private async switchBranch(root: string, branch: string, create: boolean): Promise<EditorGitState | undefined> {
    let result = await this.bridge.gitSwitch(root, branch, create)
    if (result.status === 'save-required') {
      if (root !== this.root)
        return
      await this.saveAll()
      if (root !== this.root)
        return
      result = await this.bridge.gitSwitch(root, branch, create)
    }
    if (root !== this.root)
      return
    if (result.status === 'switched')
      return result.state
    if (result.status === 'failed')
      throw new Error(result.message)
    if (result.status === 'blocked')
      this.setMessage(result.message, 'warning')
    else this.setMessage(result.status === 'cancelled' ? '已取消切换分支' : '文档仍有未保存内容，请完成保存后重试。')
  }

  private async diff(entry: EditorGitChange, staged: boolean): Promise<void> {
    if (!this.root)
      return
    const generation = ++this.diffGeneration
    const root = this.root
    try {
      if (entry.conflict) {
        this.open(entry.path)
        this.setMessage('打开源文件解决冲突后，再暂存更改。')
        return
      }
      const diff = await this.bridge.gitDiff(root, entry.path, staged)
      if (root === this.root && generation === this.diffGeneration)
        this.showDiff(diff)
    }
    catch (error) {
      if (root === this.root && generation === this.diffGeneration)
        this.setMessage(String(error), true)
    }
  }

  private async perform(action: (root: string) => Promise<EditorGitState | undefined>): Promise<void> {
    if (!this.root || this.busy)
      return
    const generation = this.generation
    this.busy = true
    this.setMessage('正在处理…')
    if (this.state)
      this.render(this.state)
    try {
      const state = await action(this.root)
      if (state && generation === this.generation) {
        this.setMessage('')
        this.render(state)
      }
    }
    catch (error) {
      if (generation === this.generation)
        this.setMessage(String(error), true)
    }
    finally {
      if (generation === this.generation) {
        this.busy = false
        if (this.state)
          this.render(this.state)
      }
    }
  }

  private resizeMessage(): void {
    this.text.style.height = 'auto'
    this.text.style.height = `${Math.min(128, Math.max(32, this.text.scrollHeight + 2))}px`
  }

  private updateCommit(): void {
    this.commit.disabled = this.busy || !this.text.value.trim() || !this.state?.changes.some(stagedChange) || this.state.changes.some(entry => entry.conflict)
  }

  private setMessage(text: string, tone: boolean | 'warning' = false, defaultMessage = false): void {
    this.defaultMessage = defaultMessage
    if (tone === true)
      text = text.replace(/^Error: /u, '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
    this.message.textContent = text
    this.message.classList.toggle('error', tone === true)
    this.message.classList.toggle('warning', tone === 'warning')
    this.message.hidden = !text
  }

  private element<T extends HTMLElement = HTMLElement>(id: string): T {
    return document.getElementById(id) as T
  }
}
