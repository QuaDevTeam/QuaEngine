import type { EditorBounds, EditorWritingBridge, EditorHostPlugin } from '@quajs/editor-core'
import type { BrowserWindow, IpcMainEvent, UtilityProcess } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dialog, ipcMain, session, shell, utilityProcess, WebContentsView } from 'electron'

export interface State { phase: 'idle' | 'starting' | 'ready' | 'error', error?: string }

/** One lazy, isolated writing workspace. Hidden pages retain drafts and their SSE stream. */
export class NovelWriterHost {
  private worker?: UtilityProcess
  private view?: WebContentsView
  private starting?: Promise<void>
  private state: State = { phase: 'idle' }
  private active = false
  private disposed = false
  private dirty = false
  private bounds: EditorBounds = { x: 0, y: 0, width: 0, height: 0 }
  private counter = 0
  private readonly pending = new Map<number, (state: { running: boolean }) => void>()

  constructor(private readonly window: BrowserWindow, private readonly changed: (state: State) => void, private readonly authoring: Omit<EditorWritingBridge, 'onProjectChange'>) {
    window.webContents.on('did-start-loading', this.workbenchLoading)
    for (const method of ['context', 'capture', 'convert', 'validate', 'apply'] as const) {
      ipcMain.handle(`novel-writer:${method}`, (event, value) => {
        if (this.disposed || this.view?.webContents !== event.sender || event.senderFrame !== event.sender.mainFrame)
          throw new Error('Writing capability unavailable.')
        return (this.authoring[method] as (value: unknown) => unknown)(value)
      })
    }
    ipcMain.on('novel-writer:dirty', this.reportDirty)
  }

  private readonly workbenchLoading = (): void => {
    this.active = false
    this.layout()
  }

  private readonly reportDirty = (event: IpcMainEvent, dirty: unknown): void => {
    if (this.view?.webContents === event.sender && event.senderFrame === event.sender.mainFrame)
      this.dirty = dirty === true
  }

  projectChanged(): void {
    this.view?.webContents?.send('novel-writer:project-changed')
  }

  async present(active: boolean, bounds: EditorBounds): Promise<void> {
    this.active = active
    this.bounds = bounds
    this.layout()
    if (!active && !this.window.webContents.isDestroyed())
      this.window.webContents.focus()
    if (active) {
      await this.start()
      this.layout()
      if (this.active)
        this.view?.webContents.focus()
    }
  }

  resize(bounds: EditorBounds): void {
    this.bounds = bounds
    this.layout()
  }

  command(command: string): boolean {
    if (!this.active || !['undo', 'redo', 'settings', 'save', 'save-all'].includes(command))
      return false
    const contents = this.view?.webContents
    if (!contents || contents.isDestroyed() || !contents.isFocused())
      return false
    if (command === 'undo')
      contents.undo()
    else if (command === 'redo')
      contents.redo()
    else contents.send('novel-writer:command', command)
    return true
  }

  async mayClose(): Promise<boolean> {
    if (!this.worker)
      return true
    const id = ++this.counter
    const state = await new Promise<{ running: boolean }>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error('写作服务未响应，请稍后重试关闭。'))
      }, 5000)
      this.pending.set(id, (value) => {
        clearTimeout(timer)
        resolve(value)
      })
      this.worker!.postMessage({ type: 'state', id })
    })
    if (!state.running && !this.dirty)
      return true
    const result = await dialog.showMessageBox(this.window, {
      type: 'question',
      message: state.running ? 'Novel Writer 正在生成内容' : 'Novel Writer 有尚未保存的修改',
      detail: state.running ? '关闭将中断当前生成。已保存的成果和检查点会保留，重新打开后可以继续；未保存的编辑会丢失。' : '关闭将丢弃未保存的稿件、审核意见或表单修改。',
      buttons: ['继续编辑', '关闭编辑器'],
      defaultId: 0,
      cancelId: 0,
    })
    return result.response === 1
  }

  async dispose(): Promise<void> {
    this.disposed = true
    this.window.webContents.removeListener('did-start-loading', this.workbenchLoading)
    ipcMain.removeListener('novel-writer:dirty', this.reportDirty)
    for (const method of ['context', 'capture', 'convert', 'validate', 'apply'])
      ipcMain.removeHandler(`novel-writer:${method}`)
    this.active = false
    this.closeView()
    const worker = this.worker
    if (!worker)
      return
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        worker.kill()
        resolve()
      }, 8000)
      worker.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
      worker.postMessage({ type: 'shutdown' })
    })
    if (this.worker === worker)
      this.worker = undefined
  }

  private layout(): void {
    if (!this.view || this.window.isDestroyed())
      return
    this.view.setBounds(this.bounds)
    this.view.setVisible(this.active && this.state.phase === 'ready' && this.bounds.width > 0 && this.bounds.height > 0)
  }

  private start(): Promise<void> {
    if (this.disposed)
      return Promise.reject(new Error('写作工作区已关闭。'))
    if (this.view && this.state.phase === 'ready')
      return Promise.resolve()
    this.starting ??= (this.view && this.worker ? this.restorePage() : this.launch()).finally(() => {
      this.starting = undefined
    })
    return this.starting
  }

  private async restorePage(): Promise<void> {
    const contents = this.view!.webContents
    this.publish({ phase: 'starting' })
    try {
      await contents.loadURL(contents.getURL())
      this.publish({ phase: 'ready' })
    }
    catch {
      this.publish({ phase: 'error', error: '写作界面恢复失败，请重试。' })
    }
  }

  private async launch(): Promise<void> {
    this.publish({ phase: 'starting' })
    try {
      const require = createRequire(import.meta.url)
      const worker = utilityProcess.fork(require.resolve('@quajs/editor-novel-writer/desktop'), [], {
        serviceName: 'QuaEngine Novel Writer',
        stdio: 'ignore',
        env: { ...process.env, NODE_ENV: 'production' },
      })
      this.worker = worker
      worker.on('message', (message) => {
        if (this.worker === worker && message.id) {
          this.pending.get(message.id)?.(message.state)
          this.pending.delete(message.id)
        }
      })
      const ready = await new Promise<{ origin: string, token: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('写作工作区启动超时。')), 30000)
        const onMessage = (message: { type: string, origin: string, token: string, message: string }): void => {
          if (message.type !== 'ready' && message.type !== 'error')
            return
          clearTimeout(timer)
          worker.removeListener('message', onMessage)
          if (message.type === 'ready')
            resolve(message)
          else reject(new Error(message.message))
        }
        worker.on('message', onMessage)
        worker.once('exit', () => {
          clearTimeout(timer)
          reject(new Error('写作服务已退出。'))
        })
      })
      if (this.disposed)
        return
      const partition = session.fromPartition(`novel-writer-${worker.pid}`)
      partition.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      partition.setPermissionCheckHandler(() => false)
      partition.webRequest.onBeforeSendHeaders({ urls: [`${ready.origin}/*`] }, (details, callback) => {
        callback({ requestHeaders: { ...details.requestHeaders, Authorization: `Bearer ${ready.token}` } })
      })
      const view = new WebContentsView({ webPreferences: {
        session: partition,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
      } })
      this.view = view
      view.setBackgroundColor('#17191d')
      view.setVisible(false)
      this.window.contentView.addChildView(view)
      const external = (url: string): void => {
        if (/^https?:\/\//u.test(url) && new URL(url).origin !== ready.origin)
          void shell.openExternal(url).catch(() => {})
      }
      view.webContents.setWindowOpenHandler(({ url }) => {
        external(url)
        return { action: 'deny' }
      })
      view.webContents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== ready.origin) {
          event.preventDefault()
          external(url)
        }
      })
      view.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown' || !(input.meta || input.control))
          return
        if (input.key.toLowerCase() === 'r') {
          // Workbench reload must not silently discard a separate writing draft.
          event.preventDefault()
        }
        if (input.shift && input.key.toLowerCase() === 'e') {
          event.preventDefault()
          this.window.webContents.send('editor:command', 'source-workspace')
        }
      })
      view.webContents.on('render-process-gone', () => {
        this.publish({ phase: 'error', error: '写作界面已退出。已保存内容保留，请切回后重试。' })
      })
      worker.once('exit', () => {
        if (this.worker !== worker)
          return
        this.worker = undefined
        for (const resolve of this.pending.values())
          resolve({ running: false })
        this.pending.clear()
        this.closeView()
        if (!this.disposed)
          this.publish({ phase: 'error', error: '写作服务已退出，点击重试可恢复已保存的项目。' })
      })
      await view.webContents.loadURL(`${ready.origin}/?editor=1`)
      this.publish({ phase: 'ready' })
    }
    catch (error) {
      this.worker?.kill()
      this.worker = undefined
      this.closeView()
      this.publish({ phase: 'error', error: error instanceof Error ? error.message : '写作工作区无法启动。' })
      throw error
    }
  }

  private closeView(): void {
    const view = this.view
    this.view = undefined
    if (!view)
      return
    if (!this.window.isDestroyed())
      this.window.contentView.removeChildView(view)
    const contents = view.webContents
    if (contents && !contents.isDestroyed())
      contents.close({ waitForBeforeUnload: false })
  }

  private publish(state: State): void {
    this.state = state
    this.layout()
    this.changed(state)
  }
}

export const novelWriterHostPlugin: EditorHostPlugin<{ window: BrowserWindow, changed: (state: State) => void, authoring: Omit<EditorWritingBridge, 'onProjectChange'> }, NovelWriterHost> = {
  id: 'qua.novel-writer',
  apiVersion: 1,
  activate: context => new NovelWriterHost(context.window, context.changed, context.authoring),
}

export { WritingAuthoring } from './authoring.js'
