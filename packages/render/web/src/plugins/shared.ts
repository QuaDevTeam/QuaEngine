import type { RenderErrorPayload } from '@quajs/render-core'
import type { QuaWebDomLayerContext } from './core'

type RendererIntentDispatchOptions = Pick<Partial<RenderErrorPayload>, 'message' | 'phase' | 'metadata' | 'pluginName'>

export function applyStyleVars(element: HTMLElement, vars: Record<string, string | number> | undefined): void {
  if (!vars) {
    return
  }
  for (const [name, value] of Object.entries(vars)) {
    element.style.setProperty(name, String(value))
  }
}

export function assignData(element: HTMLElement, name: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    element.setAttribute(name, String(value))
  }
}

export function dispatchRendererIntent(
  context: Pick<QuaWebDomLayerContext, 'controller'>,
  action: () => Promise<void>,
  options: RendererIntentDispatchOptions = {},
): void {
  void Promise.resolve()
    .then(action)
    .catch((error) => {
      void context.controller.reportError(error, {
        message: options.message || 'Renderer intent dispatch failed.',
        phase: options.phase || 'renderer:intent',
        metadata: options.metadata,
        pluginName: options.pluginName,
      })
    })
}
