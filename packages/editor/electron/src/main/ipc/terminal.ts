import type { MainServices } from './services.js'
import {
  app,
} from 'electron'

export function registerTerminalIpc(context: Pick<MainServices, 'handle' | 'terminalReset' | 'currentProject' | 'projectOpening' | 'closing' | 'closePending' | 'terminals' | 'runtime' | 'terminalFocused' | 'window'>): void {
  context.handle(
    'editor:terminal-create',
    async (root: string, cols: number, rows: number) => {
      await context.terminalReset
      if (
        root !== (context.currentProject?.root ?? '')
        || context.projectOpening
        || context.closing
        || context.closePending
      ) {
        throw new Error('项目正在切换，请稍后重试。')
      }
      return context.terminals.create(context.currentProject?.root ?? app.getPath('home'), cols, rows, context.runtime.environment())
    },
  )
  context.handle('editor:terminal-write', (id: string, data: string) =>
    context.terminals.action('write', id, data))
  context.handle('editor:terminal-resize', (id: string, cols: number, rows: number) =>
    context.terminals.action('resize', id, cols, rows))
  context.handle('editor:terminal-ack', (id: string, sequence: number) =>
    context.terminals.action('acknowledge', id, sequence))
  context.handle('editor:terminal-close', (id: string) =>
    context.terminals.action('close', id))
  context.handle('editor:terminal-focus', (focused: boolean) => {
    context.terminalFocused = focused === true
    context.window.webContents.setIgnoreMenuShortcuts(context.terminalFocused)
  })
}
