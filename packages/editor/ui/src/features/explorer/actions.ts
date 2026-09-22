import type { EditorBridge, EditorFileMenuAction, EditorFileOperation, EditorProject } from '@quajs/editor-core'
import type { FileTree } from './tree'
import { element as createElement, html as template } from '@quajs/editor-controls'
import { html, render } from 'lit'

const parentPath = (path: string): string => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1)
const join = (directory: string, name: string): string => directory ? `${directory}/${name}` : name

export class ExplorerActions {
  private project?: EditorProject
  private clipboard?: { root: string, path: string, cut: boolean }
  private readonly dialog = createElement<HTMLDialogElement>(template`<dialog></dialog>`)
  private submit?: (value: string) => Promise<void>
  private busy = false
  constructor(private readonly tree: FileTree, private readonly bridge: EditorBridge, private readonly mutate: (operation: EditorFileOperation) => Promise<boolean>, private readonly changed: () => void, private readonly error: (error: unknown) => void, private readonly status: (text: string) => void) {
    this.dialog.id = 'file-operation-dialog'
    render(html`<form><h2 id="file-operation-title"></h2><input id="file-operation-name" aria-labelledby="file-operation-title" autocomplete="off" required><p id="file-operation-error" role="alert"></p><div><button type="button" id="file-operation-cancel">取消</button><button type="submit" id="file-operation-submit">确定</button></div></form>`, this.dialog)
    document.body.append(this.dialog)
    this.dialog.querySelector('#file-operation-cancel')!.addEventListener('click', () => this.dialog.close())
    this.dialog.addEventListener('cancel', (event) => {
      if (this.busy)
        event.preventDefault()
    })
    this.dialog.addEventListener('close', () => {
      this.changed()
      if (document.activeElement === document.body || this.dialog.contains(document.activeElement))
        this.tree.host.focus()
    })
    this.dialog.querySelector('form')!.onsubmit = (event) => {
      event.preventDefault()
      if (this.busy || !this.submit)
        return
      const value = this.dialog.querySelector<HTMLInputElement>('input')!.value.trim()
      if (!value)
        return
      if (value.includes('/') || value.includes('\\')) {
        this.dialog.querySelector('#file-operation-error')!.textContent = '请输入文件名，不能包含路径分隔符。'
        return
      }
      this.busy = true
      this.dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = true)
      void this.submit(value).then(() => this.dialog.close()).catch(error => this.dialog.querySelector('#file-operation-error')!.textContent = this.message(error)).finally(() => {
        this.busy = false
        this.dialog.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.disabled = false)
      })
    }
  }

  update(project: EditorProject): void {
    if (this.project?.root !== project.root) {
      this.clipboard = undefined
      if (this.dialog.open)
        this.dialog.close()
    }
    this.project = project
  }

  async context(path: string): Promise<void> {
    const root = this.project?.root
    if (!root)
      return
    const action = await this.bridge.fileMenu(root, path, Boolean(this.clipboard?.root === root))
    if (action && root === this.project?.root)
      await this.action(action, path)
  }

  async action(action: EditorFileMenuAction, path = this.tree.selection()): Promise<void> {
    const project = this.project
    if (!project || this.busy)
      return
    const directory = project.directories.includes(path) ? path : parentPath(path)
    if (action === 'new-file' || action === 'new-folder' || action === 'rename') {
      if (action === 'rename' && !path)
        return
      this.prompt(action === 'rename' ? '重命名' : action === 'new-file' ? '新建文件' : '新建文件夹', action === 'rename' ? baseName(path) : action === 'new-file' ? 'untitled.qs' : '新建文件夹', async (name) => {
        if (project.root !== this.project?.root)
          throw new Error('项目已切换。')
        const destination = join(action === 'rename' ? parentPath(path) : directory, name)
        if (action === 'rename' && destination === path)
          return
        await this.mutate(action === 'rename' ? { kind: 'move', path, destination } : { kind: action === 'new-file' ? 'create-file' : 'create-directory', destination })
      })
    }
    else if ((action === 'copy' || action === 'cut') && path) {
      this.clipboard = { root: project.root, path, cut: action === 'cut' }
      this.status(`${action === 'cut' ? '已剪切' : '已复制'} ${path}`)
    }
    else if (action === 'paste' && this.clipboard?.root === project.root) {
      const source = this.clipboard
      let name = baseName(source.path)
      if (!source.cut) {
        const occupied = new Set([...project.entries.map(entry => entry.path), ...project.directories])
        const extension = !project.directories.includes(source.path) && name.includes('.') ? name.slice(name.lastIndexOf('.')) : ''
        const stem = extension ? name.slice(0, -extension.length) : name
        for (let suffix = 1; occupied.has(join(directory, name)); suffix++) name = `${stem} copy${suffix > 1 ? ` ${suffix}` : ''}${extension}`
      }
      if (await this.mutate({ kind: source.cut ? 'move' : 'copy', path: source.path, destination: join(directory, name) }) && source.cut)
        this.clipboard = undefined
    }
    else if (action === 'delete' && path) {
      await this.mutate({ kind: 'delete', path })
    }
    else if (action === 'copy-path') {
      await navigator.clipboard.writeText(path)
    }
    else if (action === 'reveal' && path) {
      await this.bridge.revealFile(project.root, path)
    }
  }

  async drop(path: string, directory: string): Promise<void> {
    if (!this.project || this.busy || directory === parentPath(path))
      return
    await this.mutate({ kind: 'move', path, destination: join(directory, baseName(path)) })
  }

  run(action: EditorFileMenuAction): void {
    void this.action(action).catch(this.error)
  }

  private prompt(title: string, value: string, submit: (value: string) => Promise<void>): void {
    this.submit = submit
    this.dialog.querySelector('#file-operation-title')!.textContent = title
    this.dialog.querySelector('#file-operation-error')!.textContent = ''
    const input = this.dialog.querySelector<HTMLInputElement>('input')!
    input.value = value
    this.dialog.showModal()
    this.changed()
    input.focus()
    input.setSelectionRange(0, value.lastIndexOf('.') > 0 ? value.lastIndexOf('.') : value.length)
  }

  private message(error: unknown): string {
    return String(error).replace(/^Error: /u, '').replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
  }
}
