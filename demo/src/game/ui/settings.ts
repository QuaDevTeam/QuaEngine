import type { SettingsFieldSlotPayload, SettingsFormSlotPayload, SettingsScopeSlotPayload } from '@quajs/renderer-vue/plugins/settings'
import { h } from 'vue'

export function renderDemoSettingsHeader(payload: SettingsFormSlotPayload) {
  return h('header', { class: 'vn-settings-header' }, [
    h('div', { class: 'vn-settings-heading' }, [
      h('h2', { class: 'vn-settings-title' }, 'Config'),
    ]),
    h('div', { class: 'vn-settings-header-actions' }, [
      h('button', {
        class: 'vn-settings-reset-all',
        type: 'button',
        onClick: payload.resetAll,
      }, 'RESET'),
      h('button', {
        class: 'vn-settings-close',
        type: 'button',
        onClick: payload.close,
      }, 'CLOSE'),
    ]),
  ])
}

export function renderDemoSettingsActions(_payload: SettingsFormSlotPayload) {
  return null
}

export function renderDemoSettingsScopeHeader(_payload: SettingsScopeSlotPayload) {
  return null
}

export function renderDemoSettingsControl(payload: SettingsFieldSlotPayload) {
  const control = payload.control
  if (control === 'slider' || control === 'range') {
    return renderDemoSettingsRange(payload)
  }
  if (control === 'select' || payload.field.schema.enum?.length) {
    return renderDemoSettingsSelect(payload)
  }
  if (control === 'switch' || control === 'checkbox') {
    return renderDemoSettingsSwitch(payload)
  }
  return renderDemoSettingsInput(payload)
}

function renderDemoSettingsRange(payload: SettingsFieldSlotPayload) {
  const value = typeof payload.value === 'number' ? payload.value : Number(payload.value || 0)
  return h('div', { class: 'vn-settings-control vn-settings-range' }, [
    h('input', {
      id: payload.inputId,
      class: 'vn-settings-range__input',
      type: 'range',
      min: payload.field.control.min,
      max: payload.field.control.max,
      step: payload.field.control.step,
      value,
      disabled: payload.disabled,
      onChange: (event: Event) => {
        const next = Number((event.target as HTMLInputElement).value)
        if (Number.isFinite(next)) {
          payload.update(next)
        }
      },
    }),
    h('output', {
      class: 'vn-settings-range__value',
      for: payload.inputId,
    }, formatDemoSettingsValue(payload, value)),
  ])
}

function renderDemoSettingsSelect(payload: SettingsFieldSlotPayload) {
  const options = demoSettingsOptions(payload)
  return h('span', { class: 'vn-settings-control vn-settings-select' }, [
    h('select', {
      id: payload.inputId,
      class: 'vn-settings-select__input',
      value: encodeDemoSettingsValue(payload.value),
      disabled: payload.disabled,
      onChange: (event: Event) => {
        payload.update(decodeDemoSettingsValue((event.target as HTMLSelectElement).value))
      },
    }, options.map(option => h('option', {
      key: encodeDemoSettingsValue(option.value),
      value: encodeDemoSettingsValue(option.value),
    }, option.label || String(option.value)))),
  ])
}

function renderDemoSettingsSwitch(payload: SettingsFieldSlotPayload) {
  const checked = Boolean(payload.value)
  return h('button', {
    id: payload.inputId,
    class: ['vn-settings-control', 'vn-settings-switch', checked ? 'is-on' : undefined],
    type: 'button',
    role: 'switch',
    'aria-checked': checked ? 'true' : 'false',
    disabled: payload.disabled,
    onClick: () => payload.update(!checked),
  }, [
    h('span', { class: 'vn-settings-switch__track' }, [
      h('span', { class: 'vn-settings-switch__thumb' }),
    ]),
    h('span', { class: 'vn-settings-switch__label' }, checked ? 'ON' : 'OFF'),
  ])
}

function renderDemoSettingsInput(payload: SettingsFieldSlotPayload) {
  return h('input', {
    id: payload.inputId,
    class: 'vn-settings-control vn-settings-input',
    type: payload.field.schema.format === 'color' ? 'color' : 'text',
    value: payload.value == null ? '' : String(payload.value),
    placeholder: payload.field.control.placeholder,
    disabled: payload.disabled,
    onChange: (event: Event) => payload.update((event.target as HTMLInputElement).value),
  })
}

function demoSettingsOptions(payload: SettingsFieldSlotPayload): Array<{ label?: string, value: unknown }> {
  if (payload.field.control.options?.length) {
    return payload.field.control.options.map(option => ({
      label: option.label,
      value: option.value,
    }))
  }
  return (payload.field.schema.enum || []).map(value => ({
    label: typeof value === 'string' ? titleFromToken(value) : String(value),
    value,
  }))
}

function encodeDemoSettingsValue(value: unknown): string {
  return JSON.stringify(value)
}

function decodeDemoSettingsValue(value: string): unknown {
  try {
    return JSON.parse(value)
  }
  catch {
    return value
  }
}

function formatDemoSettingsValue(payload: SettingsFieldSlotPayload, value: number): string {
  if (payload.field.pathKey === 'autoAdvanceDelayMs') {
    return `${Math.round(value)} ms`
  }
  if (payload.field.pathKey === 'textSpeedCps') {
    return `${Math.round(value)} cps`
  }
  return String(value)
}

function titleFromToken(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}
