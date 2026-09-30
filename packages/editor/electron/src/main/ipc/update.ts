import type { MainServices } from './services.js'

export function registerUpdateIpc(context: Pick<MainServices, 'handle' | 'release' | 'documentDirty' | 'pluginOperation' | 'projectOpening' | 'closing' | 'closePending' | 'previews'>): void {
  context.handle('editor:update-state', () => context.release.snapshot())
  context.handle('editor:update-check', () => context.release.check())
  context.handle('editor:update-download', () => context.release.downloadEditorUpdate())
  let installing = false
  context.handle('editor:update-install', async () => {
    if (installing)
      return
    installing = true
    try {
      if (context.documentDirty || context.pluginOperation || context.projectOpening || context.closing || context.closePending)
        throw new Error('请先保存文档，并等待当前操作结束。')
      await context.previews.stop()
      await context.release.installEditorUpdate()
    }
    finally { installing = false }
  })
}
