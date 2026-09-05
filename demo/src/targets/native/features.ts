import { demoPanelRect } from '../../game/ui-presentation'
import type { NativeRendererFeatureSurfaceEntry } from '@quajs/engine-native'
import type { QuaNativeHostApi } from '@quajs/native-contracts'
import {
  createAchievementNativeRendererFeature,
} from '@quajs/plugin-achievement/native'
import { createBacklogNativeRendererFeature } from '@quajs/plugin-backlog/native'
import { createGalleryNativeRendererFeature } from '@quajs/plugin-gallery/native'
import { createSettingsNativeRendererFeature } from '@quajs/plugin-settings/native'
import { NativeHostPlugin } from '@quajs/engine-native'

export const DEMO_NATIVE_FEATURE_SURFACES: readonly NativeRendererFeatureSurfaceEntry[] = Object.freeze([
  createAchievementNativeRendererFeature(),
  createBacklogNativeRendererFeature({ density: 'compact', resolvePanelBounds: resolveDemoFeaturePanel }),
  createGalleryNativeRendererFeature({ layout: 'grid' }),
  createSettingsNativeRendererFeature({ resolvePanelBounds: resolveDemoFeaturePanel }),
])

export function createDemoNativeHostPlugin(host: QuaNativeHostApi): NativeHostPlugin {
  return new NativeHostPlugin({
    host,
    featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
  })
}

function resolveDemoFeaturePanel(
  context: { view: Readonly<Record<string, unknown>>, logicalWidth: number, logicalHeight: number },
  preferred: { x: number, y: number, width: number, height: number },
) {
  const view = context.view as { dialogue?: { visible?: boolean }, ui?: { overlays?: Record<string, { surface?: { root?: { children?: { id?: string }[] } } }> } }
  const titleSurface = view.ui?.overlays?.['native-app-shell']?.surface?.root?.children?.some(node => node.id === 'native-title-surface')
  if (titleSurface || !view.dialogue?.visible) return preferred
  return demoPanelRect(980, Math.min(660, preferred.height), true, context.logicalWidth, context.logicalHeight)
}
