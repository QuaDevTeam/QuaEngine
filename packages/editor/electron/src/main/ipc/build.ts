import type { PreviewTarget } from '@quajs/editor-core'
import type { MainServices } from './services.js'
import { shell } from 'electron'

export function registerBuildIpc(context: MainServices): void {
  context.handle('editor:build-state', () => context.build.snapshot())
  context.handle('editor:build-cancel', () => context.build.cancel())
  context.handle('editor:build-reveal', () => {
    const state = context.build.snapshot()
    if (state?.root !== context.currentProject?.root || state?.phase !== 'completed' || !state.artifact)
      throw new Error('当前项目没有已完成的打包产物。')
    shell.showItemInFolder(state.artifact)
  })
  context.handle('editor:build-project', async (root: string, target: PreviewTarget) => {
    if (target !== 'web' && target !== 'native')
      throw new Error('无效的打包目标。')
    if (!context.currentProject || root !== context.currentProject.root || context.currentProject.pluginProject || context.projectOpening || context.pluginOperation || context.closing || context.closePending || context.documentDirty || context.build.busy || context.fileOperationBusy)
      throw new Error('请先保存所有文档，并等待当前项目操作结束。')
    await context.ensureRuntime()
    if (root !== context.currentProject?.root || context.documentDirty || context.pluginOperation || context.projectOpening || context.closing || context.closePending)
      throw new Error('项目或文档已变化，请保存后重新打包。')
    context.pluginOperation = true
    try {
      await context.previews.stop()
      await context.build.start(root, target, context.runtime.environment())
    }
    finally { context.pluginOperation = false }
  })
}
