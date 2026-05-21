import type {
  CheckpointChoiceTarget,
  ChoiceDefinition,
  ChoiceDefinitionOptions,
  ChoiceTarget,
  JsonSerializableRecord,
  LabelChoiceTarget,
  NodeChoiceTarget,
  PackageNodeChoiceTarget,
  SceneChoiceTarget,
  ScriptChoiceTarget,
  StoryAssetRef,
} from './types'

export type NodeTargetOptions = Omit<NodeChoiceTarget, 'id' | 'kind'>
export type LabelTargetOptions = Omit<LabelChoiceTarget, 'id' | 'kind'>
export type SceneTargetOptions = Omit<SceneChoiceTarget, 'kind' | 'sceneId'>
export type ScriptTargetOptions = Omit<ScriptChoiceTarget, 'kind' | 'moduleId'>
export type PackageNodeTargetOptions = Omit<PackageNodeChoiceTarget, 'kind' | 'nodeId' | 'packageId'>

export function node(id: string, options: NodeTargetOptions = {}): NodeChoiceTarget {
  return { kind: 'node', id, ...options }
}

export function label(id: string, options: LabelTargetOptions = {}): LabelChoiceTarget {
  return { kind: 'label', id, ...options }
}

export function scene(sceneId: string, options: SceneTargetOptions = {}): SceneChoiceTarget {
  return { kind: 'scene', sceneId, ...options }
}

export function script(moduleId: string, options: ScriptTargetOptions = {}): ScriptChoiceTarget {
  return { kind: 'script', moduleId, ...options }
}

export function checkpoint(id: string): CheckpointChoiceTarget {
  return { kind: 'checkpoint', id }
}

export function packageNode(packageId: string, nodeId: string, options: PackageNodeTargetOptions = {}): PackageNodeChoiceTarget {
  return { kind: 'package-node', packageId, nodeId, ...options }
}

export function image(name: string, options: Omit<StoryAssetRef, 'name' | 'type'> = {}): StoryAssetRef {
  return { type: 'images', name, ...options }
}

export function defineChoice(
  text: string,
  target?: ChoiceTarget,
  options: ChoiceDefinitionOptions = {},
): ChoiceDefinition {
  const enabled = options.when !== false
  return {
    id: options.id || createChoiceId(text, target),
    text,
    target,
    enabled,
    unavailable: options.unavailable,
    presentation: options.presentation,
    metadata: options.metadata,
  }
}

export function isChoiceTarget(value: unknown): value is ChoiceTarget {
  return Boolean(value)
    && typeof value === 'object'
    && typeof (value as { kind?: unknown }).kind === 'string'
}

export function assertSerializableSceneState(value: unknown, path = 'state'): asserts value is JsonSerializableRecord | undefined {
  if (value === undefined) {
    return
  }
  if (!isSerializableValue(value, new Set())) {
    throw new Error(`Scene initial ${path} must be JSON-serializable.`)
  }
}

function createChoiceId(text: string, target?: ChoiceTarget): string {
  if (target?.kind === 'node') {
    return target.id
  }
  if (target?.kind === 'label') {
    return target.id
  }
  if (target?.kind === 'scene') {
    return target.entry ? `${target.sceneId}:${target.entry}` : target.sceneId
  }
  if (target?.kind === 'script') {
    return target.stepId || target.labelId || target.nodeId || target.entryId || target.moduleId
  }
  if (target?.kind === 'checkpoint') {
    return target.id
  }
  if (target?.kind === 'package-node') {
    return `${target.packageId}:${target.nodeId}`
  }
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'choice'
}

function isSerializableValue(value: unknown, seen: Set<object>): boolean {
  if (value === null) {
    return true
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return Number.isFinite(value as number) || typeof value !== 'number'
  }
  if (typeof value !== 'object') {
    return false
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.every(item => isSerializableValue(item, seen))
  }

  return Object.values(value as Record<string, unknown>).every(item => isSerializableValue(item, seen))
}
