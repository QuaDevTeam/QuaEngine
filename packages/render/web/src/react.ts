import type { QuaWebRendererController, QuaWebRendererSnapshot } from './controller'

export interface ReactRendererStoreAdapter {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => QuaWebRendererSnapshot
  getServerSnapshot: () => QuaWebRendererSnapshot
}

export function createReactRendererStoreAdapter(controller: QuaWebRendererController): ReactRendererStoreAdapter {
  return {
    subscribe: listener => controller.subscribe(() => listener()),
    getSnapshot: () => controller.getSnapshot(),
    getServerSnapshot: () => controller.getSnapshot(),
  }
}
