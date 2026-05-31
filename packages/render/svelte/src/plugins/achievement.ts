import type { QuaSvelteRendererPlugin } from './core'
import { createAchievementWebRendererPlugin } from '@quajs/renderer-web/plugins/achievement'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/achievement'

export function createAchievementRendererPlugin(): QuaSvelteRendererPlugin {
  const plugin = createAchievementWebRendererPlugin()
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/achievement',
  })
}

export const achievementRendererPlugin = createAchievementRendererPlugin()
