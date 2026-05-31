import type { RenderErrorPayload } from '@quajs/render-core'
import type { QuaRendererContext } from '../../context'

type RendererIntentDispatchOptions = Pick<Partial<RenderErrorPayload>, 'message' | 'phase' | 'metadata' | 'pluginName'>

export function dispatchVueRendererIntent(
  renderer: Pick<QuaRendererContext, 'web'>,
  action: () => Promise<void>,
  options: RendererIntentDispatchOptions = {},
): void {
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      void renderer.web.reportError(error, {
        message: options.message || 'Vue renderer intent dispatch failed.',
        phase: options.phase || 'vue-renderer:intent',
        metadata: options.metadata,
        pluginName: options.pluginName,
      })
    })
}
