import type {
  NativeQuiActionArgument,
  NativeQuiActionDescriptor,
  NativeQuiActionEvent,
  NativeQuiActionNamespace,
  NativeQuiProp,
} from './types'
import { maskSourceLiterals, splitTopLevel } from './source'

const ACTION_DESCRIPTOR_PATTERN = /^\s*(ui|choice|save|settings)\.([a-z_$][\w$]*)\s*\(([\s\S]*)\)\s*$/i
const REFERENCE_PATTERN = /^[a-z_$][\w$]*(?:(?:\.|\?\.)[a-z_$][\w$]*|\[[^\]]+\])*$/i
const NUMBER_PATTERN = /^-?(?:\d+|\d*\.\d+)$/
const STRING_PATTERN = /^(['"])([\s\S]*)\1$/

export function collectQuiActionDescriptors(
  props: readonly NativeQuiProp[],
): NativeQuiActionDescriptor[] {
  return props
    .filter(prop => prop.name === 'action' && prop.value)
    .map(prop => parseQuiActionDescriptor(prop.value!, prop))
    .filter((descriptor): descriptor is NativeQuiActionDescriptor => Boolean(descriptor))
}

export function parseQuiActionDescriptor(
  source: string,
  prop?: NativeQuiProp,
): NativeQuiActionDescriptor | undefined {
  const match = ACTION_DESCRIPTOR_PATTERN.exec(source)
  if (!match)
    return undefined

  const namespace = match[1].toLowerCase() as NativeQuiActionNamespace
  const name = match[2]
  const argumentSource = match[3]
  const args = parseActionArguments(argumentSource)
  if (!args)
    return undefined

  return {
    namespace,
    name,
    source: source.trim(),
    event: actionEvent(namespace, name),
    action: actionName(namespace, name),
    arguments: args,
    range: prop?.range,
    valueRange: prop?.valueRange,
  }
}

export function hasUnsupportedQuiActionArgument(descriptor: NativeQuiActionDescriptor): boolean {
  return descriptor.arguments.some(argument =>
    argument.kind === 'expression'
    && /\b[a-z_$][\w$]*(?:\.[a-z_$][\w$]*)?\s*\(/i.test(argument.source),
  )
}

function parseActionArguments(source: string): NativeQuiActionArgument[] | undefined {
  if (!source.trim())
    return []

  const masked = maskSourceLiterals(source)
  const args: NativeQuiActionArgument[] = []
  for (const part of splitTopLevel(masked, ',')) {
    const raw = source.slice(part.start, part.end)
    const trimmed = raw.trim()
    if (!trimmed)
      return undefined
    args.push(parseActionArgument(trimmed))
  }
  return args
}

function parseActionArgument(source: string): NativeQuiActionArgument {
  if (source === 'true' || source === 'false') {
    return { kind: 'literal', source, value: source === 'true' }
  }
  if (source === 'null') {
    return { kind: 'literal', source, value: null }
  }
  if (NUMBER_PATTERN.test(source)) {
    return { kind: 'literal', source, value: Number(source) }
  }

  const stringMatch = STRING_PATTERN.exec(source)
  if (stringMatch) {
    return { kind: 'literal', source, value: stringMatch[2] }
  }

  if (REFERENCE_PATTERN.test(source)) {
    return { kind: 'reference', source }
  }

  return { kind: 'expression', source }
}

function actionEvent(namespace: NativeQuiActionNamespace, name: string): NativeQuiActionEvent {
  return namespace === 'choice' && name === 'select' ? 'choice/select' : 'ui/intent'
}

function actionName(namespace: NativeQuiActionNamespace, name: string): string {
  return namespace === 'ui' || namespace === 'choice' ? name : `${namespace}.${name}`
}
