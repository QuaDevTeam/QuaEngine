import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebRendererSnapshot, RendererActions } from '@quajs/renderer-web'
import type { QuaWebDomRendererHost } from '@quajs/renderer-web/framework-host'
import { createContext, useContext } from 'react'

export interface QuaReactRendererContext {
  host?: QuaWebDomRendererHost
  snapshot?: QuaWebRendererSnapshot
  view?: Readonly<QuaViewProjection>
  actions?: RendererActions
}

export const QuaRendererContext = createContext<QuaReactRendererContext>({})

export function useQuaRenderer(): QuaReactRendererContext {
  return useContext(QuaRendererContext)
}

export function useQuaRendererSnapshot(): QuaWebRendererSnapshot | undefined {
  return useQuaRenderer().snapshot
}

export function useQuaView(): Readonly<QuaViewProjection> | undefined {
  return useQuaRenderer().view
}

export function useRendererActions(): RendererActions | undefined {
  return useQuaRenderer().actions
}
