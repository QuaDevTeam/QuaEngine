import type { QuaReactRendererPlugin } from './core'
import { createBacklogWebRendererPlugin } from '@quajs/renderer-web/plugins/backlog'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/backlog'

export function createBacklogRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createBacklogWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/backlog',
  })
}

export const backlogRendererPlugin = createBacklogRendererPlugin()
