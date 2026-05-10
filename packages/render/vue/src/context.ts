import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection } from '@quajs/render-core'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

export interface RendererActions {
  ready: () => Promise<void>
  sceneReady: (sceneId?: string) => Promise<void>
  click: (payload?: { x?: number, y?: number, target?: string }) => Promise<void>
  advance: (source?: string) => Promise<void>
  selectChoice: (choiceId: string) => Promise<void>
  requestSave: (slotId?: string) => Promise<void>
  requestLoad: (slotId?: string) => Promise<void>
  requestUiOpen: (elementId: string, config?: Record<string, unknown>) => Promise<void>
  requestUiClose: (elementId: string) => Promise<void>
  requestUiUpdate: (elementId: string, config: Record<string, unknown>) => Promise<void>
}

export interface QuaRendererContext {
  pipeline: Ref<Pipeline>
  assets: Ref<QuaAssets | undefined>
  view: Readonly<Ref<QuaViewProjection>>
  assetRevision: Readonly<Ref<number>>
  actions: RendererActions
}

export const QuaRendererContextKey: InjectionKey<QuaRendererContext> = Symbol('QuaRendererContext')

export function useQuaRenderer(): QuaRendererContext {
  const context = inject(QuaRendererContextKey)
  if (!context) {
    throw new Error('QuaRenderer context not found')
  }
  return context
}
