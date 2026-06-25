import type { NativeQuiProp } from './types'
import { findMatchingDelimiter, rangeFromOffsets, splitTopLevel } from './source'

const PROP_NAME_PATTERN = /^\s*([a-z_][\w-]*)(?:\s*:([\s\S]*))?$/i

export function collectQuiProps(
  source: string,
  masked: string,
  lineStarts: readonly number[],
  options: {
    groupIdOffset?: number
    rangeEnd?: number
    rangeStart?: number
  } = {},
): NativeQuiProp[] {
  const props: NativeQuiProp[] = []
  const rangeStart = options.rangeStart ?? 0
  const rangeEnd = options.rangeEnd ?? masked.length
  let groupId = options.groupIdOffset ?? 0

  for (let offset = rangeStart; offset < rangeEnd; offset += 1) {
    if (masked[offset] !== '(')
      continue
    const close = findMatchingDelimiter(masked, offset, '(', ')')
    if (close === -1 || close > rangeEnd)
      continue
    const currentGroupId = groupId
    groupId += 1
    props.push(...collectPropsFromGroup(source, lineStarts, offset + 1, close, currentGroupId))
    offset = close
  }

  return props
}

export function collectQuiPropsFromGroup(
  source: string,
  lineStarts: readonly number[],
  propsStart: number,
  propsEnd: number,
  groupId = 0,
): NativeQuiProp[] {
  return collectPropsFromGroup(source, lineStarts, propsStart, propsEnd, groupId)
}

function collectPropsFromGroup(
  source: string,
  lineStarts: readonly number[],
  propsStart: number,
  propsEnd: number,
  groupId: number,
): NativeQuiProp[] {
  const body = source.slice(propsStart, propsEnd)
  const props: NativeQuiProp[] = []

  for (const part of splitTopLevel(body, ',')) {
    const raw = part.text
    if (!raw.trim())
      continue
    const match = PROP_NAME_PATTERN.exec(raw)
    if (!match)
      continue

    const nameStart = propsStart + part.start + raw.indexOf(match[1])
    const value = match[2]?.trim()
    const valueStartInRaw = match[2] ? raw.indexOf(match[2]) : -1

    props.push({
      groupId,
      name: match[1],
      value,
      nameRange: rangeFromOffsets(lineStarts, nameStart, nameStart + match[1].length),
      valueRange: value && valueStartInRaw >= 0
        ? rangeFromOffsets(lineStarts, propsStart + part.start + valueStartInRaw, propsStart + part.start + valueStartInRaw + match[2].length)
        : undefined,
      range: rangeFromOffsets(lineStarts, propsStart + part.start, propsStart + part.end),
    })
  }

  return props
}
