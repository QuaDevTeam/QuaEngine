import type { MainServices } from './services.js'

export function registerWindowIpc(context: Pick<MainServices, 'handle' | 'chrome'>): void {
  context.handle('editor:window-state', () => context.chrome.state())
  context.handle('editor:window-action', (action: unknown, menuPosition: unknown) => context.chrome.perform(action, menuPosition))
}
