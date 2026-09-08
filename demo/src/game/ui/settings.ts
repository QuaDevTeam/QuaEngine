import type { SettingsGroupSlotPayload, SettingsFieldSlotPayload, SettingsFormSlotPayload, SettingsScopeSlotPayload } from '@quajs/renderer-vue/plugins/settings'
import { h } from 'vue'

export function renderDemoSettingsHeader(payload: SettingsFormSlotPayload) {
  return h('header', { class: 'vn-settings-header' }, [
    h('div', { class: 'vn-settings-heading' }, [
      h('h2', { class: 'vn-settings-title' }, '设置'),
    ]),
    h('div', { class: 'vn-settings-header-actions' }, [
      h('button', {
        class: 'vn-settings-reset-all',
        type: 'button',
        onClick: payload.resetAll,
      }, '恢复默认'),
      h('button', {
        class: 'vn-settings-close',
        type: 'button',
        onClick: payload.close,
      }, '关闭'),
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
  const min = payload.field.control.min ?? 0
  const max = payload.field.control.max ?? 100
  const progress = Math.max(0, Math.min(100, (value - min) / (max - min || 1) * 100))
  return h('div', { class: 'vn-settings-control vn-settings-range' }, [
    h('input', {
      id: payload.inputId,
      class: 'vn-settings-range__input',
      type: 'range',
      style: { '--range-progress': `${progress}%` },
      'aria-valuetext': formatDemoSettingsValue(payload, value),
      min: payload.field.control.min,
      max: payload.field.control.max,
      step: payload.field.control.step,
      value,
      disabled: payload.disabled,
      onInput: (event: Event) => {
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
  const options = demoSettingsOptions(payload).map(option => ({ ...option, label: payload.field.pathKey === 'skipMode' ? (option.value === 'all' ? '全部文字' : '仅已读文字') : payload.field.pathKey === 'frameRateLimit' ? `${option.value} 帧` : option.label }))
  return h('span', { class: 'vn-settings-control vn-settings-select' }, [
    h('select', {
      id: payload.inputId,
      class: 'vn-settings-select__input',
      'data-setting': payload.field.pathKey,
      value: encodeDemoSettingsValue(payload.value),
      disabled: payload.disabled,
      onChange: (event: Event) => {
        payload.update(decodeDemoSettingsValue((event.target as HTMLSelectElement).value))
      },
    }, options.map(option => h('option', {
      key: encodeDemoSettingsValue(option.value),
      value: encodeDemoSettingsValue(option.value),
    }, option.label || String(option.value)))),
    h('span', { class: 'vn-settings-select__indicator', 'aria-hidden': 'true' }, [
      h('svg', { viewBox: '0 0 24 24', fill: 'none', focusable: 'false' }, [
        h('path', { d: 'M6 9l6 6 6-6', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      ]),
    ]),
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
    h('span', { class: 'vn-settings-switch__label' }, checked ? '开' : '关'),
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
    return `${(value / 1000).toFixed(1)} 秒`
  }
  if (payload.field.pathKey === 'textSpeedCps') {
    return `每秒 ${Math.round(value)} 字`
  }
  return String(value)
}

function titleFromToken(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

const settingLabels: Record<string, string> = {
  locale: '语言', textSpeedCps: '文字显示速度', autoAdvanceDelayMs: '自动阅读间隔',
  skipMode: '快进范围', confirmBeforeQuit: '退出前确认', frameRateLimit: '画面帧率',
  masterVolume: '总音量', bgmVolume: '音乐音量', sfxVolume: '音效音量', voiceVolume: '语音音量',
}
export function renderDemoSettingsLabel(payload: SettingsFieldSlotPayload) {
  return h('label', { class: 'qua-settings-field-label', for: payload.inputId }, settingLabels[payload.field.pathKey] || payload.field.schema.title || payload.field.pathKey)
}
export function renderDemoSettingsDescription(payload: SettingsFieldSlotPayload) {
  const descriptions: Record<string, string> = {
    textSpeedCps: '点击可显示整句，再次点击继续。',
    autoAdvanceDelayMs: '显示整句后，到下一句的等待时间。',
    skipMode: '遇到选项时停止。',
  }
  return descriptions[payload.field.pathKey] ? h('p', { class: 'qua-settings-field-description' }, descriptions[payload.field.pathKey]) : null
}

export function renderDemoSettingsGroupHeader(payload: SettingsGroupSlotPayload) {
  const names: Record<string, string> = { flowControl: '阅读', interaction: '操作', display: '显示', audio: '声音', volumes: '音量' }
  return h('legend', { class: 'qua-settings-group-title' }, names[payload.group.id] || payload.group.label || '偏好设置')
}
