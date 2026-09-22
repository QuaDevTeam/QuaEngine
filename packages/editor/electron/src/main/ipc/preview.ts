import type {
  EditorBounds,
  PreviewCommand,
  PreviewPointer,
  PreviewTarget,
} from '@quajs/editor-core'
import type { MainServices } from './services.js'
import { randomUUID } from 'node:crypto'
import { validateAnimationSample, validateDebugRequest, validateStorageRequest } from '@quajs/editor-core'

import { inspectNode, inspectTree } from '../../preview-host/inspector.js'

export function registerPreviewIpc(context: Pick<MainServices, 'handle' | 'currentProject' | 'projectOpening' | 'pluginOperation' | 'ensureRuntime' | 'closing' | 'closePending' | 'previews' | 'presentation' | 'storageSession' | 'window' | 'bounds'>): void {
  context.handle('editor:preview-start', async (target: PreviewTarget) => {
    if (target !== 'web' && target !== 'native')
      throw new Error('Unknown preview target.')
    if (!context.currentProject)
      throw new Error('请先打开项目。')
    const root = context.currentProject.root
    if (context.projectOpening || context.pluginOperation || context.currentProject.pluginProject)
      throw new Error('当前项目无法启动预览。')
    await context.ensureRuntime()
    if (context.currentProject?.root !== root || context.projectOpening || context.closing || context.closePending)
      throw new Error('项目已切换。')
    const options = context.currentProject.targets[target]
    if (!options.enabled || !options.script)
      throw new Error(options.reason || '预览目标不可用。')
    await context.previews.start({
      target,
      projectRoot: context.currentProject.root,
      script: options.script,
      buildRevision: randomUUID(),
    })
  })
  context.handle(
    'editor:preview-command',
    async (id: string, command: PreviewCommand) => {
      if (
        !command
        || !['status', 'step', 'seek', 'debug', 'animation-scene', 'animation-sample', 'animation-release'].includes(command.action)
        || (command.action === 'seek'
          && (typeof command.path !== 'string'
            || command.path.length > 4096
            || !Number.isSafeInteger(command.stepIndex)
            || command.stepIndex < 0))
      ) {
        throw new Error('无效的预览命令。')
      }
      if (command.action.startsWith('animation-') && context.previews.getSnapshot().identity?.target !== 'web')
        throw new Error('动画场景预览仅支持 Web。')
      if (command.action === 'animation-sample')
        validateAnimationSample(command.sample)
      if (command.action === 'debug') {
        if (context.previews.getSnapshot().identity?.target !== 'web')
          throw new Error('场景调试仅支持 Web。')
        command = { action: 'debug', request: validateDebugRequest(command.request) }
      }
      return context.previews.command(id, command)
    },
  )
  context.handle('editor:preview-reload', () => context.previews.reload())
  context.handle('editor:preview-mute', (muted: boolean) => {
    if (typeof muted !== 'boolean')
      throw new Error('无效的预览静音设置。')
    return context.previews.controller.setMuted(muted)
  })
  context.handle(
    'editor:preview-present',
    (mode: 'embedded' | 'window' | 'fullscreen') => context.presentation.present(mode),
  )
  context.handle('editor:preview-performance', async (id: string, enabled: boolean) => {
    if (typeof enabled !== 'boolean' || !context.previews.isCurrentSession(id))
      return undefined
    const result = await context.previews.getHandle(id).performance?.(enabled)
    if (!result || !context.previews.isCurrentSession(id))
      return undefined
    return {
      ...result,
      sessionId: id,
      target: context.previews.controller.getSnapshot().identity!.target,
      timestamp: Date.now(),
    }
  })
  context.handle('editor:preview-inspect', async (id: string) => {
    const result = await inspectTree(context.previews.getHandle(id))
    if (!context.previews.isCurrentSession(id))
      throw new Error('预览已更新。')
    return result
  })
  context.handle('editor:preview-storage', async (id: string, input: unknown) => {
    const request = validateStorageRequest(input)
    if (context.storageSession === id || context.previews.getSnapshot().reloading)
      throw new Error('存储查询正在进行，或预览正在刷新。')
    const handle = context.previews.getHandle(id)
    if (!handle.storage)
      throw new Error('此预览不支持存储检查。')
    context.storageSession = id
    try {
      const result = await handle.storage(request)
      if (!context.previews.isCurrentSession(id) || context.previews.getSnapshot().reloading)
        throw new Error('预览已更新。')
      if (JSON.stringify(result).length > 1024 * 1024)
        throw new Error('存储结果超过 1 MB 限制。')
      return result
    }
    finally {
      if (context.storageSession === id)
        context.storageSession = undefined
    }
  })
  context.handle('editor:preview-inspect-node', async (id: string, node: number) => {
    const result = await inspectNode(context.previews.getHandle(id), node)
    if (!context.previews.isCurrentSession(id))
      throw new Error('预览已更新。')
    return result
  })
  context.handle('editor:preview-stop', () => context.previews.stop())
  context.handle('editor:preview-state', () => ({
    ...context.previews.getSnapshot(),
    detached: context.presentation.detached,
  }))
  context.handle('editor:preview-bounds', (next: EditorBounds) => {
    if (
      !next
      || ![next.x, next.y, next.width, next.height].every(Number.isFinite)
    ) {
      throw new Error('Invalid preview bounds.')
    }
    const [width, height] = context.window.getContentSize()
    const x = Math.min(width, Math.max(0, Math.round(next.x)))
    const y = Math.min(height, Math.max(0, Math.round(next.y)))
    context.bounds = {
      x,
      y,
      width: Math.min(width - x, Math.max(0, Math.round(next.width))),
      height: Math.min(height - y, Math.max(0, Math.round(next.height))),
    }
    context.presentation.setBounds(context.bounds)
  })
  context.handle(
    'editor:preview-pointer',
    async (id: string, event: PreviewPointer) => {
      if (!context.previews.isCurrentSession(id))
        return
      try {
        await context.previews.getHandle(id).pointer?.(event)
      }
      catch (error) {
        if (context.previews.isCurrentSession(id))
          throw error
      }
    },
  )
}
