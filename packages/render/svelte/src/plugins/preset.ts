import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererPlugin } from '@quajs/renderer-web/plugins/core'
import type { InputSvelteRendererPluginOptions } from './input'
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'
import { createInputRendererPlugin } from './input'

export interface VisualNovelSvelteRendererPresetOptions {
  input?: false | InputSvelteRendererPluginOptions
}

export function createVisualNovelRendererPlugins(
  options: VisualNovelSvelteRendererPresetOptions = {},
): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  return [
    ...(options.input === false ? [] : [createInputRendererPlugin(options.input || {})]),
    ...createVisualNovelWebRendererPlugins({ input: false }),
  ]
}
