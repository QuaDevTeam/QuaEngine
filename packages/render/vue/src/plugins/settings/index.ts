import type { SettingsProjection } from '@quajs/plugin-settings/contracts'
import type { ViewUiOverlayProjection, ViewUiSceneProjection } from '@quajs/render-core'
import type { RendererActions, UiSkinControlKind } from '@quajs/renderer-web'
import type {
  SettingsFieldFormProjection,
  SettingsFieldGroupProjection,
  SettingsFormProjection,
  SettingsInputParseResult,
  SettingsScopeFormProjection,
} from '@quajs/renderer-web/plugins/settings'
import type { Component, PropType, VNode } from 'vue'
import type { QuaVueRendererPlugin } from '../core'
import { SETTINGS_PLUGIN_ID, SettingsRenderToLogicEvents } from '@quajs/plugin-settings/contracts'
import { DEFAULT_UI_OVERLAY_Z_INDEXES } from '@quajs/render-core'
import {
  createSettingsFormProjection,
  createSettingsValuePatch,
  encodeSettingsOptionValue,
  getSettingsProjectionFromView,
  isSettingsOverlayVisible,
  parseSettingsControlValue,
  stringifySettingsInputValue,
} from '@quajs/renderer-web/plugins/settings'
import { uiSceneDataAttributes } from '@quajs/renderer-web/plugins/shared'
import { computed, defineComponent, h } from 'vue'
import { usePluginProjection, useUiControlSkin } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'
import { dispatchVueRendererIntent } from '../shared/intent'
import { createUiOverlayStackBinding } from '../shared/overlay'

export interface SettingsRendererPluginOptions {
  elementId?: string
  customControls?: SettingsCustomControlRegistry
}

export type SettingsCustomControlRegistry = Readonly<Record<string, Component>>

export interface SettingsCustomControlComponentProps {
  scope: SettingsScopeFormProjection
  field: SettingsFieldFormProjection
  value: unknown
  readonly: boolean
  disabled: boolean
  update: (value: unknown) => void
}

export interface SettingsLayerSlotPayload {
  settings: SettingsProjection
  form: SettingsFormProjection
  actions: RendererActions
  elementId: string
  close: () => void
  resetAll: () => void
}

export interface SettingsFormSlotPayload {
  form: SettingsFormProjection
  actions: RendererActions
  elementId: string
  close: () => void
  resetAll: () => void
}

export interface SettingsScopeSlotPayload {
  scope: SettingsScopeFormProjection
  actions: RendererActions
  resetScope: () => void
}

export interface SettingsGroupSlotPayload {
  scope: SettingsScopeFormProjection
  group: SettingsFieldGroupProjection
  actions: RendererActions
}

export interface SettingsFieldSlotPayload extends SettingsCustomControlComponentProps {
  inputId: string
  control: string
  description?: string
  errors: SettingsFieldFormProjection['errors']
}

export type SettingsControlSlotPayload = SettingsFieldSlotPayload

const DEFAULT_SETTINGS_ELEMENT_ID = 'settings'
const DEFAULT_GROUP_ID = 'default'

type UiControlSkinBinding = ReturnType<typeof useUiControlSkin>
type SettingsRendererIntentTarget = Pick<ReturnType<typeof useQuaRenderer>, 'web'>

interface SettingsControlSkins {
  input: UiControlSkinBinding
  tab: UiControlSkinBinding
  toggle: UiControlSkinBinding
}

export function useSettingsProjection() {
  return usePluginProjection<SettingsProjection>(SETTINGS_PLUGIN_ID)
}

export const QuaSettingsControl: Component = defineComponent({
  name: 'QuaSettingsControl',
  props: {
    scope: {
      type: Object as PropType<SettingsScopeFormProjection>,
      required: true,
    },
    field: {
      type: Object as PropType<SettingsFieldFormProjection>,
      required: true,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }): () => VNode | VNode[] {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const inputSkin = useUiControlSkin({
      kind: 'input',
      disabled: () => props.field.readonly,
    })
    const tabSkin = useUiControlSkin({
      kind: 'tab',
      disabled: () => props.field.readonly,
    })
    const toggleSkin = useUiControlSkin({
      kind: 'toggle',
      disabled: () => props.field.readonly,
      selected: () => Boolean(props.field.value),
    })

    return () => slots.control?.(createSettingsFieldSlotPayload(renderer, actions, props.scope, props.field))
      || renderControl(renderer, actions, props.scope, props.field, props.customControls, {
        input: inputSkin,
        tab: tabSkin,
        toggle: toggleSkin,
      })
  },
})

export const QuaSettingsField: Component = defineComponent({
  name: 'QuaSettingsField',
  props: {
    scope: {
      type: Object as PropType<SettingsScopeFormProjection>,
      required: true,
    },
    field: {
      type: Object as PropType<SettingsFieldFormProjection>,
      required: true,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }): () => VNode | VNode[] | null {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    return () => {
      const field = props.field
      if (field.control.hidden) {
        return null
      }

      const payload = createSettingsFieldSlotPayload(renderer, actions, props.scope, field)
      const replacement = slots.field?.(payload)
      if (replacement) {
        return replacement
      }

      return h('div', createSettingsFieldAttrs(field), isSettingsGroupField(field)
        ? [renderNestedGroup(props.scope, field, props.customControls, slots)]
        : [
            h('div', { class: 'qua-settings-field-main' }, [
              h('div', { class: 'qua-settings-field-copy' }, [
                slots['field-label']?.(payload) || h('label', {
                  class: 'qua-settings-field-label',
                  for: payload.inputId,
                }, field.control.label || field.name),
                slots['field-description']?.(payload) || (payload.description
                  ? h('p', { class: 'qua-settings-field-description' }, payload.description)
                  : null),
              ]),
              slots['field-control']?.(payload) || h('div', { class: 'qua-settings-field-control' }, [
                h(QuaSettingsControl, {
                  scope: props.scope,
                  field,
                  customControls: props.customControls,
                }, slots),
              ]),
            ]),
            slots['field-errors']?.(payload) || renderSettingsFieldErrors(field),
          ])
    }
  },
})

export const QuaSettingsGroup = defineComponent({
  name: 'QuaSettingsGroup',
  props: {
    scope: {
      type: Object as PropType<SettingsScopeFormProjection>,
      required: true,
    },
    group: {
      type: Object as PropType<SettingsFieldGroupProjection>,
      required: true,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    return () => {
      const payload = createSettingsGroupSlotPayload(actions, props.scope, props.group)
      const replacement = slots.group?.(payload)
      if (replacement) {
        return replacement
      }

      return h('fieldset', {
        'class': 'qua-settings-group',
        'data-settings-group': props.group.id,
      }, [
        slots['group-header']?.(payload) || [
          props.group.label || props.group.id !== DEFAULT_GROUP_ID
            ? h('legend', { class: 'qua-settings-group-title' }, props.group.label || props.group.id)
            : null,
          props.group.description
            ? h('p', { class: 'qua-settings-group-description' }, props.group.description)
            : null,
        ],
        props.group.fields.map(field => h(QuaSettingsField, {
          key: field.pathKey,
          field,
          scope: props.scope,
          customControls: props.customControls,
        }, slots)),
      ])
    }
  },
})

export const QuaSettingsScope = defineComponent({
  name: 'QuaSettingsScope',
  props: {
    scope: {
      type: Object as PropType<SettingsScopeFormProjection>,
      required: true,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    return () => {
      const payload = createSettingsScopeSlotPayload(renderer, actions, props.scope)
      const replacement = slots.scope?.(payload)
      if (replacement) {
        return replacement
      }

      return h('section', {
        'class': 'qua-settings-scope',
        'data-settings-scope': props.scope.scope,
      }, [
        slots['scope-header']?.(payload) || h('header', { class: 'qua-settings-scope-header' }, [
          h('h3', { class: 'qua-settings-scope-title' }, props.scope.title || props.scope.scope),
        ]),
        props.scope.description
          ? h('p', { class: 'qua-settings-scope-description' }, props.scope.description)
          : null,
        props.scope.groups.map(group => h(QuaSettingsGroup, {
          key: group.id,
          group,
          scope: props.scope,
          customControls: props.customControls,
        }, slots)),
      ])
    }
  },
})

export const QuaSettingsForm = defineComponent({
  name: 'QuaSettingsForm',
  props: {
    form: {
      type: Object as PropType<SettingsFormProjection>,
      required: true,
    },
    elementId: {
      type: String,
      default: DEFAULT_SETTINGS_ELEMENT_ID,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }) {
    const renderer = useQuaRenderer()
    const actions = renderer.actions
    const panelSkin = useUiControlSkin({ kind: 'panel' })
    const closeSkin = useUiControlSkin({ kind: 'button' })
    const resetAllSkin = useUiControlSkin({ kind: 'button' })
    return () => {
      const payload = createSettingsFormSlotPayload(renderer, actions, props.form, props.elementId)
      return h('section', {
        'class': 'qua-settings-panel',
        'style': panelSkin.skinStyle.value,
        'data-skin-kind': 'panel',
        'data-skin-reference': panelSkin.skinReference.value || undefined,
        'data-skin-state': panelSkin.skinState.value,
        'data-settings-overlay': props.elementId,
      }, [
        slots['form-header']?.(payload) || h('header', { class: 'qua-settings-header' }, [
          h('h2', { class: 'qua-settings-title' }, 'Settings'),
          h('div', { class: 'qua-settings-header-actions' }, [
            h('button', {
              'class': 'qua-settings-reset-all',
              'type': 'button',
              'style': resetAllSkin.skinStyle.value,
              'data-skin-kind': 'button',
              'data-skin-reference': resetAllSkin.skinReference.value || undefined,
              'data-skin-state': resetAllSkin.skinState.value,
              ...createSkinButtonHandlers(resetAllSkin),
              'onClick': payload.resetAll,
            }, 'Reset'),
            h('button', {
              'class': 'qua-settings-close',
              'type': 'button',
              'style': closeSkin.skinStyle.value,
              'data-skin-kind': 'button',
              'data-skin-reference': closeSkin.skinReference.value || undefined,
              'data-skin-state': closeSkin.skinState.value,
              ...createSkinButtonHandlers(closeSkin),
              'onClick': payload.close,
            }, 'Close'),
          ]),
        ]),
        h('form', {
          class: 'qua-settings-form',
          onSubmit: (event: Event) => event.preventDefault(),
        }, props.form.scopes.map(scope => h(QuaSettingsScope, {
          key: scope.scope,
          scope,
          customControls: props.customControls,
        }, slots))),
        slots['form-actions']?.(payload),
      ])
    }
  },
})

export const QuaSettingsLayer = defineComponent({
  name: 'QuaSettingsLayer',
  props: {
    elementId: {
      type: String,
      default: DEFAULT_SETTINGS_ELEMENT_ID,
    },
    customControls: {
      type: Object as PropType<SettingsCustomControlRegistry>,
      required: false,
    },
  },
  setup(props, { slots }) {
    const renderer = useQuaRenderer()
    const { view } = renderer
    const actions = renderer.actions
    const settings = computed(() => getSettingsProjectionFromView(view.value))
    const form = computed(() => settings.value ? createSettingsFormProjection(settings.value) : undefined)
    const visible = computed(() => Boolean(form.value && isSettingsOverlayVisible(view.value, props.elementId)))
    const overlay = computed(() => view.value.ui.overlays?.[props.elementId] as ViewUiOverlayProjection | undefined)
    const scene = computed(() => overlay.value?.scene as ViewUiSceneProjection | undefined)
    const overlayStack = computed(() => createUiOverlayStackBinding(overlay.value, {
      overlayStack: 'overlay',
      zIndex: DEFAULT_UI_OVERLAY_Z_INDEXES.settings,
    }))

    return () => visible.value && settings.value && form.value
      ? h('div', {
          class: [
            'qua-settings-layer',
            scene.value ? 'qua-settings-layer--ui-scene' : undefined,
            scene.value?.presentation === 'scene' ? 'qua-settings-layer--scene' : undefined,
            scene.value?.presentation === 'overlay' ? 'qua-settings-layer--overlay' : undefined,
          ],
          ...uiSceneDataAttributes(scene.value),
          ...overlayStack.value.attrs,
          style: { pointerEvents: 'auto', ...overlayStack.value.style },
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.(createSettingsLayerSlotPayload(renderer, actions, settings.value, form.value, props.elementId)) || h(QuaSettingsForm, {
          form: form.value,
          elementId: props.elementId,
          customControls: props.customControls,
        }, slots))
      : null
  },
})

export function createSettingsRendererPlugin(options: SettingsRendererPluginOptions = {}): QuaVueRendererPlugin {
  return defineVueRendererPlugin({
    name: '@quajs/renderer-vue/settings',
    setup() {},
    layers: [{
      id: 'settings',
      slot: 'settings',
      component: QuaSettingsLayer,
      order: 96,
      plane: 'screen',
      props: {
        elementId: options.elementId || DEFAULT_SETTINGS_ELEMENT_ID,
        customControls: options.customControls,
      },
    }],
  })
}

export const settingsRendererPlugin = createSettingsRendererPlugin()

function renderNestedGroup(
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  customControls: SettingsCustomControlRegistry | undefined,
  slots: Readonly<Record<string, any>>,
): VNode {
  return h('fieldset', { class: 'qua-settings-nested-group' }, [
    h('legend', { class: 'qua-settings-field-label' }, field.control.label || field.name),
    field.children?.map(child => h(QuaSettingsField, {
      key: child.pathKey,
      scope,
      field: child,
      customControls,
    }, slots)),
  ])
}

function renderControl(
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  customControls: SettingsCustomControlRegistry | undefined,
  skins: SettingsControlSkins,
) {
  const control = field.control.control || 'text'
  if (control === 'custom') {
    return renderCustomControl(renderer, actions, scope, field, customControls, skins.input)
  }

  if (control === 'textarea' || fieldSchemaHasType(field, 'array') || fieldSchemaHasType(field, 'object')) {
    const skin = skins.input
    return h('textarea', {
      'class': ['qua-settings-control', 'qua-settings-control--textarea'],
      'data-settings-control': control,
      'id': settingsFieldInputId(scope.scope, field.pathKey),
      'disabled': field.readonly,
      'value': stringifySettingsInputValue(field),
      ...createSkinAttrs('input', skin),
      'onChange': (event: Event) => updateField(renderer, actions, scope, field, parseEventValue(field, event)),
    })
  }
  if (control === 'select') {
    const skin = skins.tab
    return h('select', {
      'class': ['qua-settings-control', 'qua-settings-control--select'],
      'data-settings-control': control,
      'id': settingsFieldInputId(scope.scope, field.pathKey),
      'disabled': field.readonly,
      'value': encodeSettingsOptionValue(field.value),
      ...createSkinAttrs('tab', skin),
      'onChange': (event: Event) => updateField(renderer, actions, scope, field, parseEventValue(field, event)),
    }, settingsOptions(field).map(option => h('option', {
      key: encodeSettingsOptionValue(option.value),
      value: encodeSettingsOptionValue(option.value),
    }, option.label || String(option.value))))
  }
  if (control === 'radio') {
    const skin = skins.tab
    return h('div', {
      class: 'qua-settings-radio-group',
      ...createSkinAttrs('tab', skin),
    }, settingsOptions(field).map(option => h('label', {
      key: encodeSettingsOptionValue(option.value),
      class: 'qua-settings-radio-option',
    }, [
      h('input', {
        type: 'radio',
        name: settingsFieldInputId(scope.scope, field.pathKey),
        value: encodeSettingsOptionValue(option.value),
        checked: settingsValuesEqual(field.value, option.value),
        disabled: field.readonly,
        onChange: (event: Event) => {
          const target = event.target as HTMLInputElement
          if (target.checked) {
            updateField(renderer, actions, scope, field, parseEventValue(field, event))
          }
        },
      }),
      option.label || String(option.value),
    ])))
  }

  const inputType = control === 'switch' || control === 'checkbox'
    ? 'checkbox'
    : control === 'color'
      ? 'color'
      : control === 'number'
        ? 'number'
        : control === 'slider' || control === 'range'
          ? 'range'
          : 'text'
  const skinKind = inputType === 'checkbox' ? 'toggle' : 'input'
  const skin = inputType === 'checkbox' ? skins.toggle : skins.input

  return h('input', {
    'class': ['qua-settings-control', `qua-settings-control--${inputType}`],
    'data-settings-control': control,
    'id': settingsFieldInputId(scope.scope, field.pathKey),
    'type': inputType,
    'disabled': field.readonly,
    'checked': inputType === 'checkbox' ? Boolean(field.value) : undefined,
    'value': inputType === 'checkbox' ? undefined : stringifySettingsInputValue(field),
    'min': field.control.min,
    'max': field.control.max,
    'step': field.control.step,
    'placeholder': field.control.placeholder,
    ...createSkinAttrs(skinKind, skin),
    'onChange': (event: Event) => updateField(renderer, actions, scope, field, parseEventValue(field, event)),
  })
}

function renderCustomControl(
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  customControls: SettingsCustomControlRegistry | undefined,
  skin: UiControlSkinBinding,
) {
  const component = field.control.component ? customControls?.[field.control.component] : undefined
  const update = (value: unknown) => updateFieldValue(renderer, actions, scope, field, value)
  if (component) {
    return h(component, {
      ...(field.control.props || {}),
      'scope': scope,
      'field': field,
      'value': field.value,
      'readonly': field.readonly,
      'disabled': field.readonly,
      'update': update,
      'onUpdate:value': update,
    })
  }

  return h('div', {
    'class': ['qua-settings-custom-control', 'qua-settings-control', 'qua-settings-control--custom'],
    'id': settingsFieldInputId(scope.scope, field.pathKey),
    'role': 'group',
    'aria-disabled': field.readonly ? 'true' : 'false',
    'data-settings-component': field.control.component,
    'data-settings-props': field.control.props ? JSON.stringify(field.control.props) : undefined,
    ...createSkinAttrs('input', skin),
  })
}

function createSettingsLayerSlotPayload(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  settings: SettingsProjection,
  form: SettingsFormProjection,
  elementId: string,
): SettingsLayerSlotPayload {
  return {
    settings,
    form,
    actions,
    elementId,
    close: () => requestSettingsClose(renderer, actions, elementId),
    resetAll: () => requestSettingsResetAll(renderer, actions),
  }
}

function createSettingsFormSlotPayload(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  form: SettingsFormProjection,
  elementId: string,
): SettingsFormSlotPayload {
  return {
    form,
    actions,
    elementId,
    close: () => requestSettingsClose(renderer, actions, elementId),
    resetAll: () => requestSettingsResetAll(renderer, actions),
  }
}

function createSettingsScopeSlotPayload(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
): SettingsScopeSlotPayload {
  return {
    scope,
    actions,
    resetScope: () => requestSettingsResetScope(renderer, actions, scope.scope),
  }
}

function createSettingsGroupSlotPayload(
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  group: SettingsFieldGroupProjection,
): SettingsGroupSlotPayload {
  return {
    scope,
    group,
    actions,
  }
}

function createSettingsFieldSlotPayload(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
): SettingsFieldSlotPayload {
  return {
    scope,
    field,
    value: field.value,
    readonly: field.readonly,
    disabled: field.readonly,
    inputId: settingsFieldInputId(scope.scope, field.pathKey),
    control: field.control.control || 'text',
    description: field.control.description || field.schema.description,
    errors: field.errors,
    update: (value: unknown) => updateFieldValue(renderer, actions, scope, field, value),
  }
}

function createSettingsFieldAttrs(field: SettingsFieldFormProjection): Record<string, unknown> {
  const control = field.control.control || 'text'
  return {
    'class': ['qua-settings-field', `qua-settings-field--${control}`],
    'data-settings-field': field.pathKey,
    'data-settings-control': control,
    'data-settings-type': settingsSchemaType(field),
    'data-settings-required': field.required ? 'true' : undefined,
    'data-settings-readonly': field.readonly ? 'true' : undefined,
    'data-settings-invalid': field.errors.length ? 'true' : undefined,
  }
}

function renderSettingsFieldErrors(field: SettingsFieldFormProjection): VNode[] {
  return field.errors.map(error => h('p', {
    key: `${field.pathKey}:${error.keyword || error.message}`,
    class: 'qua-settings-field-error',
  }, error.message))
}

function requestSettingsClose(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  elementId: string,
): void {
  dispatchVueRendererIntent(renderer, () => actions.requestUiClose(elementId), {
    phase: 'settings:close',
    metadata: { elementId },
  })
}

function requestSettingsResetAll(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
): void {
  dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(SettingsRenderToLogicEvents.RESET_ALL_REQUEST), {
    phase: 'settings:reset-all',
  })
}

function requestSettingsResetScope(
  renderer: SettingsRendererIntentTarget,
  actions: RendererActions,
  scope: string,
): void {
  dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, { scope }), {
    phase: 'settings:reset-scope',
    metadata: { scope },
  })
}

function updateField(
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  parsed: SettingsInputParseResult,
): void {
  if (!parsed.ok) {
    return
  }
  dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, parsed.value),
  }), {
    phase: 'settings:update',
    metadata: {
      scope: scope.scope,
      path: field.path,
    },
  })
}

function updateFieldValue(
  renderer: Pick<ReturnType<typeof useQuaRenderer>, 'web'>,
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  value: unknown,
): void {
  dispatchVueRendererIntent(renderer, () => actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, value),
  }), {
    phase: 'settings:update',
    metadata: {
      scope: scope.scope,
      path: field.path,
    },
  })
}

function parseEventValue(field: SettingsFieldFormProjection, event: Event): SettingsInputParseResult {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  return parseSettingsControlValue(field, target.value, 'checked' in target ? target.checked : false)
}

function isSettingsGroupField(field: SettingsFieldFormProjection): boolean {
  return Boolean((field.control.control || 'text') === 'group' && field.children?.length)
}

function settingsOptions(field: SettingsFieldFormProjection) {
  if (field.control.options?.length) {
    return field.control.options
  }
  return (field.schema.enum || []).map(value => ({
    value,
    label: typeof value === 'string' ? titleFromField(value) : String(value),
  }))
}

function fieldSchemaHasType(field: SettingsFieldFormProjection, type: string): boolean {
  const schemaType = Array.isArray(field.schema.type)
    ? field.schema.type
    : field.schema.type
      ? [field.schema.type]
      : []
  return schemaType.includes(type as any)
    || (type === 'object' && Boolean(field.schema.properties))
    || (type === 'array' && Boolean(field.schema.items))
}

function settingsSchemaType(field: SettingsFieldFormProjection): string | undefined {
  const schemaType = field.schema.type
  if (Array.isArray(schemaType)) {
    return [...schemaType].join(' ')
  }
  if (typeof schemaType === 'string') {
    return schemaType
  }
  if (field.schema.properties) {
    return 'object'
  }
  if (field.schema.items) {
    return 'array'
  }
  return undefined
}

function settingsValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function settingsFieldInputId(scope: string, pathKey: string): string {
  return `qua-settings-${scope}-${pathKey}`.replace(/[^\w-]/g, '-')
}

function titleFromField(field: string): string {
  return field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function createSkinAttrs(
  kind: UiSkinControlKind,
  skin: UiControlSkinBinding,
): Record<string, unknown> {
  return {
    'style': skin.skinStyle.value,
    'data-skin-kind': kind,
    'data-skin-reference': skin.skinReference.value || undefined,
    'data-skin-state': skin.skinState.value,
    ...createSkinButtonHandlers(skin),
  }
}

function createSkinButtonHandlers(
  skin: Pick<ReturnType<typeof useUiControlSkin>, 'setInteractiveState'>,
): Record<string, (event: Event) => void> {
  return {
    onMouseenter: () => skin.setInteractiveState('hover'),
    onMouseleave: () => skin.setInteractiveState('default'),
    onMousedown: (event: Event) => {
      if ((event as MouseEvent).button === 0) {
        skin.setInteractiveState('pressed')
      }
    },
    onMouseup: () => skin.setInteractiveState('hover'),
    onFocus: () => skin.setInteractiveState('hover'),
    onBlur: () => skin.setInteractiveState('default'),
  }
}
