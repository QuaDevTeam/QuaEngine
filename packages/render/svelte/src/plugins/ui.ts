import type {
  UiWebRendererPluginOptions,
  UiWebRenderOnlySurfaceContext,
  UiWebRenderOnlySurfaceFactory,
} from '@quajs/renderer-web/plugins/ui'
import type { QuaSvelteRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { defineSvelteRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export interface UiSvelteRenderOnlySurfaceHandle {
  destroy?: () => void
}

export type UiSvelteRenderOnlySurfaceFactory = (
  root: HTMLElement,
  context: UiWebRenderOnlySurfaceContext,
) => UiSvelteRenderOnlySurfaceHandle | void

export interface UiSvelteRendererPluginOptions extends Omit<UiWebRendererPluginOptions, 'renderOnlySurfaces'> {
  renderOnlySurfaces?: Readonly<Record<string, UiSvelteRenderOnlySurfaceFactory>>
}

export function createUiRendererPlugin(options: UiSvelteRendererPluginOptions = {}): QuaSvelteRendererPlugin {
  const plugin = createUiWebRendererPlugin({
    ...options,
    renderOnlySurfaces: createSvelteRenderOnlySurfaces(options.renderOnlySurfaces),
  })
  return defineSvelteRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-svelte/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

function createSvelteRenderOnlySurfaces(
  surfaces: UiSvelteRendererPluginOptions['renderOnlySurfaces'],
): Readonly<Record<string, UiWebRenderOnlySurfaceFactory>> | undefined {
  if (!surfaces) {
    return undefined
  }
  return Object.fromEntries(Object.entries(surfaces).map(([key, factory]) => [
    key,
    (context: UiWebRenderOnlySurfaceContext) => {
      const handle = factory(context.root, context)
      return {
        destroy: () => handle?.destroy?.(),
      }
    },
  ]))
}
