import type { SettingsValues } from '../contracts'

export function cloneSettingsValue<T>(value: T): T {
  if (value === undefined) {
    return value
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function isPlainSettingsObject(value: unknown): value is SettingsValues {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function mergeSettingsValues(...values: readonly (SettingsValues | undefined)[]): SettingsValues {
  const merged: SettingsValues = {}
  for (const value of values) {
    if (!value) {
      continue
    }
    for (const [key, nextValue] of Object.entries(value)) {
      const currentValue = merged[key]
      if (isPlainSettingsObject(currentValue) && isPlainSettingsObject(nextValue)) {
        merged[key] = mergeSettingsValues(currentValue, nextValue)
      }
      else if (nextValue !== undefined) {
        merged[key] = cloneSettingsValue(nextValue)
      }
    }
  }
  return merged
}

export function pickSettingsValues(values: SettingsValues | undefined, fields: ReadonlySet<string>): SettingsValues {
  const picked: SettingsValues = {}
  if (!values) {
    return picked
  }
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(values, field)) {
      picked[field] = cloneSettingsValue(values[field])
    }
  }
  return picked
}

export function settingsValuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

export function changedSettingsKeys(previous: SettingsValues, next: SettingsValues): string[] {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  return [...keys].filter(key => !settingsValuesEqual(previous[key], next[key]))
}
