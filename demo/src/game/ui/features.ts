import type { UiFeatureSurfaceEntry } from '@quajs/render-core'
import { createAssetLoadingUiSurfaceFeature } from '@quajs/plugin-asset-loading/surface'
import {
  createAchievementUiSurfaceFeature,
} from '@quajs/plugin-achievement/surface'
import { createBacklogUiSurfaceFeature } from '@quajs/plugin-backlog/surface'
import { createGalleryUiSurfaceFeature } from '@quajs/plugin-gallery/surface'
import { createSettingsUiSurfaceFeature } from '@quajs/plugin-settings/surface'
import { demoPanelRect } from '../ui-presentation'
import { withDemoFeatureSkin } from './feature-skin'

export const DEMO_LOADING_SURFACE = createAssetLoadingUiSurfaceFeature({
  fontFamily: ['Noto Sans', 'sans-serif'],
  labels: {
    'preparing': '正在加载……', 'loading-local': '正在加载本地资源……',
    'checking-cache': '正在检查本地资源……',
    'downloading': '正在下载资源……', 'verifying': '正在校验资源……',
    'caching': '正在保存资源……', 'ready': '准备就绪',
    'error': '资源加载失败，请重试。', 'retry': '重试',
  },
})

export const DEMO_UI_FEATURE_SURFACES: readonly UiFeatureSurfaceEntry[] = Object.freeze([
  DEMO_LOADING_SURFACE,
  createAchievementUiSurfaceFeature(),
  withDemoFeatureSkin(createBacklogUiSurfaceFeature({ resolvePanelBounds: context => demoPanelRect(1460, 930, false, context.logicalWidth, context.logicalHeight) })),
  createGalleryUiSurfaceFeature({ layout: 'grid' }),
  withDemoFeatureSkin(createSettingsUiSurfaceFeature()),
])
