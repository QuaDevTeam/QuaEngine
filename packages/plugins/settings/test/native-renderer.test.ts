import type { NativeUiSurfaceNodeProjection } from '@quajs/native-ui-compiler'
import { RenderToLogicEvents } from '@quajs/engine'
import {
  createNativeRendererJsonFrameInput,
  resolveNativeRendererFeatureIntent,
} from '@quajs/engine-native'
import { describe, expect, it } from 'vitest'
import { SettingsRenderToLogicEvents } from '../src/contracts'
import {
  createSettingsNativeRendererFeature,
  SETTINGS_NATIVE_SURFACE_KEY,
} from '../src/native'

describe('settings native renderer feature', () => {
  it('does not replace the engine UI overlay while settings is closed', () => {
    const feature = createSettingsNativeRendererFeature()
    expect(feature.createOverlays({
      logicalHeight: 1080,
      logicalWidth: 1920,
      projection: { scopes: {} },
      safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
      view: { ui: { overlays: { settings: { open: false } } } },
    })).toBeUndefined()
  })

  it('allows product bounds without modifying engine projections', () => {
    const bounds = { x: 470, y: 115, width: 980, height: 642 }
    const view = { ui: { overlays: { settings: { open: true } } } }
    const result = createSettingsNativeRendererFeature({ resolvePanelBounds: () => bounds }).createOverlays({
      logicalWidth: 1920, logicalHeight: 1080, view,
      projection: { scopes: {} }, safeArea: { x: 96, y: 0, width: 1728, height: 1080 },
    }) as { surface: { root: NativeUiSurfaceNodeProjection } }
    expect(findNode(result.surface.root, 'settings-panel')?.bounds).toEqual(bounds)
    expect(view).toEqual({ ui: { overlays: { settings: { open: true } } } })
  })

  it('projects exposed controls with safe-area placement and precomputed validated patches', () => {
    const frame = createNativeRendererJsonFrameInput({
      layout: { width: 1920, height: 1080, aspectRatio: 16 / 9, minAspectRatio: 16 / 10 },
      ui: {
        overlays: {
          settings: {
            open: true,
            scene: { overlay: { overlayStack: 'modal', stackPriority: 2, zIndex: 64 } },
          },
        },
      },
      plugins: {
        settings: {
          profileId: 'default',
          revision: 1,
          scopes: {
            '@quajs/plugin-settings': {
              defaults: { confirmBeforeQuit: true, nickname: 'Player', skipMode: 'all', textSpeedCps: 36 },
              packageId: 'runtime.settings',
              schema: {
                type: 'object',
                properties: {
                  confirmBeforeQuit: { type: 'boolean', title: 'Confirm Before Quit' },
                  nickname: { type: 'string', title: 'Nickname' },
                  skipMode: { type: 'string', title: 'Skip Mode', enum: ['read', 'all'] },
                  textSpeedCps: { type: 'number', title: 'Text Speed', minimum: 5, maximum: 120, multipleOf: 1 },
                },
              },
              ui: {
                groups: { flow: { label: 'Flow Control' } },
                controls: {
                  confirmBeforeQuit: { control: 'switch' },
                  skipMode: {
                    control: 'select',
                    group: 'flow',
                    options: [{ label: 'Read Text', value: 'read' }, { label: 'All Text', value: 'all' }],
                  },
                  textSpeedCps: { control: 'slider', group: 'flow', min: 5, max: 120, step: 1 },
                },
              },
              values: { confirmBeforeQuit: true, nickname: 'Player', skipMode: 'all', textSpeedCps: 36 },
            },
          },
          updatedAt: 1,
        },
      },
    }, { featureSurfaces: [createSettingsNativeRendererFeature()] })

    const overlay = (frame.view.ui as { overlays: Array<Record<string, unknown>> }).overlays[0]
    const surface = overlay.surface as { key: string, root: NativeUiSurfaceNodeProjection }
    const confirm = findNode(surface.root, 'settings-field--quajs-plugin-settings-confirmBeforeQuit')
    const speed = findNode(surface.root, 'settings-field--quajs-plugin-settings-textSpeedCps')
    const nickname = findNode(surface.root, 'settings-field--quajs-plugin-settings-nickname')
    const skipValue = findNode(surface.root, 'settings-field--quajs-plugin-settings-skipMode-select-value')
    const confirmValue = findNode(surface.root, 'settings-field--quajs-plugin-settings-confirmBeforeQuit-value')
    const confirmTrack = findNode(surface.root, 'settings-field--quajs-plugin-settings-confirmBeforeQuit-switch-track')
    const speedControl = findNode(surface.root, 'settings-field--quajs-plugin-settings-textSpeedCps-slider-control')
    const speedValue = findNode(surface.root, 'settings-field--quajs-plugin-settings-textSpeedCps-value')
    const speedTrack = findNode(surface.root, 'settings-field--quajs-plugin-settings-textSpeedCps-slider-track')
    const groupLabel = findNode(surface.root, 'settings-group--quajs-plugin-settings-flow-label')
    const panel = findNode(surface.root, 'settings-panel')
    const title = findNode(surface.root, 'settings-title')
    const close = findNode(surface.root, 'settings-close')
    const skip = findNode(surface.root, 'settings-field--quajs-plugin-settings-skipMode-select')
    const skipChevron = findNode(surface.root, 'settings-field--quajs-plugin-settings-skipMode-select-chevron')

    expect(surface.key).toBe(SETTINGS_NATIVE_SURFACE_KEY)
    expect(overlay).toEqual(expect.objectContaining({
      overlayStack: 'modal',
      stackPriority: 2,
      zIndex: 64,
    }))
    expect(confirm?.intent).toBeUndefined()
    expect(confirmTrack?.control).toEqual(expect.objectContaining({
      kind: 'switch',
      selectedIndex: 1,
      options: expect.arrayContaining([
        expect.objectContaining({ label: 'OFF', intent: expect.objectContaining({ metadata: expect.objectContaining({ patchJson: '{"confirmBeforeQuit":false}' }) }) }),
      ]),
    }))
    expect(speed?.intent).toBeUndefined()
    expect(speedControl?.control).toEqual(expect.objectContaining({
      kind: 'range',
      selectedIndex: 31,
      options: expect.arrayContaining([
        expect.objectContaining({ label: '37 cps', intent: expect.objectContaining({ metadata: expect.objectContaining({ patchJson: '{"textSpeedCps":37}' }) }) }),
      ]),
    }))
    expect(nickname?.intent).toBeUndefined()
    expect(confirmValue?.text).toBe('ON')
    expect(confirmTrack?.style?.borderRadius).toBe(12)
    expect(speedValue?.text).toBe('36 cps')
    expect(speedTrack?.style?.backgroundGradient).toEqual(expect.objectContaining({
      kind: 'linear',
      stops: [
        { color: 'rgba(129,229,255,0.46)', position: 0 },
        { color: 'rgba(233,192,111,0.76)', position: 1 },
      ],
    }))
    expect(skipValue?.text).toBe('All Text')
    expect(skip?.control).toEqual(expect.objectContaining({ kind: 'select', selectedIndex: 1 }))
    expect(skipChevron).toEqual(expect.objectContaining({
      kind: 'Box',
      role: 'ui-select-chevron-down',
    }))
    expect(close?.text).toBe('×')
    expect(groupLabel?.text).toBe('FLOW CONTROL')
    expect(groupLabel?.style?.fontSize).toBe(10)
    expect(panel?.bounds.height).toBe(552)
    expect(panel?.style?.boxShadow).toEqual(expect.objectContaining({ blurRadius: 48, offsetY: 18 }))
    expect(title?.style?.textShadow).toEqual(expect.objectContaining({ blurRadius: 10, offsetY: 2 }))
    expect(confirm?.provenance).toEqual({
      contentPackageId: 'runtime.settings',
      requiredRuntimePackages: ['runtime.settings'],
    })
  })

  it('caps overflowing panels and samples large numeric ranges across their full extent', () => {
    const properties = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [
      `value${i}`, { type: 'number', minimum: 0, maximum: 10000, multipleOf: 1 },
    ]))
    const frame = createNativeRendererJsonFrameInput({
      layout: { height: 1080, aspectRatio: 16 / 9 },
      ui: { overlays: { settings: { open: true } } },
      plugins: { settings: { scopes: { test: {
        schema: { type: 'object', properties }, defaults: {},
        values: { value0: 5000 },
      } }, revision: 1 } },
    }, { featureSurfaces: [createSettingsNativeRendererFeature()] })
    const overlays = (frame.view.ui as { overlays: Array<{ surface: { root: NativeUiSurfaceNodeProjection } }> }).overlays
    const root = overlays[0].surface.root
    expect(findNode(root, 'settings-panel')?.bounds.height).toBe(720)
    expect(findNode(root, 'settings-scroll')?.clipChildren).toBe(true)
    const control = findNode(root, 'settings-field-test-value0-slider-control')?.control
    expect(control?.options).toHaveLength(512)
    const values = control!.options.map(option => JSON.parse(String(option.intent.metadata?.patchJson)).value0)
    expect(values[0]).toBe(0)
    expect(values.at(-1)).toBe(10000)
    expect(values[256]).toBeGreaterThan(4900)
    expect(Math.max(...values.slice(1).map((v, i) => v - values[i]))).toBeLessThanOrEqual(20)
  })

  it('maps update, reset, and close actions without arbitrary event dispatch', () => {
    const entries = [createSettingsNativeRendererFeature()]
    expect(resolveNativeRendererFeatureIntent(entries, 'settings-update', {
      patchJson: '{"audio":{"enabled":false}}',
      scope: '@quajs/plugin-audio',
    })).toEqual({
      event: SettingsRenderToLogicEvents.UPDATE_REQUEST,
      payload: { scope: '@quajs/plugin-audio', patch: { audio: { enabled: false } } },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'settings-reset-scope', {
      scope: '@quajs/plugin-audio',
    })).toEqual({
      event: SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST,
      payload: { scope: '@quajs/plugin-audio' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'settings-close', { targetId: 'settings' })).toEqual({
      event: RenderToLogicEvents.UI_REQUEST_CLOSE,
      payload: { elementId: 'settings' },
    })
    expect(resolveNativeRendererFeatureIntent(entries, 'settings/apply-hook', {})).toBeUndefined()
    expect(() => resolveNativeRendererFeatureIntent(entries, 'settings-update', {
      patchJson: '{"__proto__":{"polluted":true}}',
      scope: 'unsafe',
    })).toThrow('must contain a safe object patch')
  })
})

function findNode(
  root: NativeUiSurfaceNodeProjection,
  id: string,
): NativeUiSurfaceNodeProjection | undefined {
  if (root.id === id) {
    return root
  }
  for (const child of root.children || []) {
    const found = findNode(child, id)
    if (found) {
      return found
    }
  }
  return undefined
}
