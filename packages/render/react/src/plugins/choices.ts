import type { QuaReactRendererPlugin } from './core'
import { createChoicesWebRendererPlugin } from '@quajs/renderer-web/plugins/choices'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/choices'

export function createChoicesRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createChoicesWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/choices',
  })
}

export const choicesRendererPlugin = createChoicesRendererPlugin()
