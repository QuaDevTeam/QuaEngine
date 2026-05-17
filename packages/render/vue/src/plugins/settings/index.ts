import type { SettingsProjection } from '@quajs/plugin-settings/contracts'
import type { RendererActions } from '@quajs/renderer-web'
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
import {
  createSettingsFormProjection,
  createSettingsValuePatch,
  encodeSettingsOptionValue,
  getSettingsProjectionFromView,
  isSettingsOverlayVisible,
  parseSettingsControlValue,
  stringifySettingsInputValue,
} from '@quajs/renderer-web/plugins/settings'
import { computed, defineComponent, h } from 'vue'
import { usePluginProjection, useRendererActions } from '../../composables'
import { useQuaRenderer } from '../../context'
import { defineVueRendererPlugin } from '../core'

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

const DEFAULT_SETTINGS_ELEMENT_ID = 'settings'
const DEFAULT_GROUP_ID = 'default'

export function useSettingsProjection() {
  return usePluginProjection<SettingsProjection>(SETTINGS_PLUGIN_ID)
}

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
  setup(props): () => VNode | null {
    const actions = useRendererActions()
    return () => {
      const field = props.field
      if (field.control.hidden) {
        return null
      }

      const control = field.control.control || 'text'
      return h('div', {
        'class': ['qua-settings-field', `qua-settings-field--${control}`],
        'data-settings-field': field.pathKey,
      }, isSettingsGroupField(field)
        ? [renderNestedGroup(props.scope, field, props.customControls)]
        : [
            h('label', {
              class: 'qua-settings-field-label',
              for: settingsFieldInputId(props.scope.scope, field.pathKey),
            }, field.control.label || field.name),
            field.control.description || field.schema.description
              ? h('p', { class: 'qua-settings-field-description' }, field.control.description || field.schema.description)
              : null,
            renderControl(actions, props.scope, field, props.customControls),
            field.errors.map(error => h('p', {
              key: `${field.pathKey}:${error.keyword || error.message}`,
              class: 'qua-settings-field-error',
            }, error.message)),
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
  setup(props) {
    return () => h('fieldset', {
      'class': 'qua-settings-group',
      'data-settings-group': props.group.id,
    }, [
      props.group.label || props.group.id !== DEFAULT_GROUP_ID
        ? h('legend', { class: 'qua-settings-group-title' }, props.group.label || props.group.id)
        : null,
      props.group.description
        ? h('p', { class: 'qua-settings-group-description' }, props.group.description)
        : null,
      props.group.fields.map(field => h(QuaSettingsField, {
        key: field.pathKey,
        field,
        scope: props.scope,
        customControls: props.customControls,
      })),
    ])
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
  setup(props) {
    const actions = useRendererActions()
    return () => h('section', {
      'class': 'qua-settings-scope',
      'data-settings-scope': props.scope.scope,
    }, [
      h('header', { class: 'qua-settings-scope-header' }, [
        h('h3', { class: 'qua-settings-scope-title' }, props.scope.title || props.scope.scope),
        h('button', {
          class: 'qua-settings-scope-reset',
          type: 'button',
          onClick: () => actions.requestPluginEvent(SettingsRenderToLogicEvents.RESET_SCOPE_REQUEST, { scope: props.scope.scope }),
        }, 'Reset'),
      ]),
      props.scope.description
        ? h('p', { class: 'qua-settings-scope-description' }, props.scope.description)
        : null,
      props.scope.groups.map(group => h(QuaSettingsGroup, {
        key: group.id,
        group,
        scope: props.scope,
        customControls: props.customControls,
      })),
    ])
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
  setup(props) {
    const actions = useRendererActions()
    return () => h('section', {
      'class': 'qua-settings-panel',
      'data-settings-overlay': props.elementId,
    }, [
      h('header', { class: 'qua-settings-header' }, [
        h('h2', { class: 'qua-settings-title' }, 'Settings'),
        h('button', {
          class: 'qua-settings-close',
          type: 'button',
          onClick: () => actions.requestUiClose(props.elementId),
        }, 'Close'),
      ]),
      h('form', {
        class: 'qua-settings-form',
        onSubmit: (event: Event) => event.preventDefault(),
      }, props.form.scopes.map(scope => h(QuaSettingsScope, {
        key: scope.scope,
        scope,
        customControls: props.customControls,
      }))),
      h('button', {
        class: 'qua-settings-reset-all',
        type: 'button',
        onClick: () => actions.requestPluginEvent(SettingsRenderToLogicEvents.RESET_ALL_REQUEST),
      }, 'Reset All'),
    ])
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
    const { view } = useQuaRenderer()
    const actions = useRendererActions()
    const settings = computed(() => getSettingsProjectionFromView(view.value))
    const form = computed(() => settings.value ? createSettingsFormProjection(settings.value) : undefined)
    const visible = computed(() => Boolean(form.value && isSettingsOverlayVisible(view.value, props.elementId)))

    return () => visible.value && settings.value && form.value
      ? h('div', {
          class: 'qua-settings-layer',
          onClick: (event: Event) => event.stopPropagation(),
        }, slots.default?.({
          settings: settings.value,
          form: form.value,
          actions,
        }) || h(QuaSettingsForm, {
          form: form.value,
          elementId: props.elementId,
          customControls: props.customControls,
        }))
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
      plane: 'safe',
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
): VNode {
  return h('fieldset', { class: 'qua-settings-nested-group' }, [
    h('legend', { class: 'qua-settings-field-label' }, field.control.label || field.name),
    field.children?.map(child => h(QuaSettingsField, {
      key: child.pathKey,
      scope,
      field: child,
      customControls,
    })),
  ])
}

function renderControl(
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  customControls: SettingsCustomControlRegistry | undefined,
) {
  const control = field.control.control || 'text'
  if (control === 'custom') {
    return renderCustomControl(actions, scope, field, customControls)
  }

  if (control === 'textarea' || fieldSchemaHasType(field, 'array') || fieldSchemaHasType(field, 'object')) {
    return h('textarea', {
      class: 'qua-settings-field-control',
      id: settingsFieldInputId(scope.scope, field.pathKey),
      disabled: field.readonly,
      value: stringifySettingsInputValue(field),
      onChange: (event: Event) => updateField(actions, scope, field, parseEventValue(field, event)),
    })
  }
  if (control === 'select') {
    return h('select', {
      class: 'qua-settings-field-control',
      id: settingsFieldInputId(scope.scope, field.pathKey),
      disabled: field.readonly,
      value: encodeSettingsOptionValue(field.value),
      onChange: (event: Event) => updateField(actions, scope, field, parseEventValue(field, event)),
    }, settingsOptions(field).map(option => h('option', {
      key: encodeSettingsOptionValue(option.value),
      value: encodeSettingsOptionValue(option.value),
    }, option.label || String(option.value))))
  }
  if (control === 'radio') {
    return h('div', { class: 'qua-settings-radio-group' }, settingsOptions(field).map(option => h('label', {
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
            updateField(actions, scope, field, parseEventValue(field, event))
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

  return h('input', {
    class: 'qua-settings-field-control',
    id: settingsFieldInputId(scope.scope, field.pathKey),
    type: inputType,
    disabled: field.readonly,
    checked: inputType === 'checkbox' ? Boolean(field.value) : undefined,
    value: inputType === 'checkbox' ? undefined : stringifySettingsInputValue(field),
    min: field.control.min,
    max: field.control.max,
    step: field.control.step,
    placeholder: field.control.placeholder,
    onChange: (event: Event) => updateField(actions, scope, field, parseEventValue(field, event)),
  })
}

function renderCustomControl(
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  customControls: SettingsCustomControlRegistry | undefined,
) {
  const component = field.control.component ? customControls?.[field.control.component] : undefined
  const update = (value: unknown) => updateFieldValue(actions, scope, field, value)
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
    'class': 'qua-settings-custom-control qua-settings-field-control',
    'id': settingsFieldInputId(scope.scope, field.pathKey),
    'role': 'group',
    'aria-disabled': field.readonly ? 'true' : 'false',
    'data-settings-component': field.control.component,
    'data-settings-props': field.control.props ? JSON.stringify(field.control.props) : undefined,
  })
}

function updateField(
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  parsed: SettingsInputParseResult,
): void {
  if (!parsed.ok) {
    return
  }
  void actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, parsed.value),
  })
}

function updateFieldValue(
  actions: RendererActions,
  scope: SettingsScopeFormProjection,
  field: SettingsFieldFormProjection,
  value: unknown,
): void {
  void actions.requestPluginEvent(SettingsRenderToLogicEvents.UPDATE_REQUEST, {
    scope: scope.scope,
    patch: createSettingsValuePatch(scope.source, field.path, value),
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
