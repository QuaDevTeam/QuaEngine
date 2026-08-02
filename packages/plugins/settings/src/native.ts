import type { NativeRendererFeatureSurfaceContext, NativeRendererFeatureSurfaceEntry } from '@quajs/engine-native'
import type {
  NativePackageProvenance,
  NativeUiSurfaceControlOptionProjection,
  NativeUiSurfaceNodeProjection,
  NativeUiSurfaceRect,
} from '@quajs/native-ui-compiler'
import type { SettingsProjection } from './contracts'
import type { SettingsFieldFormProjection, SettingsScopeFormProjection } from './form'
import { RenderToLogicEvents } from '@quajs/engine'
import { SETTINGS_PLUGIN_ID, SettingsRenderToLogicEvents } from './contracts'
import {
  createSettingsFormProjection,
  createSettingsOptions,
  createSettingsValuePatch,
  settingsFieldControlKind,
  settingsValuesEqual,
  stringifySettingsInputValue,
} from './form'

export const SETTINGS_NATIVE_RENDERER_ENTRY = '@quajs/plugin-settings/native' as const
export const SETTINGS_NATIVE_SURFACE_KEY = 'plugin-settings/native' as const

const SETTINGS_ELEMENT_ID = 'settings'
const ACTIONS = {
  close: 'settings-close',
  resetAll: 'settings-reset-all',
  resetScope: 'settings-reset-scope',
  update: 'settings-update',
} as const

export function createSettingsNativeRendererFeature(): NativeRendererFeatureSurfaceEntry {
  return {
    pluginId: SETTINGS_PLUGIN_ID,
    createOverlays: createSettingsNativeOverlay,
    intentActions: [
      {
        action: ACTIONS.close,
        event: RenderToLogicEvents.UI_REQUEST_CLOSE,
        createPayload: payload => ({ elementId: requiredString(payload.targetId, 'targetId') }),
      },
      {
        action: ACTIONS.resetAll,
        event: SettingsRenderToLogicEvents.RESET_ALL_REQUEST,
        createPayload: () => ({}),
      },
      {
        action: ACTIONS.resetScope,
        event: SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST,
        createPayload: payload => ({ scope: requiredString(payload.scope, 'scope') }),
      },
      {
        action: ACTIONS.update,
        event: SettingsRenderToLogicEvents.UPDATE_REQUEST,
        createPayload: payload => ({
          scope: requiredString(payload.scope, 'scope'),
          patch: parsePatch(payload.patchJson),
        }),
      },
    ],
  }
}

function createSettingsNativeOverlay(context: NativeRendererFeatureSurfaceContext) {
  const projection = context.projection as unknown as SettingsProjection & Record<string, unknown>
  const overlay = settingsOverlay(context.view)
  if (!overlay || overlay.open === false || overlay.visible === false) {
    return undefined
  }
  const sceneOverlay = recordValue(recordValue(overlay.scene)?.overlay)
  const provenance = projectionProvenance(projection)
  return {
    elementId: SETTINGS_ELEMENT_ID,
    visible: true,
    renderMode: 'render-only' as const,
    interactive: true,
    overlayStack: stringValue(overlay.overlayStack) || stringValue(sceneOverlay?.overlayStack) || 'overlay',
    stackPriority: finiteInteger(overlay.stackPriority) ?? finiteInteger(sceneOverlay?.stackPriority),
    zIndex: finiteInteger(overlay.zIndex) ?? finiteInteger(sceneOverlay?.zIndex) ?? 60,
    surface: {
      key: SETTINGS_NATIVE_SURFACE_KEY,
      root: createSettingsRoot(context, projection, provenance),
    },
    ...provenance,
  }
}

function createSettingsRoot(
  context: NativeRendererFeatureSurfaceContext,
  projection: SettingsProjection,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const form = createSettingsFormProjection(projection)
  const edge = Math.max(24, Math.min(context.safeArea.width, context.logicalHeight) * 0.03)
  const entries = flattenSettingsEntries(form.scopes)
  // Matches the Web panel: 90px header, 30px padding, 24px group headers,
  // 70px field rows — the panel hugs its content like `max-height: min(720px, 84cqh)`.
  const headerHeight = 90
  const contentPadding = 30
  const desiredContentHeight = entries.reduce((height, entry) => height + settingsEntryHeight(entry), 0)
  const desiredPanelHeight = headerHeight + contentPadding * 2 + desiredContentHeight
  const panelWidth = Math.min(context.safeArea.width - edge * 2, 1040)
  const panelHeight = Math.min(context.safeArea.height - edge * 2, Math.max(552, desiredPanelHeight))
  const panel = {
    x: context.safeArea.x + (context.safeArea.width - panelWidth) / 2,
    y: context.safeArea.y + (context.safeArea.height - panelHeight) / 2,
    width: panelWidth,
    height: panelHeight,
  }
  const content = {
    x: panel.x + contentPadding,
    y: panel.y + headerHeight + contentPadding,
    width: panel.width - contentPadding * 2,
    height: panel.height - headerHeight - contentPadding * 2,
  }
  let entryY = content.y
  const entryNodes: NativeUiSurfaceNodeProjection[] = entries.length === 0
    ? [node('settings-empty', 'Text', content, {
        text: 'No player settings',
        provenance,
        style: { color: '#a5afba', fontSize: 24, textAlign: 'center' },
      })]
    : entries.map((entry) => {
        const height = settingsEntryHeight(entry)
        const bounds = { x: content.x, y: entryY, width: content.width, height }
        entryY += height
        return entry.kind === 'group'
          ? createGroupNode(entry, bounds, provenance)
          : createFieldNode(entry.scope, entry.field, bounds, provenance)
      })
  const settingsScrollNode = node('settings-scroll', 'Scroll', content, {
    clipChildren: true,
    provenance,
    children: entryNodes,
  })

  return node('settings-root', 'Fragment', stage(context), {
    provenance,
    children: [
      node('settings-backdrop', 'Backdrop', stage(context), {
        intent: uiIntent(ACTIONS.close, { targetId: SETTINGS_ELEMENT_ID }),
        provenance,
        style: { backgroundColor: '#020306', opacity: 1 },
      }),
      node('settings-panel', 'Panel', panel, {
        provenance,
        style: {
          backgroundColor: '#0b0d12',
          borderColor: 'rgba(245,226,190,0.34)',
          borderRadius: 2,
          borderWidth: 1,
          boxShadow: panelShadow(),
        },
        children: [
          node('settings-title', 'Text', {
            x: panel.x + contentPadding,
            y: panel.y + 11,
            width: panel.width - contentPadding * 2 - 116,
            // 32px Noto metrics need ascent 34.2 + descender 9.4 ≈ 44px of
            // vertical room; a 52px Middle-aligned box keeps the glyph span
            // centred at panel.y + 31 (Web offset) without clipping 'g'.
            height: 52,
          }, {
            text: 'Config',
            provenance,
            style: {
              color: '#fff8ea',
              fontSize: 32,
              fontWeight: 700,
              textShadow: titleShadow(),
            },
          }),
          node('settings-reset-all', 'Button', {
            x: panel.x + panel.width - contentPadding - 104,
            y: panel.y + 31,
            width: 54,
            height: 42,
          }, {
            text: 'RESET',
            intent: uiIntent(ACTIONS.resetAll),
            provenance,
            style: headerButtonStyle(11),
          }),
          node('settings-close', 'Button', {
            x: panel.x + panel.width - contentPadding - 42,
            y: panel.y + 31,
            width: 42,
            height: 42,
          }, {
            text: '×',
            intent: uiIntent(ACTIONS.close, { targetId: SETTINGS_ELEMENT_ID }),
            provenance,
            style: headerButtonStyle(16),
          }),
          node('settings-header-divider', 'Divider', {
            x: panel.x + contentPadding,
            y: panel.y + headerHeight - 1,
            width: panel.width - contentPadding * 2,
            height: 1,
          }, {
            provenance,
            style: { backgroundColor: 'rgba(245,226,190,0.18)' },
          }),
          settingsScrollNode,
        ],
      }),
    ],
  })
}

type NativeSettingsEntry =
  | { kind: 'group', id: string, label: string, scope: SettingsScopeFormProjection }
  | { kind: 'field', field: SettingsFieldFormProjection, scope: SettingsScopeFormProjection }

function flattenSettingsEntries(scopes: readonly SettingsScopeFormProjection[]): NativeSettingsEntry[] {
  return scopes.flatMap(scope => scope.groups.flatMap((group) => {
    const fields = group.fields.flatMap(flattenField).filter(field => field.control.hidden !== true)
    return [
      ...(group.label
        ? [{ kind: 'group' as const, id: group.id, label: group.label, scope }]
        : []),
      ...fields.map(field => ({ kind: 'field' as const, scope, field })),
    ]
  }))
}

function settingsEntryHeight(entry: NativeSettingsEntry): number {
  return entry.kind === 'group' ? 24 : 70
}

function createGroupNode(
  entry: Extract<NativeSettingsEntry, { kind: 'group' }>,
  bounds: NativeUiSurfaceRect,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, scopeProvenance(entry.scope))
  const id = `settings-group-${safeId(entry.scope.scope)}-${safeId(entry.id)}`
  return node(id, 'Fragment', bounds, {
    provenance,
    children: [
      node(`${id}-label`, 'Text', {
        x: bounds.x + 2,
        y: bounds.y + 3,
        width: Math.min(320, bounds.width * 0.44),
        height: 16,
      }, {
        text: entry.label.toUpperCase(),
        provenance,
        style: {
          color: 'rgba(255,226,166,0.90)',
          fontSize: 10,
          letterSpacing: 1.6,
        },
      }),
      node(`${id}-divider`, 'Divider', {
        x: bounds.x,
        y: bounds.y + bounds.height - 1,
        width: bounds.width,
        height: 1,
      }, {
        provenance,
        style: { backgroundColor: 'rgba(245,226,190,0.14)' },
      }),
    ],
  })
}

function createFieldNode(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  bounds: NativeUiSurfaceRect,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, scopeProvenance(scope))
  const label = field.control.label || field.name
  const value = stringifySettingsInputValue(field)
  const error = field.errors[0]?.message
  const description = error || field.schema.description || field.control.description
  const valueText = formatNativeSettingsValue(field, value)
  const id = `settings-field-${safeId(scope.scope)}-${safeId(field.pathKey)}`
  const controlBounds = {
    x: bounds.x + bounds.width * 0.46,
    y: bounds.y + 12,
    width: bounds.width * 0.54,
    height: bounds.height - 24,
  }
  return node(id, 'Box', bounds, {
    provenance,
    children: [
      node(`${id}-divider`, 'Divider', {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: 1,
      }, {
        provenance,
        style: { backgroundColor: 'rgba(245,226,190,0.14)' },
      }),
      node(`${id}-label`, 'Text', {
        x: bounds.x + 2,
        y: bounds.y + (description ? 13 : 23),
        width: bounds.width * 0.42,
        height: 22,
      }, {
        text: label,
        provenance,
        style: {
          color: field.readonly ? 'rgba(247,242,234,0.52)' : 'rgba(255,248,234,0.90)',
          fontSize: 14,
          fontWeight: 700,
        },
      }),
      ...(description
        ? [node(`${id}-description`, 'Text', {
            x: bounds.x + 2,
            y: bounds.y + 39,
            width: bounds.width * 0.42,
            height: 16,
          }, {
            text: description,
            provenance,
            style: {
              color: error ? '#ef9aa4' : 'rgba(247,242,234,0.52)',
              fontSize: 12,
              textOverflow: 'ellipsis',
            },
          })]
        : []),
      ...createControlNodes(id, scope, field, valueText, controlBounds, provenance),
    ],
  })
}

function createControlNodes(
  id: string,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  valueText: string,
  bounds: NativeUiSurfaceRect,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection[] {
  const control = settingsFieldControlKind(field)
  if (control === 'slider' || control === 'range' || control === 'number') {
    return createSliderControlNodes(id, scope, field, valueText, bounds, provenance)
  }
  if (control === 'select' || control === 'radio') {
    return createSelectControlNodes(id, scope, field, valueText, bounds, provenance)
  }
  if (control === 'switch' || control === 'checkbox') {
    return createSwitchControlNodes(id, scope, field, Boolean(field.value), bounds, provenance)
  }
  return [valueNode(id, valueText, bounds, provenance, field.readonly)]
}

function createSliderControlNodes(
  id: string,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  valueText: string,
  bounds: NativeUiSurfaceRect,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection[] {
  const min = finiteNumber(field.control.min) ?? finiteNumber(field.schema.minimum) ?? 0
  const max = finiteNumber(field.control.max) ?? finiteNumber(field.schema.maximum) ?? Math.max(min + 1, Number(field.value) || 0)
  const current = finiteNumber(field.value) ?? min
  const progress = max > min ? Math.max(0, Math.min(1, (current - min) / (max - min))) : 0
  const outputWidth = 72
  const trackX = bounds.x
  const trackWidth = Math.max(40, bounds.width - outputWidth - 16)
  const trackY = bounds.y + bounds.height / 2 - 2
  const thumbX = trackX + trackWidth * progress
  const options = field.readonly ? [] : createRangeControlOptions(scope, field, min, max)
  const selectedIndex = nearestNumericOptionIndex(options, current)
  return [
    node(`${id}-slider-control`, 'Box', {
      x: trackX,
      y: bounds.y,
      width: trackWidth,
      height: bounds.height,
    }, {
      control: options.length > 0 ? {
        kind: 'range',
        options: options.map(option => ({ label: option.label, intent: option.intent })),
        parts: {
          progress: `${id}-slider-progress`,
          thumb: `${id}-slider-thumb`,
          thumbHalo: `${id}-slider-thumb-halo`,
          value: `${id}-value`,
        },
        selectedIndex,
      } : undefined,
      provenance,
      style: { backgroundColor: 'transparent' },
      children: [
        // Web track: one static cyan→gold gradient; the progress part stays
        // transparent so control feedback can resize it without painting.
        node(`${id}-slider-track`, 'Box', {
          x: trackX,
          y: trackY,
          width: trackWidth,
          height: 4,
        }, {
          provenance,
          style: {
            backgroundGradient: {
              kind: 'linear',
              angleDegrees: 90,
              stops: [
                { color: 'rgba(129,229,255,0.46)', position: 0 },
                { color: 'rgba(233,192,111,0.76)', position: 1 },
              ],
            },
            borderRadius: 2,
          },
        }),
        node(`${id}-slider-progress`, 'Box', {
          x: trackX,
          y: trackY,
          width: Math.max(2, trackWidth * progress),
          height: 4,
        }, {
          provenance,
          style: { backgroundColor: 'transparent', borderRadius: 2 },
        }),
        node(`${id}-slider-thumb-halo`, 'Box', {
          x: thumbX - 12,
          y: trackY - 10,
          width: 24,
          height: 24,
        }, {
          provenance,
          style: { backgroundColor: 'rgba(242,206,119,0.16)', borderRadius: 12 },
        }),
        node(`${id}-slider-thumb`, 'Box', {
          x: thumbX - 8,
          y: trackY - 6,
          width: 16,
          height: 16,
        }, {
          provenance,
          style: {
            backgroundColor: '#f2ce77',
            borderColor: 'rgba(3,4,7,0.82)',
            borderRadius: 8,
            borderWidth: 1,
          },
        }),
      ],
    }),
    valueNode(id, valueText, {
      x: bounds.x + bounds.width - outputWidth,
      y: bounds.y + 8,
      width: outputWidth,
      height: bounds.height - 16,
    }, provenance, field.readonly),
  ]
}

function createSelectControlNodes(
  id: string,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  valueText: string,
  bounds: NativeUiSurfaceRect,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection[] {
  const options = field.readonly
    ? []
    : createSettingsOptions(field).map(option => controlOption(scope, field, option.value, option.label || String(option.value)))
  const selectedIndex = Math.max(0, options.findIndex(option => settingsValuesEqual(option.value, field.value)))
  return [node(`${id}-select`, 'Panel', {
    x: bounds.x,
    y: bounds.y + 2,
    width: bounds.width,
    height: 40,
  }, {
    control: options.length > 0 ? {
      kind: 'select',
      options: options.map(option => ({ label: option.label, intent: option.intent })),
      parts: { chevron: `${id}-select-chevron`, value: `${id}-select-value` },
      selectedIndex,
    } : undefined,
    provenance,
    style: {
      backgroundColor: 'rgba(5,7,11,0.62)',
      borderColor: 'rgba(245,226,190,0.22)',
      borderRadius: 4,
      borderWidth: 1,
    },
    children: [
      node(`${id}-select-value`, 'Text', {
        x: bounds.x + 12,
        y: bounds.y + 11,
        width: bounds.width - 52,
        height: 22,
      }, {
        text: valueText,
        provenance,
        style: { color: '#fff8ea', fontSize: 13 },
      }),
      node(`${id}-select-chevron`, 'Box', {
        x: bounds.x + bounds.width - 24,
        y: bounds.y + 18,
        width: 10,
        height: 7,
      }, {
        provenance,
        role: 'ui-select-chevron-down',
        style: { backgroundColor: 'rgba(255,248,234,0.72)' },
      }),
    ],
  })]
}

function createSwitchControlNodes(
  id: string,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  checked: boolean,
  bounds: NativeUiSurfaceRect,
  provenance: NativePackageProvenance,
): NativeUiSurfaceNodeProjection[] {
  const track = { x: bounds.x + 6, y: bounds.y + 10, width: 42, height: 23 }
  const options = field.readonly
    ? []
    : [
        controlOption(scope, field, false, 'OFF'),
        controlOption(scope, field, true, 'ON'),
      ]
  return [
    node(`${id}-switch-track`, 'Box', track, {
      control: options.length > 0 ? {
        kind: 'switch',
        options: options.map(option => ({ label: option.label, intent: option.intent })),
        parts: { track: `${id}-switch-track`, thumb: `${id}-switch-thumb`, value: `${id}-value` },
        selectedIndex: checked ? 1 : 0,
      } : undefined,
      provenance,
      style: {
        backgroundColor: checked ? 'rgba(129,229,255,0.16)' : 'rgba(255,255,255,0.06)',
        borderColor: checked ? 'rgba(129,229,255,0.48)' : 'rgba(245,226,190,0.24)',
        borderRadius: 12,
        borderWidth: 1,
      },
    }),
    node(`${id}-switch-thumb`, 'Box', {
      x: track.x + (checked ? 21 : 4),
      y: track.y + 3,
      width: 17,
      height: 17,
    }, {
      provenance,
      style: {
        backgroundColor: checked ? '#81e5ff' : 'rgba(247,242,234,0.78)',
        borderRadius: 9,
        boxShadow: {
          offsetX: 0,
          offsetY: 4,
          blurRadius: 10,
          spreadRadius: 0,
          color: 'rgba(0,0,0,0.36)',
          inset: false,
        },
      },
    }),
    node(`${id}-value`, 'Text', {
      x: track.x + track.width + 10,
      y: bounds.y + 13,
      width: 54,
      height: 16,
    }, {
      text: checked ? 'ON' : 'OFF',
      provenance,
      style: { color: 'rgba(247,242,234,0.70)', fontSize: 10, letterSpacing: 1.2 },
    }),
  ]
}

function valueNode(
  id: string,
  valueText: string,
  bounds: NativeUiSurfaceRect,
  provenance: NativePackageProvenance,
  readonly: boolean,
): NativeUiSurfaceNodeProjection {
  return node(`${id}-value`, 'Text', bounds, {
    text: valueText,
    provenance,
    style: {
      color: readonly ? 'rgba(247,242,234,0.52)' : 'rgba(247,242,234,0.68)',
      fontSize: 11,
      textAlign: 'right',
    },
  })
}

function formatNativeSettingsValue(field: SettingsFieldFormProjection, value: string) {
  const control = settingsFieldControlKind(field)
  if (control === 'switch' || control === 'checkbox') {
    return field.value ? 'ON' : 'OFF'
  }
  if (field.pathKey === 'textSpeedCps') {
    return `${value} cps`
  }
  if (field.pathKey === 'autoAdvanceDelayMs') {
    return `${value} ms`
  }
  if (control === 'select' || control === 'radio') {
    const selected = createSettingsOptions(field).find(option => settingsValuesEqual(option.value, field.value))
    return selected?.label || value
  }
  return value
}

function flattenField(field: SettingsFieldFormProjection): SettingsFieldFormProjection[] {
  return field.children?.length ? field.children.flatMap(flattenField) : [field]
}

interface NativeSettingsControlOption extends NativeUiSurfaceControlOptionProjection {
  value: unknown
}

function controlOption(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  value: unknown,
  label: string,
): NativeSettingsControlOption {
  return {
    label,
    value,
    intent: uiIntent(ACTIONS.update, {
      patchJson: JSON.stringify(createSettingsValuePatch(scope.source, field.path, value)),
      scope: scope.scope,
    }),
  }
}

function createRangeControlOptions(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  min: number,
  max: number,
): NativeSettingsControlOption[] {
  const step = Math.max(Number.EPSILON, finiteNumber(field.control.step) ?? finiteNumber(field.schema.multipleOf) ?? 1)
  const count = Math.min(512, Math.max(1, Math.floor((max - min) / step) + 1))
  return Array.from({ length: count }, (_, index) => {
    const value = index === count - 1 ? max : Math.min(max, min + step * index)
    return controlOption(scope, field, value, formatNativeSettingsValue(field, String(value)))
  })
}

function nearestNumericOptionIndex(options: readonly NativeSettingsControlOption[], value: number): number {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  options.forEach((option, index) => {
    const distance = Math.abs(Number(option.value) - value)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })
  return nearestIndex
}

function settingsOverlay(view: Readonly<Record<string, unknown>>) {
  const ui = recordValue(view.ui)
  const overlays = recordValue(ui?.overlays)
  return recordValue(overlays?.[SETTINGS_ELEMENT_ID])
}

function projectionProvenance(projection: SettingsProjection & Record<string, unknown>) {
  const scopePackages = Object.values(projection.scopes || {}).map(scope => scope.packageId).filter(isString)
  return normalizeProvenance(
    stringValue(projection.contentPackageId),
    [...stringArray(projection.requiredRuntimePackages), ...scopePackages],
  )
}

function scopeProvenance(scope: SettingsScopeFormProjection) {
  return normalizeProvenance(scope.packageId, scope.packageId ? [scope.packageId] : [])
}

function node(
  id: string,
  kind: NativeUiSurfaceNodeProjection['kind'],
  bounds: NativeUiSurfaceRect,
  options: Omit<NativeUiSurfaceNodeProjection, 'bounds' | 'id' | 'kind' | 'visible'> = {},
): NativeUiSurfaceNodeProjection {
  return { id, kind, bounds, visible: true, ...options }
}

function uiIntent(action: string, metadata?: Record<string, boolean | number | string>) {
  return { action, event: 'ui/intent' as const, metadata }
}

function headerButtonStyle(fontSize: number) {
  return {
    backgroundColor: 'rgba(255,248,234,0.90)',
    borderColor: 'rgba(245,226,190,0.24)',
    borderRadius: 4,
    borderWidth: 1,
    color: '#0d0d12',
    fontSize,
    letterSpacing: 0.9,
    padding: { top: 5, right: 7, bottom: 4, left: 7 },
    textAlign: 'center' as const,
  }
}

function panelShadow() {
  return {
    offsetX: 0,
    offsetY: 18,
    blurRadius: 48,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.42)',
    inset: false,
  }
}

function titleShadow() {
  return {
    offsetX: 0,
    offsetY: 2,
    blurRadius: 10,
    spreadRadius: 0,
    color: 'rgba(0,0,0,0.72)',
    inset: false,
  }
}

function stage(context: NativeRendererFeatureSurfaceContext): NativeUiSurfaceRect {
  return { x: 0, y: 0, width: context.logicalWidth, height: context.logicalHeight }
}

function mergeProvenance(...items: readonly NativePackageProvenance[]) {
  return normalizeProvenance(
    items.map(item => item.contentPackageId).find(Boolean),
    items.flatMap(item => item.requiredRuntimePackages || []),
  )
}

function normalizeProvenance(contentPackageId: string | undefined, requiredRuntimePackages: readonly string[]) {
  const packages = [...new Set(requiredRuntimePackages.map(item => item.trim()).filter(Boolean))].sort()
  return {
    ...(contentPackageId ? { contentPackageId } : {}),
    ...(packages.length > 0 ? { requiredRuntimePackages: packages } : {}),
  }
}

function parsePatch(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') {
    throw new TypeError('Native settings intent requires string payload field "patchJson".')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  }
  catch {
    throw new Error('Native settings intent payload field "patchJson" must contain valid JSON.')
  }
  if (!isSafeJsonRecord(parsed)) {
    throw new Error('Native settings intent payload field "patchJson" must contain a safe object patch.')
  }
  return parsed
}

function isSafeJsonRecord(value: unknown): value is Record<string, unknown> {
  const record = recordValue(value)
  if (!record) {
    return false
  }
  return Object.entries(record).every(([key, item]) => {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return false
    }
    if (Array.isArray(item)) {
      return item.every(isSafeJsonValue)
    }
    return recordValue(item) ? isSafeJsonRecord(item) : isSafeJsonValue(item)
  })
}

function isSafeJsonValue(value: unknown): boolean {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value))
    || (Array.isArray(value) && value.every(isSafeJsonValue))
    || (recordValue(value) !== undefined && isSafeJsonRecord(value))
}

function safeId(value: string): string {
  return value.replace(/[^\w-]+/g, '-')
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Native settings intent requires string payload field "${field}".`)
  }
  return value
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(isString) : []
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function finiteInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
