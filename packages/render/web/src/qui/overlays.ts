import type { QuaAssets } from '@quajs/assets'
import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler'
import type { Pipeline } from '@quajs/pipeline'
import type { QuaViewProjection, UiFeatureSurfaceEntry, UiFeatureSurfaceOverlay } from '@quajs/render-core'
import { createUiFeatureSurfaceOverlays, resolveUiOverlayStackPlacement, viewAllowsHudChrome } from '@quajs/render-core'
import { registerQuiGamepadHost } from './gamepad'
import { createQuiWebSurface } from './surface'

export interface QuiWebOverlayHostOptions {
  container: HTMLElement
  pipeline: Pipeline
  assets?: QuaAssets
  /** Explicit opt-in. Unregistered surface keys are left to other renderer plugins. */
  surfaceKeys: readonly string[]
  features?: readonly UiFeatureSurfaceEntry[]
}

/** Framework-neutral lifecycle, asset leases and stack placement for QUI overlays. */
export function createQuiWebOverlayHost(options: QuiWebOverlayHostOptions) {
  const unregisterGamepadHost = registerQuiGamepadHost(options.pipeline, options.container)
  const surfaces = new Map<string, { host: HTMLElement, renderer: ReturnType<typeof createQuiWebSurface> }>()
  return {
    update(view: Readonly<QuaViewProjection>) {
      const overlays: UiFeatureSurfaceOverlay[] = [
        ...Object.entries(view.ui.overlays || {}).flatMap(([elementId, overlay]) =>
          overlay.surface && options.surfaceKeys.includes(overlay.surface.key)
            ? [{ ...overlay, renderMode: 'render-only' as const, elementId, surface: overlay.surface }]
            : []),
        ...createUiFeatureSurfaceOverlays(view as unknown as Record<string, unknown>, options.features),
      ]
      const seen = new Set<string>()
      for (const overlay of overlays) {
        if (overlay.visible === false || !view.ui.visible || !overlay.surface.root)
          continue
        seen.add(overlay.elementId)
        let surface = surfaces.get(overlay.elementId)
        if (!surface) {
          const container = document.createElement('div')
          container.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
          container.dataset.quiSurface = overlay.elementId
          options.container.append(container)
          surface = { host: container, renderer: createQuiWebSurface({ ...options, container, elementId: overlay.elementId }) }
          surfaces.set(overlay.elementId, surface)
        }
        const anchor = overlay.surface.safeAreaAnchor
        if (anchor && anchor.length === 2 && anchor.every(Number.isFinite)) {
          const displacement = (axis: string, extent: string, factor: number) =>
            `calc((var(--qua-layout-safe-${axis}, 0) - var(--qua-layout-aspect-safe-${axis}, 0) + (var(--qua-layout-safe-${extent}, 0) - var(--qua-layout-aspect-safe-${extent}, 0)) * ${Math.max(0, Math.min(1, factor))}) * 1px)`
          surface.host.style.translate = `${displacement('x', 'width', anchor[0])} ${displacement('y', 'height', anchor[1])}`
        }
        else {
          surface.host.style.translate = ''
        }
        const placement = resolveUiOverlayStackPlacement({ overlayStack: overlay.overlayStack, stackPriority: overlay.stackPriority, zIndex: overlay.zIndex })
        surface.host.style.zIndex = String(placement.stackPriority * 10000 + placement.zIndex)
        surface.host.toggleAttribute('data-qui-gamepad-modal', overlay.interactive === true || !viewAllowsHudChrome(view))
        surface.renderer.update(overlay.surface.root as NativeUiSurfaceNodeProjection)
      }
      for (const [id, surface] of surfaces) {
        if (!seen.has(id)) {
          surface.renderer.dispose()
          surface.host.remove()
          surfaces.delete(id)
        }
      }
    },
    dispose() {
      unregisterGamepadHost()
      for (const surface of surfaces.values()) {
        surface.renderer.dispose()
        surface.host.remove()
      }
      surfaces.clear()
    },
  }
}
