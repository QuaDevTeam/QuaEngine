import type { EditorWindowState } from '@quajs/editor-core'
import type { BrowserWindow } from 'electron'
import { showApplicationMenu } from './menu.js'

/** Window state belongs to the host; the titlebar only displays it and sends intents. */
export class WindowChrome {
  constructor(private readonly window: BrowserWindow, changed: (state: EditorWindowState) => void) {
    const publish = (): void => {
      if (!window.isDestroyed())
        changed(this.state())
    }
    window.on('maximize', publish)
    window.on('unmaximize', publish)
    window.on('enter-full-screen', publish)
    window.on('leave-full-screen', publish)
    window.on('focus', publish)
    window.on('blur', publish)
    window.on('restore', publish)
  }

  state(): EditorWindowState {
    return {
      platform: process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux',
      maximized: !this.window.isDestroyed() && this.window.isMaximized(),
      fullscreen: !this.window.isDestroyed() && this.window.isFullScreen(),
      focused: !this.window.isDestroyed() && this.window.isFocused(),
    }
  }

  perform(action: unknown, menuPosition?: unknown): void | Promise<void> {
    if (this.window.isDestroyed())
      return
    switch (action) {
      case 'minimize':
        this.window.minimize()
        break
      case 'maximize':
        if (this.window.isFullScreen())
          this.window.setFullScreen(false)
        else if (this.window.isMaximized())
          this.window.unmaximize()
        else this.window.maximize()
        break
      case 'fullscreen':
        this.window.setFullScreen(!this.window.isFullScreen())
        break
      // Reuse the existing unsaved-document dialog and preview/process cleanup.
      case 'close':
        this.window.close()
        break
      case 'menu':
        return showApplicationMenu(this.window, menuPosition)
      default: throw new Error('无效的窗口操作。')
    }
  }
}
