import type { ParsedQuaScript, QuaScriptChoice, QuaScriptDecoratorValue, QuaScriptDialogue, StoryDeclaration } from './types'
import generateModule from '@babel/generator'
import * as t from '@babel/types'
import { parseQuaScriptDocument } from './document'
import { QuaScriptParser } from './parser'

const generateCode = resolveCallableDefault(generateModule)

function resolveCallableDefault<T extends (...args: any[]) => unknown>(module: T | { default?: T }): T {
  const maybeDefault = (module as { default?: T }).default
  return typeof maybeDefault === 'function'
    ? maybeDefault
    : module as T
}

export function extractQuaScriptStoryDeclaration(
  source: string,
  options: { moduleId?: string, runtimePackageId?: string } = {},
): StoryDeclaration {
  const document = parseQuaScriptDocument(source)
  const errors = document.diagnostics.filter(diagnostic => diagnostic.severity === 'error')
  if (errors.length > 0) {
    throw new Error(errors.map(error => error.message).join('\n'))
  }
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  const parseErrors = parsed.diagnostics.filter(diagnostic => diagnostic.severity === 'error')
  if (parseErrors.length > 0) {
    throw new Error(parseErrors.map(error => error.message).join('\n'))
  }
  return createStoryDeclaration(parsed, options)
}

function createStoryDeclaration(
  parsed: ParsedQuaScript,
  options: { moduleId?: string, runtimePackageId?: string },
): StoryDeclaration {
  const scenes: StoryDeclaration['scenes'] = []
  const entries: NonNullable<StoryDeclaration['entries']> = []
  const nodes: StoryDeclaration['nodes'] = []
  const labels: StoryDeclaration['labels'] = []
  const choices: StoryDeclaration['choices'] = []
  const edges: StoryDeclaration['edges'] = []
  let currentSceneId: string | undefined
  let currentEntryId: string | undefined
  let currentNodeId: string | undefined
  let currentLabelId: string | undefined

  parsed.steps.forEach((step) => {
    const decorators = step.type === 'dialogue'
      ? (step.content as QuaScriptDialogue).decorators
      : step.type === 'action'
        ? (step.content as { decorators?: QuaScriptDialogue['decorators'] }).decorators || []
        : []
    for (const decorator of decorators) {
      const value = stringifyDecoratorValue(decorator.args[0])
      if (!value) {
        continue
      }
      if (decorator.name === 'Scene') {
        currentSceneId = value
        currentEntryId = undefined
        currentNodeId = undefined
        currentLabelId = undefined
        scenes.push({ id: value, metadata: toRecord(decorator.args[1], options) })
      }
      if (decorator.name === 'Entry') {
        currentEntryId = value
        currentNodeId = undefined
        currentLabelId = undefined
        entries.push({
          id: value,
          point: createPoint(step.uuid, options, { sceneId: currentSceneId, entryId: value, nodeId: currentNodeId || value, labelId: currentLabelId }),
          metadata: toRecord(decorator.args[1], options),
        })
      }
      if (decorator.name === 'Node') {
        currentNodeId = value
        currentLabelId = undefined
        const metadata = toRecord(decorator.args[1], options)
        nodes.push({
          id: value,
          point: createPoint(step.uuid, options, { sceneId: currentSceneId, entryId: currentEntryId, nodeId: value, labelId: currentLabelId }),
          title: typeof metadata?.title === 'string' ? metadata.title : undefined,
          summary: typeof metadata?.summary === 'string' ? metadata.summary : undefined,
          presentation: toPresentation(decorator.args[1], options),
          metadata,
        })
      }
      if (decorator.name === 'Label') {
        currentLabelId = value
        labels.push({
          id: value,
          point: createPoint(step.uuid, options, { sceneId: currentSceneId, entryId: currentEntryId, nodeId: currentNodeId || value, labelId: value }),
          metadata: toRecord(decorator.args[1], options),
        })
      }
    }

    if (step.type !== 'choice') {
      return
    }

    const choice = step.content as QuaScriptChoice
    const from = currentNodeId || currentLabelId || step.uuid
    choice.options.forEach((option, optionIndex) => {
      const target = normalizeTargetForDeclaration(option.target)
      const id = option.id || `${step.uuid}:choice:${optionIndex + 1}`
      choices.push({
        id,
        text: option.text,
        target,
        condition: option.condition,
        source: option.source,
        point: createPoint(step.uuid, options, { sceneId: currentSceneId, entryId: currentEntryId, nodeId: currentNodeId, labelId: currentLabelId }),
      })
      const to = declarationTargetId(target) || id
      edges.push({
        id: `choice:${from}:${to}:${optionIndex + 1}`,
        from,
        to,
        kind: 'choice',
        condition: option.condition,
        metadata: { choiceId: id },
      })
    })
  })

  return {
    moduleId: options.moduleId,
    runtimePackageId: options.runtimePackageId,
    scenes,
    entries,
    nodes,
    labels,
    choices,
    edges,
  }
}

function createPoint(
  stepId: string,
  options: { moduleId?: string, runtimePackageId?: string },
  patch: { sceneId?: string, entryId?: string, nodeId?: string, labelId?: string },
): Record<string, unknown> {
  return {
    ...patch,
    stepId,
    scriptModuleId: options.moduleId,
    contentPackageId: options.runtimePackageId,
  }
}

function normalizeTargetForDeclaration(value: QuaScriptDecoratorValue | undefined): Record<string, unknown> | undefined {
  if (typeof value === 'string') {
    if (value.startsWith('#')) {
      return { kind: 'label', id: value.slice(1) }
    }
    const sceneMatch = /^scene:([^#\s]+)(?:#([^\s]+))?$/.exec(value)
    if (sceneMatch) {
      return { kind: 'scene', sceneId: sceneMatch[1], ...(sceneMatch[2] ? { entry: sceneMatch[2] } : {}) }
    }
    const packageMatch = /^package:([^#\s]+)#([^\s]+)$/.exec(value)
    if (packageMatch) {
      return { kind: 'package-node', packageId: packageMatch[1], nodeId: packageMatch[2] }
    }
    return { kind: 'node', id: value }
  }
  if (isHelperCall(value)) {
    return normalizeTargetHelperCall(value)
  }
  const record = toRecord(value)
  return record || undefined
}

function normalizeTargetHelperCall(value: QuaScriptDecoratorValue): Record<string, unknown> | undefined {
  if (!isHelperCall(value) || !t.isIdentifier(value.callee)) {
    return undefined
  }
  const first = stringArgument(value.arguments[0])
  const second = stringArgument(value.arguments[1])
  const options = objectArgument(value.arguments[value.callee.name === 'packageNode' ? 2 : 1])

  switch (value.callee.name) {
    case 'node':
      return first ? { kind: 'node', id: first, ...options } : undefined
    case 'label':
      return first ? { kind: 'label', id: first, ...options } : undefined
    case 'scene':
      return first ? { kind: 'scene', sceneId: first, ...options } : undefined
    case 'script':
      return first ? { kind: 'script', moduleId: first, ...options } : undefined
    case 'checkpoint':
      return first ? { kind: 'checkpoint', id: first } : undefined
    case 'packageNode':
      return first && second ? { kind: 'package-node', packageId: first, nodeId: second, ...options } : undefined
    default:
      return undefined
  }
}

function declarationTargetId(target: Record<string, unknown> | undefined): string | undefined {
  if (!target) {
    return undefined
  }
  for (const key of ['id', 'nodeId', 'labelId', 'entry', 'stepId', 'moduleId']) {
    if (typeof target[key] === 'string') {
      return target[key] as string
    }
  }
  return undefined
}

function toPresentation(value: QuaScriptDecoratorValue | undefined, options: { runtimePackageId?: string } = {}): Record<string, unknown> | undefined {
  const record = toRecord(value, options)
  if (!record) {
    return undefined
  }
  const presentationKeys = ['thumbnail', 'background', 'image', 'assets', 'title', 'summary']
  const presentation = Object.fromEntries(Object.entries(record).filter(([key]) => presentationKeys.includes(key)))
  return Object.keys(presentation).length > 0 ? presentation : undefined
}

function toRecord(value: QuaScriptDecoratorValue | undefined, options: { runtimePackageId?: string } = {}): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  if (isImageHelperCall(value)) {
    return normalizeImageHelperCall(value, options)
  }
  if ('type' in value) {
    return { expression: generateCode(value as any).code }
  }
  return Object.fromEntries(Object.entries(value as Record<string, QuaScriptDecoratorValue>).map(([key, item]) => [key, normalizeDeclarationValue(item, options)]))
}

function normalizeDeclarationValue(value: QuaScriptDecoratorValue, options: { runtimePackageId?: string } = {}): unknown {
  if (isImageHelperCall(value)) {
    return normalizeImageHelperCall(value, options)
  }
  if (isHelperCall(value)) {
    return normalizeTargetHelperCall(value) || { expression: generateCode(value as any).code }
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeDeclarationValue(item, options))
  }
  if (value && typeof value === 'object') {
    if ('type' in value) {
      return { expression: generateCode(value as any).code }
    }
    return Object.fromEntries(Object.entries(value as Record<string, QuaScriptDecoratorValue>).map(([key, item]) => [key, normalizeDeclarationValue(item, options)]))
  }
  return value
}

function normalizeImageHelperCall(value: t.CallExpression, options: { runtimePackageId?: string } = {}): Record<string, unknown> | undefined {
  const name = stringArgument(value.arguments[0])
  if (!name) {
    return undefined
  }
  const imageOptions = objectArgument(value.arguments[1], options)
  return {
    type: 'images',
    name,
    ...(options.runtimePackageId ? { runtimePackageId: options.runtimePackageId } : {}),
    ...imageOptions,
  }
}

function isHelperCall(value: unknown): value is t.CallExpression {
  const calleeName = getCallCalleeName(value)
  return Boolean(calleeName && ['node', 'label', 'scene', 'script', 'checkpoint', 'packageNode'].includes(calleeName))
}

function isImageHelperCall(value: unknown): value is t.CallExpression {
  return getCallCalleeName(value) === 'image'
}

function stringArgument(value: t.CallExpression['arguments'][number] | undefined): string | undefined {
  return isStringLiteralNode(value) ? value.value : undefined
}

function objectArgument(value: t.CallExpression['arguments'][number] | undefined, options: { runtimePackageId?: string } = {}): Record<string, unknown> | undefined {
  if (!isObjectExpressionNode(value)) {
    return undefined
  }
  return Object.fromEntries((value.properties as unknown[])
    .filter(isObjectPropertyNode)
    .map((property) => {
      const key = isIdentifierNode(property.key)
        ? property.key.name
        : String((property.key as StringLiteralLike | NumericLiteralLike).value)
      return [key, normalizeDeclarationValue(property.value as QuaScriptDecoratorValue, options)]
    }))
}

type IdentifierLike = { name: string, type: 'Identifier' }
type StringLiteralLike = { type: 'StringLiteral', value: string }
type NumericLiteralLike = { type: 'NumericLiteral', value: number }
type ObjectPropertyLike = { key: IdentifierLike | StringLiteralLike | NumericLiteralLike, type: 'ObjectProperty', value: unknown }
type ObjectExpressionLike = { properties: unknown[], type: 'ObjectExpression' }

function getCallCalleeName(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }
  const call = value as { callee?: unknown, type?: unknown }
  if (call.type !== 'CallExpression' || !isIdentifierNode(call.callee)) {
    return undefined
  }
  return call.callee.name
}

function isIdentifierNode(value: unknown): value is IdentifierLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'Identifier'
    && typeof (value as { name?: unknown }).name === 'string'
}

function isStringLiteralNode(value: unknown): value is StringLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'StringLiteral'
    && typeof (value as { value?: unknown }).value === 'string'
}

function isObjectExpressionNode(value: unknown): value is ObjectExpressionLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'ObjectExpression'
    && Array.isArray((value as { properties?: unknown }).properties)
}

function isObjectPropertyNode(value: unknown): value is ObjectPropertyLike {
  if (!value || typeof value !== 'object') {
    return false
  }
  const property = value as { computed?: unknown, key?: unknown, type?: unknown, value?: unknown }
  return property.type === 'ObjectProperty'
    && property.computed !== true
    && (isIdentifierNode(property.key) || isStringLiteralNode(property.key) || isNumericLiteralNode(property.key))
}

function isNumericLiteralNode(value: unknown): value is NumericLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'NumericLiteral'
    && typeof (value as { value?: unknown }).value === 'number'
}

function stringifyDecoratorValue(value: QuaScriptDecoratorValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}
