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
  createBacklogNativeRendererFeature(),
  createGalleryNativeRendererFeature(),
  createSettingsNativeRendererFeature(),
])

export function createDemoNativeHostPlugin(host: QuaNativeHostApi): NativeHostPlugin {
  return new NativeHostPlugin({
    host,
    featureSurfaces: DEMO_NATIVE_FEATURE_SURFACES,
  })
}
