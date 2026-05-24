import type { RendererPlugin } from '@quajs/render-core'
import type { QuaWebDomRendererPlugin } from '@quajs/renderer-web/plugins/core'
import type { InputReactRendererPluginOptions } from './input'
import { createVisualNovelWebRendererPlugins } from '@quajs/renderer-web/plugins/preset'
import { createInputRendererPlugin } from './input'

export interface VisualNovelReactRendererPresetOptions {
  input?: false | InputReactRendererPluginOptions
}

export function createVisualNovelRendererPlugins(
  options: VisualNovelReactRendererPresetOptions = {},
): Array<QuaWebDomRendererPlugin | RendererPlugin> {
  return [
    ...(options.input === false ? [] : [createInputRendererPlugin(options.input || {})]),
    ...createVisualNovelWebRendererPlugins({ input: false }),
  ]
}
