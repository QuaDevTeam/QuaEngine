import type {
  UiWebRendererPluginOptions,
  UiWebRenderOnlySurfaceContext,
  UiWebRenderOnlySurfaceFactory,
} from '@quajs/renderer-web/plugins/ui'
import type { ComponentType } from 'react'
import type { QuaReactRendererPlugin } from './core'
import { createUiWebRendererPlugin } from '@quajs/renderer-web/plugins/ui'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { defineReactRendererPlugin } from './core'

export * from '@quajs/renderer-web/plugins/ui'

export interface UiReactRenderOnlySurfaceProps extends UiWebRenderOnlySurfaceContext {}

export type UiReactRenderOnlySurfaceComponent = ComponentType<UiReactRenderOnlySurfaceProps>

export interface UiReactRendererPluginOptions extends Omit<UiWebRendererPluginOptions, 'renderOnlySurfaces'> {
  renderOnlySurfaces?: Readonly<Record<string, UiReactRenderOnlySurfaceComponent>>
}

export function createUiRendererPlugin(options: UiReactRendererPluginOptions = {}): QuaReactRendererPlugin {
  const plugin = createUiWebRendererPlugin({
    ...options,
    renderOnlySurfaces: createReactRenderOnlySurfaces(options.renderOnlySurfaces),
  })
  return defineReactRendererPlugin({
    ...plugin,
    name: '@quajs/renderer-react/ui',
  })
}

export const uiRendererPlugin = createUiRendererPlugin()

function createReactRenderOnlySurfaces(
  surfaces: UiReactRendererPluginOptions['renderOnlySurfaces'],
): Readonly<Record<string, UiWebRenderOnlySurfaceFactory>> | undefined {
  if (!surfaces) {
    return undefined
  }
  return Object.fromEntries(Object.entries(surfaces).map(([key, Component]) => [
    key,
    (context: UiWebRenderOnlySurfaceContext) => {
      const root = createRoot(context.root)
      root.render(createElement(Component, context))
      return {
        destroy: () => root.unmount(),
      }
    },
  ]))
}
