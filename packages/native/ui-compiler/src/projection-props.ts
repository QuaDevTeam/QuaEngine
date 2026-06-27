import type { NativeQuiProp } from './types'
import { literalStringValue } from './assets'

export function propString(props: readonly NativeQuiProp[], name: string): string | undefined {
  const value = props.find(prop => prop.name === name)?.value?.trim()
  if (!value)
    return undefined
  return stripQuotes(value)
}

export function propLiteralString(props: readonly NativeQuiProp[], name: string): string | undefined {
  return literalStringValue(props.find(prop => prop.name === name)?.value?.trim())
}

export function numberProp(props: readonly NativeQuiProp[], name: string): number | undefined {
  const value = propString(props, name)
  if (!value)
    return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export function booleanProp(props: readonly NativeQuiProp[], name: string): boolean | undefined {
  const value = propString(props, name)
  if (!value)
    return undefined
  if (value === 'true')
    return true
  if (value === 'false')
    return false
  return undefined
}

export function stripQuotes(value: string): string {
  const quote = value[0]
  return (quote === '"' || quote === '\'') && value[value.length - 1] === quote
    ? value.slice(1, -1)
    : value
}
