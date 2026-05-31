import type { RendererPlugin } from '@quajs/render-core'
import type { AudioWebRendererPluginOptions } from '@quajs/renderer-web/plugins/audio'
import { createAudioWebRendererPlugin } from '@quajs/renderer-web/plugins/audio'

export * from '@quajs/renderer-web/plugins/audio'

export type AudioReactRendererPluginOptions = AudioWebRendererPluginOptions

export function createAudioRendererPlugin(options: AudioReactRendererPluginOptions = {}): RendererPlugin {
  const plugin = createAudioWebRendererPlugin(options)
  return {
    ...plugin,
    name: '@quajs/renderer-react/audio',
  }
}

export const audioRendererPlugin = createAudioRendererPlugin()
