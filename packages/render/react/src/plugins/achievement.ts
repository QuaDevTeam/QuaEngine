import type { QuaReactRendererPlugin } from './core'
import { createAchievementWebRendererPlugin } from '@quajs/renderer-web/plugins/achievement'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/achievement'

export function createAchievementRendererPlugin(): QuaReactRendererPlugin {
  const plugin = createAchievementWebRendererPlugin()
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/achievement',
  })
}

export const achievementRendererPlugin = createAchievementRendererPlugin()
