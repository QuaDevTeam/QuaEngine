import type { NativeRendererFeatureSurfaceContext, NativeRendererFeatureSurfaceEntry } from '@quajs/engine-native'
import type {
  NativePackageProvenance,
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
  const maxPanelWidth = context.logicalHeight * 1.12
  const panelWidth = Math.min(context.safeArea.width - edge * 2, maxPanelWidth)
  const panel = {
    x: context.safeArea.x + (context.safeArea.width - panelWidth) / 2,
    y: context.safeArea.y + edge,
    width: panelWidth,
    height: context.safeArea.height - edge * 2,
  }
  const headerHeight = 88
  const content = {
    x: panel.x + edge,
    y: panel.y + headerHeight,
    width: panel.width - edge * 2,
    height: panel.height - headerHeight - edge,
  }
  const columns = content.width >= 900 ? 2 : 1
  const columnGap = 18
  const columnWidth = (content.width - columnGap * (columns - 1)) / columns
  const rowHeight = 64
  const rows = Math.max(1, Math.floor(content.height / rowHeight))
  const capacity = rows * columns
  const fields = form.scopes.flatMap(scope => flattenScopeFields(scope)).slice(0, capacity)

  return node('settings-root', 'Fragment', stage(context), {
    provenance,
    children: [
      node('settings-backdrop', 'Backdrop', stage(context), {
        intent: uiIntent(ACTIONS.close, { targetId: SETTINGS_ELEMENT_ID }),
        provenance,
        style: { backgroundColor: '#050608', opacity: 0.84 },
      }),
      node('settings-panel', 'Panel', panel, {
        provenance,
        style: { backgroundColor: '#12171d', borderColor: '#626d7a', borderRadius: 6, borderWidth: 1 },
        children: [
          node('settings-title', 'Text', {
            x: panel.x + edge,
            y: panel.y + 24,
            width: panel.width - edge * 2 - 224,
            height: 44,
          }, {
            text: 'Settings',
            provenance,
            style: { color: '#f4f6f8', fontSize: 34, fontWeight: 700 },
          }),
          node('settings-reset-all', 'Button', {
            x: panel.x + panel.width - edge - 216,
            y: panel.y + 22,
            width: 102,
            height: 46,
          }, {
            text: 'Reset all',
            intent: uiIntent(ACTIONS.resetAll),
            provenance,
            style: buttonStyle('#59442f'),
          }),
          node('settings-close', 'Button', {
            x: panel.x + panel.width - edge - 104,
            y: panel.y + 22,
            width: 104,
            height: 46,
          }, {
            text: 'Close',
            intent: uiIntent(ACTIONS.close, { targetId: SETTINGS_ELEMENT_ID }),
            provenance,
            style: buttonStyle('#303943'),
          }),
          ...fields.map((item, index) => createFieldNode(
            item.scope,
            item.field,
            {
              x: content.x + (index % columns) * (columnWidth + columnGap),
              y: content.y + Math.floor(index / columns) * rowHeight,
              width: columnWidth,
              height: rowHeight - 10,
            },
            provenance,
          )),
          ...(fields.length === 0
            ? [node('settings-empty', 'Text', content, {
                text: 'No player settings',
                provenance,
                style: { color: '#a5afba', fontSize: 24, textAlign: 'center' },
              })]
            : []),
        ],
      }),
    ],
  })
}

function createFieldNode(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection | undefined,
  bounds: NativeUiSurfaceRect,
  inherited: NativePackageProvenance,
): NativeUiSurfaceNodeProjection {
  const provenance = mergeProvenance(inherited, scopeProvenance(scope))
  if (!field) {
    return node(`settings-scope-${safeId(scope.scope)}`, 'Button', bounds, {
      text: `${scope.title || scope.scope} - Reset`,
      intent: uiIntent(ACTIONS.resetScope, { scope: scope.scope }),
      provenance,
      style: buttonStyle('#222c36'),
    })
  }
  const nextValue = nextFieldValue(field)
  const label = field.control.label || field.name
  const value = stringifySettingsInputValue(field)
  const error = field.errors[0]?.message
  const intent = !field.readonly && nextValue.available
    ? uiIntent(ACTIONS.update, {
        patchJson: JSON.stringify(createSettingsValuePatch(scope.source, field.path, nextValue.value)),
        scope: scope.scope,
      })
    : undefined
  return node(`settings-field-${safeId(scope.scope)}-${safeId(field.pathKey)}`, intent ? 'Button' : 'Panel', bounds, {
    text: `${label}: ${value}${error ? ` - ${error}` : ''}`,
    intent,
    provenance,
    style: {
      ...buttonStyle(error ? '#512f34' : field.readonly ? '#252a30' : '#1d2833'),
      color: field.readonly ? '#9ba3ad' : '#eef1f5',
      textAlign: 'left',
    },
  })
}

function flattenScopeFields(scope: SettingsScopeFormProjection) {
  const fields = scope.groups.flatMap(group => group.fields.flatMap(flattenField)).filter(field => field.control.hidden !== true)
  return [
    { scope, field: undefined },
    ...fields.map(field => ({ scope, field })),
  ]
}

function flattenField(field: SettingsFieldFormProjection): SettingsFieldFormProjection[] {
  return field.children?.length ? field.children.flatMap(flattenField) : [field]
}

function nextFieldValue(field: SettingsFieldFormProjection): { available: boolean, value?: unknown } {
  const control = settingsFieldControlKind(field)
  if (control === 'switch' || control === 'checkbox') {
    return { available: true, value: !field.value }
  }
  if (control === 'select' || control === 'radio') {
    const options = createSettingsOptions(field)
    if (options.length === 0) {
      return { available: false }
    }
    const index = options.findIndex(option => settingsValuesEqual(option.value, field.value))
    return { available: true, value: (options[(index + 1) % options.length] || options[0]).value }
  }
  if (control === 'slider' || control === 'range' || control === 'number') {
    const min = finiteNumber(field.control.min) ?? finiteNumber(field.schema.minimum) ?? 0
    const max = finiteNumber(field.control.max) ?? finiteNumber(field.schema.maximum) ?? Math.max(min + 10, Number(field.value) || 0)
    const step = finiteNumber(field.control.step) ?? finiteNumber(field.schema.multipleOf) ?? 1
    const current = finiteNumber(field.value) ?? min
    return { available: true, value: current + step > max ? min : current + step }
  }
  return { available: false }
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

function buttonStyle(backgroundColor: string) {
  return {
    backgroundColor,
    borderColor: '#667381',
    borderRadius: 4,
    borderWidth: 1,
    color: '#f2f4f7',
    fontSize: 17,
    textAlign: 'center' as const,
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
