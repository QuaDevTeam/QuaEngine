import type {
  QuaStoryLabelRef,
  QuaStoryNodeRef,
  StoryIndex,
  StoryTargetData,
} from './types'
import {
  arrayOfStrings,
  asRecord,
  stringValue,
} from './utils'

export function describeTarget(target: StoryTargetData): string {
  switch (target.kind) {
    case 'node':
    case 'label':
    case 'checkpoint':
      return `${target.kind}:${target.id || 'unknown'}`
    case 'scene':
      return target.entry ? `scene:${target.sceneId || 'unknown'}#${target.entry}` : `scene:${target.sceneId || 'unknown'}`
    case 'script':
      return `script:${target.moduleId || 'unknown'}`
    case 'package-node':
      return `package:${target.packageId || 'unknown'}#${target.nodeId || 'unknown'}`
    default:
      return `${target.kind}:unknown`
  }
}

export function findTargetCandidates(target: StoryTargetData, index: StoryIndex): QuaStoryNodeRef[] {
  if (target.kind === 'node') {
    return index.nodes.filter(node =>
      node.id === target.id
      && targetMatchesCommonFields(target, node),
    )
  }
  if (target.kind === 'label') {
    const matchingLabels = index.labels.filter(label =>
      label.id === target.id
      && (!target.sceneId || label.sceneId === target.sceneId)
      && (!target.packageId || label.packageId === target.packageId),
    )
    return matchingLabels.map(labelToNodeRef)
  }
  if (target.kind === 'package-node') {
    return index.nodes.filter(node =>
      node.id === target.nodeId
      && node.packageId === target.packageId
      && (!target.sceneId || node.sceneId === target.sceneId),
    )
  }
  return []
}

export function findTargetDefinitionRefs(target: StoryTargetData, index: StoryIndex): Array<{ filePath?: string, range?: import('@quajs/script-compiler').SourceRange }> {
  if (target.kind === 'scene') {
    if (target.entry) {
      const entryRefs = index.entries.filter(entry => entry.sceneId === target.sceneId && entry.id === target.entry)
      if (entryRefs.length > 0) {
        return entryRefs.map(entry => ({ filePath: entry.sourceLocation?.filePath, range: entry.sourceLocation?.range }))
      }
    }
    return index.scenes
      .filter(scene => scene.id === target.sceneId)
      .map(scene => ({ filePath: scene.sourceLocation?.filePath, range: scene.sourceLocation?.range }))
  }
  if (target.kind === 'label') {
    return index.labels
      .filter(label => label.id === target.id && targetMatchesCommonFields(target, label))
      .map(label => ({ filePath: label.sourceLocation?.filePath, range: label.sourceLocation?.range }))
  }
  return findTargetCandidates(target, index)
    .map(node => ({ filePath: node.sourceLocation?.filePath, range: node.sourceLocation?.range }))
}

export function normalizeChoiceTarget(value: unknown): StoryTargetData | undefined {
  if (typeof value === 'string') {
    return normalizeTargetSugar(value)
  }
  if (isTargetHelperCall(value)) {
    return normalizeTargetHelper(value)
  }
  const record = asRecord(value)
  if (typeof record?.kind === 'string') {
    return normalizeTargetRecord(record)
  }
  return undefined
}

export function normalizeTargetSugar(source: string): StoryTargetData {
  const target = source.trim()
  if (target.startsWith('#')) {
    return { kind: 'label', id: target.slice(1) }
  }
  const sceneMatch = /^scene:([^#\s]+)(?:#(\S+))?$/.exec(target)
  if (sceneMatch) {
    return { kind: 'scene', sceneId: sceneMatch[1], ...(sceneMatch[2] ? { entry: sceneMatch[2] } : {}) }
  }
  const packageMatch = /^package:([^#\s]+)#(\S+)$/.exec(target)
  if (packageMatch) {
    return { kind: 'package-node', packageId: packageMatch[1], nodeId: packageMatch[2] }
  }
  const scriptMatch = /^script:([^#\s]+)(?:#(\S+))?$/.exec(target)
  if (scriptMatch) {
    return { kind: 'script', moduleId: scriptMatch[1], ...(scriptMatch[2] ? { nodeId: scriptMatch[2] } : {}) }
  }
  return { kind: 'node', id: target }
}

export function targetAtPosition(source: string, position: { character: number, line: number }): StoryTargetData | undefined {
  const line = source.split(/\r?\n/)[position.line] || ''
  const candidates: Array<{ end: number, start: number, target: StoryTargetData }> = []
  collectLineTargetCandidates(line, candidates)
  return candidates.find(candidate => position.character >= candidate.start && position.character <= candidate.end)?.target
}

function collectLineTargetCandidates(line: string, candidates: Array<{ end: number, start: number, target: StoryTargetData }>): void {
  const sugar = /^\s*-\s+(?:\S.*?|[\t\v\f \xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF])->\s*([#\w:.-]+)/.exec(line)
  if (sugar?.[1]) {
    const start = line.indexOf(sugar[1])
    candidates.push({ start, end: start + sugar[1].length, target: normalizeTargetSugar(sugar[1]) })
  }

  const helperPattern = /\b(node|label|scene|script|checkpoint)\(\s*(['"])(.*?)\2/g
  let helper = helperPattern.exec(line)
  while (helper) {
    const literalStart = helper.index + helper[0].lastIndexOf(helper[3])
    const target = helperNameToTarget(helper[1], helper[3])
    if (target) {
      candidates.push({ start: literalStart, end: literalStart + helper[3].length, target })
    }
    helper = helperPattern.exec(line)
  }

  const packageHelperPattern = /\bpackageNode\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3/g
  let packageHelper = packageHelperPattern.exec(line)
  while (packageHelper) {
    const literalStart = packageHelper.index + packageHelper[0].lastIndexOf(packageHelper[4])
    candidates.push({
      start: literalStart,
      end: literalStart + packageHelper[4].length,
      target: { kind: 'package-node', packageId: packageHelper[2], nodeId: packageHelper[4] },
    })
    packageHelper = packageHelperPattern.exec(line)
  }
}

function helperNameToTarget(name: string, value: string): StoryTargetData | undefined {
  switch (name) {
    case 'node':
      return { kind: 'node', id: value }
    case 'label':
      return { kind: 'label', id: value }
    case 'scene':
      return { kind: 'scene', sceneId: value }
    case 'script':
      return { kind: 'script', moduleId: value }
    case 'checkpoint':
      return { kind: 'checkpoint', id: value }
    default:
      return undefined
  }
}

function labelToNodeRef(label: QuaStoryLabelRef): QuaStoryNodeRef {
  return {
    id: label.nodeId || label.id,
    graphId: label.graphId,
    labelId: label.id,
    packageId: label.packageId,
    sceneId: label.sceneId,
    sourceLocation: label.sourceLocation,
  }
}

function normalizeTargetHelper(value: CallExpressionLike): StoryTargetData | undefined {
  const callee = getCallCalleeName(value)
  const first = stringArgument(value.arguments[0])
  const second = stringArgument(value.arguments[1])
  const options = objectArgument(value.arguments[callee === 'packageNode' ? 2 : 1]) || {}
  const requiredRuntimePackages = arrayOfStrings(options.requiredRuntimePackages)

  switch (callee) {
    case 'node':
      return first ? { ...normalizeTargetRecord(options), kind: 'node', id: first, requiredRuntimePackages } : undefined
    case 'label':
      return first ? { ...normalizeTargetRecord(options), kind: 'label', id: first, requiredRuntimePackages } : undefined
    case 'scene':
      return first ? { ...normalizeTargetRecord(options), kind: 'scene', sceneId: first, requiredRuntimePackages } : undefined
    case 'script':
      return first ? { ...normalizeTargetRecord(options), kind: 'script', moduleId: first, requiredRuntimePackages } : undefined
    case 'checkpoint':
      return first ? { kind: 'checkpoint', id: first, requiredRuntimePackages } : undefined
    case 'packageNode':
      return first && second ? { ...normalizeTargetRecord(options), kind: 'package-node', packageId: first, nodeId: second, requiredRuntimePackages } : undefined
    default:
      return undefined
  }
}

function normalizeTargetRecord(record: Record<string, unknown>): StoryTargetData {
  return {
    kind: String(record.kind || ''),
    id: stringValue(record.id),
    nodeId: stringValue(record.nodeId),
    labelId: stringValue(record.labelId),
    entry: stringValue(record.entry),
    entryId: stringValue(record.entryId),
    stepId: stringValue(record.stepId),
    moduleId: stringValue(record.moduleId),
    packageId: stringValue(record.packageId),
    sceneId: stringValue(record.sceneId),
    state: record.state,
    scope: record.scope,
    requiredRuntimePackages: arrayOfStrings(record.requiredRuntimePackages),
  }
}

function targetMatchesCommonFields(target: StoryTargetData, node: { packageId?: string, sceneId?: string }): boolean {
  return (!target.sceneId || node.sceneId === target.sceneId)
    && (!target.packageId || node.packageId === target.packageId)
}

function objectArgument(value: unknown): Record<string, unknown> | undefined {
  if (!isObjectExpressionNode(value)) {
    return undefined
  }
  return Object.fromEntries((value.properties as unknown[])
    .filter(isObjectPropertyNode)
    .map((property) => {
      const key = isIdentifierNode(property.key)
        ? property.key.name
        : String((property.key as StringLiteralLike | NumericLiteralLike).value)
      return [key, normalizeTargetValue(property.value)]
    }))
}

function stringArgument(value: unknown): string | undefined {
  return isStringLiteralNode(value) ? value.value : undefined
}

function normalizeTargetValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeTargetValue)
  }
  if (isStringLiteralNode(value)) {
    return value.value
  }
  if (isNumericLiteralNode(value)) {
    return value.value
  }
  if (isBooleanLiteralNode(value)) {
    return value.value
  }
  if (isNullLiteralNode(value)) {
    return null
  }
  if (isObjectExpressionNode(value)) {
    return objectArgument(value)
  }
  return value
}

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

function isTargetHelperCall(value: unknown): value is CallExpressionLike {
  const calleeName = getCallCalleeName(value)
  return Boolean(calleeName && ['node', 'label', 'scene', 'script', 'checkpoint', 'packageNode'].includes(calleeName))
}

interface CallExpressionLike { arguments: unknown[], callee?: unknown, type: 'CallExpression' }
interface IdentifierLike { name: string, type: 'Identifier' }
interface StringLiteralLike { type: 'StringLiteral', value: string }
interface NumericLiteralLike { type: 'NumericLiteral', value: number }
interface ObjectPropertyLike { computed?: boolean, key: IdentifierLike | StringLiteralLike | NumericLiteralLike, type: 'ObjectProperty', value: unknown }
interface ObjectExpressionLike { properties: unknown[], type: 'ObjectExpression' }
interface BooleanLiteralLike { type: 'BooleanLiteral', value: boolean }
interface NullLiteralLike { type: 'NullLiteral' }

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

function isNumericLiteralNode(value: unknown): value is NumericLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'NumericLiteral'
    && typeof (value as { value?: unknown }).value === 'number'
}

function isBooleanLiteralNode(value: unknown): value is BooleanLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'BooleanLiteral'
    && typeof (value as { value?: unknown }).value === 'boolean'
}

function isNullLiteralNode(value: unknown): value is NullLiteralLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'NullLiteral'
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
