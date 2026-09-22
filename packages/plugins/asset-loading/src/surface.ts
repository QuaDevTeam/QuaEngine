import type { UiFeatureSurfaceEntry } from '@quajs/render-core'
import type { AssetLoadingProjection } from './contracts'
import { ASSET_LOADING_PLUGIN_ID, ASSET_LOADING_RETRY } from './contracts'

export const ASSET_LOADING_UI_SURFACE_ENTRY = '@quajs/plugin-asset-loading/surface'

export interface AssetLoadingSurfaceOptions {
  labels?: Partial<Record<AssetLoadingProjection['phase'] | 'error' | 'retry', string>>
  fontFamily?: string[]
  backgroundColor?: string
  color?: string
  accentColor?: string
}

/** One resource-free surface for Web QUI and Native. No image or font asset refs. */
export function createAssetLoadingUiSurfaceFeature(options: AssetLoadingSurfaceOptions = {}): UiFeatureSurfaceEntry {
  const labels = {
    'preparing': 'Loading', 'loading-local': 'Loading local resources',
    'checking-cache': 'Checking resources', 'downloading': 'Downloading',
    'verifying': 'Verifying', 'caching': 'Saving resources', 'ready': 'Ready',
    'error': 'Resources could not be loaded', 'retry': 'Retry', ...options.labels,
  }
  return {
    pluginId: ASSET_LOADING_PLUGIN_ID,
    intentActions: [{ action: 'asset-loading-retry', event: ASSET_LOADING_RETRY, createPayload: () => ({}) }],
    createOverlays(context) {
      const state = context.projection as unknown as AssetLoadingProjection
      if (!state.visible) return
      const width = Math.min(720, context.safeArea.width - 80)
      const x = (context.logicalWidth - width) / 2
      const y = context.logicalHeight / 2
      const color = options.color ?? '#e7e3d8'
      const accent = options.accentColor ?? '#b49b71'
      const textStyle = { color, fontFamily: options.fontFamily, textAlign: 'center', fontSize: 28, lineHeight: 44 }
      const progress = state.progress === null ? null : Math.max(0, Math.min(1, state.progress))
      return {
        elementId: ASSET_LOADING_PLUGIN_ID,
        visible: true,
        interactive: true,
        renderMode: 'render-only',
        overlayStack: 'system',
        stackPriority: 1000,
        zIndex: 10000,
        scene: { id: ASSET_LOADING_PLUGIN_ID, presentation: 'scene', hideDialogue: true, defaultChrome: false },
        surface: {
          key: 'plugin-asset-loading/surface',
          root: {
            id: 'asset-loading-root', kind: 'Panel', visible: true,
            bounds: { x: 0, y: 0, width: context.logicalWidth, height: context.logicalHeight },
            style: { backgroundColor: options.backgroundColor ?? '#171c22' },
            children: [
              { id: 'asset-loading-title', kind: 'Text', visible: true, bounds: { x, y: y - 100, width, height: 64 }, text: state.title, style: { ...textStyle, fontSize: 38, lineHeight: 64 } },
              { id: 'asset-loading-status', kind: 'Text', visible: true, bounds: { x, y, width, height: 48 }, text: state.state === 'error' ? labels.error : labels[state.phase], style: textStyle },
              { id: 'asset-loading-track', kind: 'Panel', visible: state.state !== 'error', bounds: { x: x + width * 0.2, y: y + 86, width: width * 0.6, height: 3 }, style: { backgroundColor: '#596068' } },
              { id: 'asset-loading-progress', kind: 'Panel', visible: state.state !== 'error', bounds: { x: x + width * 0.2, y: y + 86, width: width * 0.6 * (progress ?? 0.12), height: 3 }, style: { backgroundColor: accent } },
              { id: 'asset-loading-detail', kind: 'Text', visible: state.state !== 'error' && progress !== null, bounds: { x, y: y + 116, width, height: 36 }, text: `${Math.round((progress ?? 0) * 100)}%`, style: { ...textStyle, fontSize: 20, lineHeight: 36 } },
              { id: 'asset-loading-retry', kind: 'Button', visible: state.state === 'error', bounds: { x: context.logicalWidth / 2 - 100, y: y + 85, width: 200, height: 64 }, text: labels.retry, style: { ...textStyle, backgroundColor: '#292f36', borderColor: accent, borderWidth: 1 }, intent: { event: 'ui/intent', action: 'asset-loading-retry' } },
            ],
          },
        },
      }
    },
  }
}
