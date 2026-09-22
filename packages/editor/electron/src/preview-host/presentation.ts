import type { EditorBounds, PreviewState } from '@quajs/editor-core'
import type { WebContents, WebContentsView } from 'electron'
import type { NativePreviewSurface } from './native/surface.js'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'

export class PreviewPresentation {
  private popout?: BrowserWindow
  private view?: WebContentsView
  private nativeSurface?: NativePreviewSurface
  private parent: BrowserWindow
  private state: PreviewState = { phase: 'idle' }
  private bounds: EditorBounds = { x: 0, y: 0, width: 0, height: 0 }
  constructor(private readonly editor: BrowserWindow, private readonly changed: () => void, private readonly projectName: () => string = () => 'QuaEngine') {
    this.parent = editor
    this.observeWindow(editor)
  }

  get detached(): boolean {
    return Boolean(this.popout && !this.popout.isDestroyed())
  }

  setNativeSurface(surface?: NativePreviewSurface): void {
    this.nativeSurface = surface
    this.layout()
  }

  accepts(contents: WebContents): boolean {
    return this.detached && contents === this.popout!.webContents
  }

  setView(view?: WebContentsView): void {
    if (this.view?.webContents && !this.view.webContents.isDestroyed() && !this.parent.isDestroyed()) {
      this.parent.contentView.removeChildView(this.view)
    }
    this.view = view?.webContents && !view.webContents.isDestroyed() ? view : undefined
    this.parent = this.popout || this.editor
    if (this.view && !this.parent.isDestroyed()) {
      const view = this.view
      this.parent.contentView.addChildView(view)
      view.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape' && this.popout && (this.popout.isFullScreen() || this.popout.isSimpleFullScreen())) {
          event.preventDefault()
          if (process.platform === 'darwin')
            this.popout.setSimpleFullScreen(false)
          else this.popout.setFullScreen(false)
        }
      })
    }
    this.layout()
  }

  setBounds(bounds: EditorBounds): void {
    this.bounds = bounds
    this.layout()
  }

  update(state: PreviewState): void {
    this.state = state
    if (this.detached && !this.popout!.webContents.isDestroyed())
      this.popout!.webContents.send('editor:preview-changed', { ...state, detached: true })
    this.layout()
  }

  async present(mode: 'embedded' | 'window' | 'fullscreen'): Promise<void> {
    if (!['embedded', 'window', 'fullscreen'].includes(mode))
      throw new Error('无效的预览窗口模式。')
    if (this.editor.isDestroyed())
      return
    if (mode === 'embedded') {
      this.popout?.close()
      return
    }
    if (!this.popout) {
      const popout = new BrowserWindow({ width: 1120, height: 700, minWidth: 480, minHeight: 320, show: false, frame: process.platform === 'darwin', acceptFirstMouse: true, backgroundColor: '#101216', title: `${this.projectName()} (Dev)`, webPreferences: { preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)), nodeIntegration: false, sandbox: true, contextIsolation: true } })
      popout.on('page-title-updated', event => event.preventDefault())
      this.popout = popout
      this.observeWindow(popout)
      popout.on('close', () => {
        if (this.view?.webContents && !this.view.webContents.isDestroyed()) {
          popout.contentView.removeChildView(this.view)
          if (!this.editor.isDestroyed())
            this.editor.contentView.addChildView(this.view)
        }
        this.parent = this.editor
        this.popout = undefined
        this.layout()
        this.changed()
      })
      popout.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && input.key === 'Escape' && (popout.isFullScreen() || popout.isSimpleFullScreen())) {
          event.preventDefault()
          if (process.platform === 'darwin')
            popout.setSimpleFullScreen(false)
          else popout.setFullScreen(false)
        }
      })
      popout.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      popout.webContents.on('will-navigate', event => event.preventDefault())
      if (this.view?.webContents && !this.view.webContents.isDestroyed() && !this.parent.isDestroyed()) {
        this.parent.contentView.removeChildView(this.view)
        popout.contentView.addChildView(this.view)
      }
      this.parent = popout
      await popout.loadFile(fileURLToPath(new URL('../../ui/dist/preview.html', import.meta.url)))
      if (this.popout !== popout || popout.isDestroyed())
        return
      this.update(this.state)
    }
    this.popout.show()
    this.popout.focus()
    if (process.platform === 'darwin')
      this.popout.setSimpleFullScreen(mode === 'fullscreen')
    else this.popout.setFullScreen(mode === 'fullscreen')
    this.layout()
    this.changed()
  }

  close(): void {
    this.popout?.close()
  }

  private observeWindow(window: BrowserWindow): void {
    const layout = () => this.layout()
    window.on('resize', layout)
    window.on('show', layout)
    window.on('hide', layout)
    window.on('minimize', layout)
    window.on('restore', layout)
  }

  private layout(): void {
    if (this.parent.isDestroyed())
      return
    const hidden = this.state.reloading || this.state.renderError || this.state.phase !== 'running' || !this.parent.isVisible() || this.parent.isMinimized()
    const [width, height] = this.parent.getContentSize()
    const bounds = hidden ? { x: 0, y: 0, width: 0, height: 0 } : this.popout ? { x: 0, y: 36, width, height: Math.max(0, height - 36) } : this.bounds
    if (this.view?.webContents && !this.view.webContents.isDestroyed())
      this.view.setBounds(bounds)
    this.nativeSurface?.layout(this.parent, bounds)
  }
}
