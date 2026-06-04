import type { CocosHostNode } from '@quajs/cocos-host'
import type { SettingsProjection } from '@quajs/plugin-settings/contracts'
import type { SettingsFieldFormProjection, SettingsScopeFormProjection } from '@quajs/plugin-settings/form'
import type { CocosRendererPluginContext } from '../types'
import {
  SETTINGS_PLUGIN_ID,
  SettingsRenderToLogicEvents,
} from '@quajs/plugin-settings/contracts'
import {
  createSettingsFormProjection,
  createSettingsOptions,
  createSettingsValuePatch,
  encodeSettingsOptionValue,
  isSettingsGroupField,
  parseSettingsControlValue,
  settingsFieldControlKind,
  settingsValuesEqual,
  stringifySettingsInputValue,
} from '@quajs/plugin-settings/form'
import { clientPointToStageLogical, LogicToRenderEvents } from '@quajs/render-core'
import { applyCocosUiControlSkin } from '../ui-skin'
import { defineCocosRendererPlugin } from './core'

const DEFAULT_SETTINGS_ELEMENT_ID = 'settings'

export interface SettingsCocosRendererPluginOptions {
  elementId?: string
}

export function createSettingsCocosRendererPlugin(options: SettingsCocosRendererPluginOptions = {}) {
  return defineCocosRendererPlugin({
    name: '@quajs/renderer-cocos/settings',
    setup(context) {
      const elementId = options.elementId || DEFAULT_SETTINGS_ELEMENT_ID
      const sync = () => {
        void renderSettingsLayer(context, elementId).catch(error => context.reportError(error, {
          message: 'Cocos settings projection failed.',
          phase: 'renderer-cocos:settings',
          pluginName: '@quajs/renderer-cocos/settings',
        }))
      }
      context.addDisposer(context.onLogicToRender(LogicToRenderEvents.VIEW_UPDATE, sync))
      context.addDisposer(context.cocos.host.input.onInput(async (event) => {
        if (event.kind !== 'pointer' || event.phase !== 'down')
          return
        const metadata = resolveSettingsActionMetadata(context, event)
        if (!metadata)
          return
        await dispatchSettingsAction(context, elementId, metadata, event.metadata)
      }))
      sync()
    },
  })
}

export const settingsCocosRendererPlugin = createSettingsCocosRendererPlugin()

async function renderSettingsLayer(context: CocosRendererPluginContext, elementId: string): Promise<void> {
  const layer = context.cocos.getLayerNode('settings', 'settings-layer', 100)
  context.cocos.host.nodes.clearChildren(layer)
  context.cocos.releaseLayerResources('settings')

  const projection = getSettingsProjectionFromView(context)
  if (!projection || !isSettingsOverlayVisible(context, elementId)) {
    context.cocos.host.nodes.setNodeMetadata?.(layer, {
      plugin: 'settings',
      visible: false,
    })
    return
  }

  const form = createSettingsFormProjection(projection)
  const safeArea = context.cocos.getStageLayout().safeArea
  const panelWidth = Math.min(1040, safeArea.width)
  const panelHeight = Math.min(820, context.cocos.getStageLayout().logicalHeight - safeArea.y * 2)
  const panelX = safeArea.x + Math.max(0, (safeArea.width - panelWidth) / 2)
  const panelY = safeArea.y + 48
  const panel = context.cocos.host.nodes.createNode('settings-panel', { parent: layer, name: elementId })
  context.cocos.host.nodes.setNodeTransform(panel, {
    x: panelX,
    y: panelY,
    width: panelWidth,
    height: panelHeight,
    zIndex: 0,
  })
  context.cocos.host.nodes.setNodeControl?.(panel, {
    kind: 'panel',
    label: 'Settings',
  })
  context.cocos.host.nodes.setNodeMetadata?.(panel, {
    plugin: 'settings',
    settingsAction: 'panel',
    elementId,
    revision: form.revision,
  })
  await applyCocosUiControlSkin(context.cocos, panel, {
    layerId: 'settings',
    resourceKey: 'panel',
    kind: 'panel',
  })

  const title = context.cocos.host.nodes.createNode('settings-title', { parent: panel, name: 'settings:title' })
  context.cocos.host.nodes.setNodeText(title, 'Settings', { fontSize: 34, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, {
    x: panelX + 32,
    y: panelY + 24,
    width: panelWidth - 260,
    height: 48,
    zIndex: 1,
  })

  await renderSettingsButton(context, panel, {
    name: 'settings:reset-all',
    label: 'Reset',
    x: panelX + panelWidth - 260,
    y: panelY + 24,
    width: 104,
    height: 46,
    metadata: { settingsAction: 'resetAll' },
  })
  await renderSettingsButton(context, panel, {
    name: 'settings:close',
    label: 'Close',
    x: panelX + panelWidth - 144,
    y: panelY + 24,
    width: 112,
    height: 46,
    metadata: { settingsAction: 'close', elementId },
  })

  const cursor = { y: panelY + 92 }
  for (const scope of form.scopes) {
    await renderSettingsScope(context, panel, scope, {
      x: panelX + 32,
      width: panelWidth - 64,
      cursor,
    })
  }
}

async function renderSettingsScope(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  scope: SettingsScopeFormProjection,
  layout: {
    x: number
    width: number
    cursor: { y: number }
  },
): Promise<void> {
  const title = context.cocos.host.nodes.createNode('settings-scope-title', { parent, name: `settings:scope:${scope.scope}` })
  context.cocos.host.nodes.setNodeText(title, scope.title || scope.scope, { fontSize: 28, color: '#ffffff' })
  context.cocos.host.nodes.setNodeTransform(title, {
    x: layout.x,
    y: layout.cursor.y,
    width: layout.width - 128,
    height: 40,
    zIndex: 2,
  })
  await renderSettingsButton(context, parent, {
    name: `settings:scope:${scope.scope}:reset`,
    label: 'Reset',
    x: layout.x + layout.width - 112,
    y: layout.cursor.y,
    width: 112,
    height: 38,
    metadata: { settingsAction: 'resetScope', settingsScope: scope.scope },
  })
  layout.cursor.y += 48

  if (scope.description) {
    const description = context.cocos.host.nodes.createNode('settings-scope-description', { parent, name: `settings:scope:${scope.scope}:description` })
    context.cocos.host.nodes.setNodeText(description, scope.description, { fontSize: 20, color: '#d8d8d8' })
    context.cocos.host.nodes.setNodeTransform(description, {
      x: layout.x,
      y: layout.cursor.y,
      width: layout.width,
      height: 34,
      zIndex: 2,
    })
    layout.cursor.y += 40
  }

  for (const group of scope.groups) {
    if (group.label || group.id !== 'default') {
      const groupTitle = context.cocos.host.nodes.createNode('settings-group-title', { parent, name: `settings:group:${scope.scope}:${group.id}` })
      context.cocos.host.nodes.setNodeText(groupTitle, group.label || group.id, { fontSize: 24, color: '#ffffff' })
      context.cocos.host.nodes.setNodeTransform(groupTitle, {
        x: layout.x,
        y: layout.cursor.y,
        width: layout.width,
        height: 34,
        zIndex: 2,
      })
      layout.cursor.y += 40
    }
    for (const field of group.fields) {
      await renderSettingsField(context, parent, scope, field, layout, 0)
    }
  }
  layout.cursor.y += 16
}

async function renderSettingsField(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  layout: {
    x: number
    width: number
    cursor: { y: number }
  },
  depth: number,
): Promise<void> {
  if (field.control.hidden)
    return

  const control = settingsFieldControlKind(field)
  const x = layout.x + depth * 24
  const width = layout.width - depth * 24
  if (isSettingsGroupField(field)) {
    const groupTitle = context.cocos.host.nodes.createNode('settings-nested-group-title', { parent, name: `settings:field:${scope.scope}:${field.pathKey}` })
    context.cocos.host.nodes.setNodeText(groupTitle, field.control.label || field.name, { fontSize: 22, color: '#ffffff' })
    context.cocos.host.nodes.setNodeTransform(groupTitle, {
      x,
      y: layout.cursor.y,
      width,
      height: 34,
      zIndex: 2,
    })
    layout.cursor.y += 38
    for (const child of field.children || []) {
      await renderSettingsField(context, parent, scope, child, layout, depth + 1)
    }
    return
  }

  const label = field.control.label || field.name
  const row = context.cocos.host.nodes.createNode('settings-field', { parent, name: `settings:field:${scope.scope}:${field.pathKey}` })
  context.cocos.host.nodes.setNodeText(row, `${label}: ${stringifySettingsInputValue(field)}`, {
    fontSize: 22,
    color: field.readonly ? '#aaaaaa' : '#ffffff',
  })
  context.cocos.host.nodes.setNodeTransform(row, {
    x,
    y: layout.cursor.y,
    width,
    height: 48,
    zIndex: 2,
  })
  const metadata = settingsFieldMetadata(scope, field, control)
  context.cocos.host.nodes.setNodeMetadata?.(row, metadata)
  context.cocos.host.nodes.setNodeControl?.(row, settingsNodeControl(field, control))
  await applyCocosUiControlSkin(context.cocos, row, {
    layerId: 'settings',
    resourceKey: `field:${scope.scope}:${field.pathKey}`,
    kind: settingsSkinKind(control),
    disabled: field.readonly,
    selected: control === 'switch' || control === 'checkbox' ? Boolean(field.value) : undefined,
  })
  layout.cursor.y += field.control.description || field.schema.description ? 76 : 58

  const description = field.control.description || field.schema.description
  if (description) {
    const descriptionNode = context.cocos.host.nodes.createNode('settings-field-description', { parent, name: `settings:field:${scope.scope}:${field.pathKey}:description` })
    context.cocos.host.nodes.setNodeText(descriptionNode, description, { fontSize: 18, color: '#d0d0d0' })
    context.cocos.host.nodes.setNodeTransform(descriptionNode, {
      x,
      y: layout.cursor.y - 28,
      width,
      height: 26,
      zIndex: 2,
    })
  }
}

async function renderSettingsButton(
  context: CocosRendererPluginContext,
  parent: CocosHostNode,
  options: {
    name: string
    label: string
    x: number
    y: number
    width: number
    height: number
    metadata: Record<string, unknown>
  },
): Promise<void> {
  const node = context.cocos.host.nodes.createNode('settings-button', { parent, name: options.name })
  context.cocos.host.nodes.setNodeText(node, options.label, { fontSize: 22, color: '#ffffff' })
  context.cocos.host.nodes.setNodeControl?.(node, {
    kind: 'button',
    label: options.label,
  })
  context.cocos.host.nodes.setNodeTransform(node, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    zIndex: 3,
  })
  context.cocos.host.nodes.setNodeMetadata?.(node, options.metadata)
  await applyCocosUiControlSkin(context.cocos, node, {
    layerId: 'settings',
    resourceKey: options.name,
    kind: 'button',
  })
}

function settingsFieldMetadata(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  control: string,
): Record<string, unknown> {
  return {
    settingsAction: 'updateField',
    settingsScope: scope.scope,
    settingsPath: [...field.path],
    settingsPathKey: field.pathKey,
    settingsControl: control,
    settingsReadonly: field.readonly,
    settingsValue: field.value,
    settingsEncodedValue: encodeSettingsOptionValue(field.value),
  }
}

function settingsNodeControl(field: SettingsFieldFormProjection, control: string) {
  const value = stringifySettingsInputValue(field)
  if (control === 'switch' || control === 'checkbox') {
    return {
      kind: 'toggle' as const,
      checked: Boolean(field.value),
      value,
      disabled: field.readonly,
      readonly: field.readonly,
      label: field.control.label || field.name,
    }
  }
  if (control === 'select' || control === 'radio') {
    return {
      kind: control === 'radio' ? 'tab' as const : 'select' as const,
      value: encodeSettingsOptionValue(field.value),
      disabled: field.readonly,
      readonly: field.readonly,
      label: field.control.label || field.name,
      options: createSettingsOptions(field).map(option => ({
        label: option.label || String(option.value),
        value: encodeSettingsOptionValue(option.value),
        selected: settingsValuesEqual(option.value, field.value),
      })),
    }
  }
  if (control === 'slider' || control === 'range') {
    return {
      kind: 'slider' as const,
      value,
      min: field.control.min ?? field.schema.minimum,
      max: field.control.max ?? field.schema.maximum,
      step: field.control.step ?? field.schema.multipleOf,
      disabled: field.readonly,
      readonly: field.readonly,
      label: field.control.label || field.name,
    }
  }
  return {
    kind: control === 'textarea' ? 'textarea' as const : 'input' as const,
    value,
    placeholder: field.control.placeholder,
    disabled: field.readonly,
    readonly: field.readonly,
    label: field.control.label || field.name,
  }
}

function settingsSkinKind(control: string): 'button' | 'panel' | 'input' | 'tab' | 'toggle' {
  if (control === 'switch' || control === 'checkbox')
    return 'toggle'
  if (control === 'select' || control === 'radio')
    return 'tab'
  return 'input'
}

function resolveSettingsActionMetadata(
  context: CocosRendererPluginContext,
  event: { x?: number, y?: number, targetNode?: unknown, metadata?: Record<string, unknown> },
): Record<string, unknown> | undefined {
  if (typeof event.metadata?.settingsAction === 'string')
    return event.metadata
  const targetNode = event.targetNode
  if (targetNode) {
    const metadata = context.cocos.host.nodes.getNodeMetadata?.(targetNode as Parameters<typeof context.cocos.host.nodes.getNodeMetadata>[0])
    return typeof metadata?.settingsAction === 'string' ? metadata : undefined
  }
  const point = clientPointToStageLogical(context.cocos.getStageLayout(), {
    clientX: event.x ?? 0,
    clientY: event.y ?? 0,
  })
  const hit = context.cocos.host.nodes.hitTest?.(context.cocos.getRootNode(), point, { metadataKey: 'settingsAction' })
  return typeof hit?.metadata?.settingsAction === 'string' ? hit.metadata : undefined
}

async function dispatchSettingsAction(
  context: CocosRendererPluginContext,
  elementId: string,
  metadata: Record<string, unknown>,
  inputMetadata: Record<string, unknown> | undefined,
): Promise<void> {
  const action = metadata.settingsAction
  if (action === 'panel')
    return
  if (action === 'close') {
    await context.cocos.getActions().requestUiClose(stringValue(metadata.elementId, elementId))
    return
  }
  if (action === 'resetAll') {
    await context.cocos.getActions().requestPluginEvent(SettingsRenderToLogicEvents.RESET_ALL_REQUEST)
    return
  }
  if (action === 'resetScope' && typeof metadata.settingsScope === 'string') {
    await context.cocos.getActions().requestPluginEvent(SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, {
      scope: metadata.settingsScope,
    })
    return
  }
  if (action !== 'updateField' || metadata.settingsReadonly === true)
    return

  const projection = getSettingsProjectionFromView(context)
  if (!projection || typeof metadata.settingsScope !== 'string' || typeof metadata.settingsPathKey !== 'string')
    return
  const form = createSettingsFormProjection(projection)
  const scope = form.scopes.find(item => item.scope === metadata.settingsScope)
  const field = findSettingsField(scope, metadata.settingsPathKey)
  if (!scope || !field || field.readonly)
    return

  const next = nextSettingsFieldValue(field, inputMetadata)
  if (!next.ok)
    return
  await context.cocos.getActions().requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, next.value),
  })
}

function nextSettingsFieldValue(
  field: SettingsFieldFormProjection,
  inputMetadata: Record<string, unknown> | undefined,
): { ok: boolean, value?: unknown } {
  const control = settingsFieldControlKind(field)
  const inputValue = inputMetadata?.value ?? inputMetadata?.settingsValue
  if (inputValue !== undefined) {
    if (control === 'switch' || control === 'checkbox') {
      const checked = typeof inputValue === 'boolean' ? inputValue : String(inputValue) === 'true'
      return parseSettingsControlValue(field, String(inputValue), checked)
    }
    return parseSettingsControlValue(field, String(inputValue), false)
  }

  if (control === 'switch' || control === 'checkbox')
    return { ok: true, value: !field.value }

  if (control === 'select' || control === 'radio') {
    const options = createSettingsOptions(field)
    if (options.length === 0)
      return { ok: false }
    const currentIndex = options.findIndex(option => settingsValuesEqual(option.value, field.value))
    const nextOption = options[(currentIndex + 1) % options.length] || options[0]
    return { ok: true, value: nextOption.value }
  }

  if (control === 'slider' || control === 'range') {
    const min = finiteNumber(field.control.min, finiteNumber(field.schema.minimum, 0))
    const max = finiteNumber(field.control.max, finiteNumber(field.schema.maximum, 1))
    const step = finiteNumber(field.control.step, finiteNumber(field.schema.multipleOf, 1))
    const current = finiteNumber(field.value, min)
    const next = current + step > max ? min : current + step
    return { ok: true, value: next }
  }

  return { ok: false }
}

function findSettingsField(scope: SettingsScopeFormProjection | undefined, pathKey: string): SettingsFieldFormProjection | undefined {
  if (!scope)
    return undefined
  for (const group of scope.groups) {
    for (const field of group.fields) {
      const match = findSettingsFieldInTree(field, pathKey)
      if (match)
        return match
    }
  }
  return undefined
}

function findSettingsFieldInTree(field: SettingsFieldFormProjection, pathKey: string): SettingsFieldFormProjection | undefined {
  if (field.pathKey === pathKey)
    return field
  for (const child of field.children || []) {
    const match = findSettingsFieldInTree(child, pathKey)
    if (match)
      return match
  }
  return undefined
}

function getSettingsProjectionFromView(context: CocosRendererPluginContext): SettingsProjection | undefined {
  return context.getViewState().plugins[SETTINGS_PLUGIN_ID] as SettingsProjection | undefined
}

function isSettingsOverlayVisible(context: CocosRendererPluginContext, elementId: string): boolean {
  const overlay = context.getViewState().ui.overlays?.[elementId] as { open?: unknown } | undefined
  return Boolean(overlay && overlay.open !== false)
}

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
