import type { QuaAssets } from '@quajs/assets'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection } from '@quajs/render-core'
import type { QuaWebRendererController, RendererActions } from '@quajs/renderer-web'
import type { SaveSlotDataSource } from '@quajs/renderer-web/save-preview'
import type { InjectionKey, Ref } from 'vue'
import { inject } from 'vue'

export type { RendererActions } from '@quajs/renderer-web'
export type { SaveSlotDataSource } from '@quajs/renderer-web/save-preview'

export interface QuaRendererContext {
  web: QuaWebRendererController
  pipeline: Ref<Pipeline>
  assets: Ref<QuaAssets | undefined>
  view: Readonly<Ref<QuaViewProjection>>
  rendererLayerIds: Readonly<Ref<readonly string[]>>
  assetRevision: Readonly<Ref<number>>
  saveSlots: Ref<SaveSlotDataSource | undefined>
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
