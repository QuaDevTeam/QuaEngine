import type {
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDiagnostic,
  QuaScriptDialogue,
} from '@quajs/script-compiler'
import type {
  QuaProjectInspectorOptions,
  StoryIndex,
  StoryTargetCompletion,
  StoryTargetData,
  StoryTargetDefinition,
} from './types'
import { buildProjectIndexSync } from './indexer'
import {
  describeTarget,
  findTargetCandidates,
  findTargetDefinitionRefs,
  normalizeChoiceTarget,
  targetAtPosition,
} from './targets'
import { asRecord, isSameFile, storyAssetExists } from './utils'

interface ChoiceContext {
  currentSceneId?: string
  range?: import('@quajs/script-compiler').SourceRange
}

export function collectQuaScriptStoryDiagnostics(
  source: string,
  parsed: ParsedQuaScript,
  options: QuaProjectInspectorOptions = {},
): QuaScriptDiagnostic[] {
  const index = buildProjectIndexSync({ ...options, source })
  return [
    ...collectCurrentChoiceDiagnostics(parsed, index),
    ...collectCurrentAssetDiagnostics(index, options),
  ]
}

export function getQuaScriptStoryTargetCompletions(
  source: string,
  options: QuaProjectInspectorOptions = {},
): StoryTargetCompletion[] {
  const index = buildProjectIndexSync({ ...options, source })
  const items: StoryTargetCompletion[] = []
  for (const node of index.nodes) {
    items.push({
      label: node.id,
      insertText: node.id,
      detail: node.packageId ? `Story node (${node.packageId})` : 'Story node',
    })
    if (node.packageId) {
      items.push({
        label: `${node.packageId}#${node.id}`,
        insertText: `package:${node.packageId}#${node.id}`,
        detail: 'Package-scoped story node',
      })
    }
  }
  for (const label of index.labels) {
    items.push({
      label: `#${label.id}`,
      insertText: `#${label.id}`,
      detail: 'Story label',
    })
  }
  for (const scene of index.scenes) {
    items.push({
      label: `scene:${scene.id}`,
      insertText: `scene:${scene.id}`,
      detail: 'Story scene',
    })
  }
  for (const entry of index.entries) {
    items.push({
      label: entry.sceneId ? `scene:${entry.sceneId}#${entry.id}` : `scene:${entry.id}`,
      insertText: entry.sceneId ? `scene:${entry.sceneId}#${entry.id}` : `scene:${entry.id}`,
      detail: 'Scene entry',
    })
  }
  for (const moduleId of index.scriptModuleIds) {
    items.push({
      label: `script:${moduleId}`,
      insertText: `script:${moduleId}`,
      detail: 'Runtime script module',
    })
  }
  return uniqueStoryTargetCompletions(items)
}

export function getQuaScriptStoryDefinitions(
  source: string,
  position: { character: number, line: number },
  options: QuaProjectInspectorOptions = {},
): StoryTargetDefinition[] {
  const target = targetAtPosition(source, position)
  if (!target) {
    return []
  }
  const index = buildProjectIndexSync({ ...options, source })
  return findTargetDefinitionRefs(target, index)
    .filter((ref): ref is { filePath?: string, range: import('@quajs/script-compiler').SourceRange } => Boolean(ref.range))
    .map(ref => ({
      filePath: isSameFile(ref.filePath, options.filePath) ? undefined : ref.filePath,
      range: ref.range,
    }))
}

function collectCurrentChoiceDiagnostics(parsed: ParsedQuaScript, index: StoryIndex): QuaScriptDiagnostic[] {
  const diagnostics: QuaScriptDiagnostic[] = []
  let currentSceneId: string | undefined

  for (const step of parsed.steps) {
    const decorators = step.type === 'dialogue'
      ? (step.content as QuaScriptDialogue).decorators
      : []

    for (const decorator of decorators) {
      if (decorator.name === 'Scene' && typeof decorator.args[0] === 'string') {
        currentSceneId = decorator.args[0]
      }
    }

    if (step.type !== 'choice') {
      continue
    }

    const choice = step.content as QuaScriptChoice
    for (const option of choice.options) {
      const context: ChoiceContext = {
        currentSceneId,
        range: option.range || choice.range,
      }
      if (option.source === 'sugar' && option.condition && isComplexSugarCondition(option.condition)) {
        diagnostics.push({
          code: 'QS_STORY_COMPLEX_CHOICE_CONDITION',
          message: 'Choice sugar uses a complex if expression. Prefer <script setup> bindings or @Choice(..., { when }) for maintainable branching.',
          range: option.conditionRange || option.range,
          severity: 'warning',
          source: 'quascript/story',
        })
      }

      const target = normalizeChoiceTarget(option.target)
      if (!target) {
        diagnostics.push({
          code: 'QS_STORY_UNSTRUCTURED_CHOICE_TARGET',
          message: `Choice "${option.text}" does not declare a structured story target.`,
          range: context.range,
          severity: 'error',
          source: 'quascript/story',
        })
        continue
      }

      diagnostics.push(...diagnoseTarget(target, option.text, context, index))
    }
  }

  return diagnostics
}

function diagnoseTarget(
  target: StoryTargetData,
  choiceText: string,
  context: ChoiceContext,
  index: StoryIndex,
): QuaScriptDiagnostic[] {
  const diagnostics: QuaScriptDiagnostic[] = []

  if (target.kind === 'scene') {
    if (!isSerializableLiteral(target.state)) {
      diagnostics.push({
        code: 'QS_STORY_NON_SERIALIZABLE_SCENE_STATE',
        message: `Scene target "${target.sceneId || 'unknown'}" passes non-serializable initial state. Scene state must be JSON-serializable.`,
        range: context.range,
        severity: 'warning',
        source: 'quascript/story',
      })
    }
    const sceneMatches = index.scenes.filter(scene => scene.id === target.sceneId)
    const entryMatches = target.entry
      ? index.entries.filter(entry => entry.sceneId === target.sceneId && entry.id === target.entry)
      : []
    if (index.hasProjectDeclarations && sceneMatches.length === 0 && entryMatches.length === 0) {
      diagnostics.push({
        code: 'QS_STORY_UNRESOLVED_SCENE_TARGET',
        message: `Unresolved scene target "${describeTarget(target)}".`,
        range: context.range,
        severity: 'error',
        source: 'quascript/story',
      })
      return diagnostics
    }
    if (target.entry && entryMatches.length === 0 && sceneMatches.length > 0) {
      diagnostics.push({
        code: 'QS_STORY_UNRESOLVED_SCENE_ENTRY',
        message: `Scene target "${describeTarget(target)}" references an entry that does not exist in the indexed story tree.`,
        range: context.range,
        severity: 'error',
        source: 'quascript/story',
      })
    }
    return diagnostics
  }

  if (target.kind === 'script') {
    if (!isSerializableLiteral(target.scope)) {
      diagnostics.push({
        code: 'QS_STORY_NON_SERIALIZABLE_SCRIPT_SCOPE',
        message: `Script target "${target.moduleId || 'unknown'}" passes non-serializable scope. Script jump scope must be JSON-serializable.`,
        range: context.range,
        severity: 'warning',
        source: 'quascript/story',
      })
    }
    if (target.moduleId && index.scriptModuleIds.size > 0 && !index.scriptModuleIds.has(target.moduleId)) {
      diagnostics.push({
        code: 'QS_STORY_UNRESOLVED_SCRIPT_TARGET',
        message: `Unresolved script target "${target.moduleId}".`,
        range: context.range,
        severity: 'error',
        source: 'quascript/story',
      })
    }
    return diagnostics
  }

  if (target.kind === 'checkpoint') {
    return diagnostics
  }

  const packageId = target.kind === 'package-node' ? target.packageId : target.packageId
  if (packageId) {
    if (index.packageIds.size > 0 && !index.packageIds.has(packageId)) {
      diagnostics.push({
        code: 'QS_PROJECT_UNKNOWN_RUNTIME_PACKAGE',
        message: `Package-scoped target references unknown runtime package "${packageId}".`,
        range: context.range,
        severity: 'error',
        source: 'quascript/project',
      })
    }
    else if (!target.requiredRuntimePackages?.includes(packageId) && !projectDeclaresDependencyOn(index, packageId)) {
      diagnostics.push({
        code: 'QS_PROJECT_MISSING_RUNTIME_PACKAGE_DEPENDENCY',
        message: `Package-scoped target "${packageId}" should be declared through runtime package dependencies or requiredRuntimePackages.`,
        range: context.range,
        severity: 'warning',
        source: 'quascript/project',
      })
    }
  }

  const candidates = findTargetCandidates(target, index)
  const sameSceneCandidates = target.kind === 'scene'
    ? candidates
    : candidates.filter(candidate => !context.currentSceneId || !candidate.sceneId || candidate.sceneId === context.currentSceneId)
  const crossSceneCandidates = candidates.filter(candidate => context.currentSceneId && candidate.sceneId && candidate.sceneId !== context.currentSceneId)

  if (sameSceneCandidates.length > 1) {
    diagnostics.push({
      code: 'QS_STORY_AMBIGUOUS_TARGET',
      message: `Ambiguous story target "${describeTarget(target)}" resolves to ${sameSceneCandidates.length} story nodes.`,
      range: context.range,
      severity: 'error',
      source: 'quascript/story',
    })
    return diagnostics
  }

  if (sameSceneCandidates.length === 0 && crossSceneCandidates.length > 0) {
    diagnostics.push({
      code: 'QS_STORY_CROSS_SCENE_TARGET',
      message: `Choice "${choiceText}" targets "${describeTarget(target)}" in another scene. Use scene(...) or scene:id#entry for cross-scene choice jumps.`,
      range: context.range,
      severity: 'error',
      source: 'quascript/story',
    })
    return diagnostics
  }

  if (sameSceneCandidates.length === 0 && index.hasProjectDeclarations) {
    diagnostics.push({
      code: 'QS_STORY_UNRESOLVED_TARGET',
      message: `Unresolved story target "${describeTarget(target)}".`,
      range: context.range,
      severity: 'error',
      source: 'quascript/story',
    })
  }

  return diagnostics
}

function collectCurrentAssetDiagnostics(index: StoryIndex, options: QuaProjectInspectorOptions): QuaScriptDiagnostic[] {
  if (!options.projectRoot) {
    return []
  }
  return index.assetLineage.flatMap((asset) => {
    const diagnostics: QuaScriptDiagnostic[] = []
    if (asset.packageId && index.packageIds.size > 0 && !index.packageIds.has(asset.packageId)) {
      diagnostics.push({
        code: 'QS_PROJECT_UNKNOWN_RUNTIME_PACKAGE',
        message: `Story asset "${asset.name}" references unknown runtime package "${asset.packageId}".`,
        range: asset.sourceLocation?.range,
        severity: 'error',
        source: 'quascript/project',
      })
    }
    if (!storyAssetExists({ filePath: asset.sourceLocation?.filePath || options.filePath, projectRoot: options.projectRoot }, asset.type, asset.name)) {
      diagnostics.push({
        code: 'QS_PROJECT_MISSING_ASSET',
        message: `Story asset "${asset.name}" was not found under project assets.`,
        range: asset.sourceLocation?.range,
        severity: 'error',
        source: 'quascript/project',
      })
    }
    return diagnostics
  })
}

function isComplexSugarCondition(condition: string): boolean {
  const operators = condition.match(/&&|\|\||[!=]==?|[<>]=?|\?/g) || []
  return condition.length > 60
    || operators.length > 1
    || /\b(?:await|new)\b/.test(condition)
    || /\([^()]*\([^)]*\)/.test(condition)
}

function isSerializableLiteral(value: unknown, seen = new Set<object>()): boolean {
  if (value === undefined || value === null) {
    return true
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return true
  }
  if (typeof value === 'number') {
    return Number.isFinite(value)
  }
  if (Array.isArray(value)) {
    return value.every(item => isSerializableLiteral(item, seen))
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  if (isExpressionLike(value)) {
    return isLiteralExpression(value)
  }
  if (seen.has(value)) {
    return false
  }
  seen.add(value)
  return Object.values(value as Record<string, unknown>).every(item => isSerializableLiteral(item, seen))
}

function isLiteralExpression(value: unknown): boolean {
  return isStringLiteralNode(value)
    || isNumericLiteralNode(value)
    || isBooleanLiteralNode(value)
    || isNullLiteralNode(value)
}

function projectDeclaresDependencyOn(index: StoryIndex, packageId: string): boolean {
  return Array.from(index.packageDependencies.values()).some(dependencies => dependencies.has(packageId))
}

function uniqueStoryTargetCompletions(items: StoryTargetCompletion[]): StoryTargetCompletion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.insertText}:${item.label}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

interface StringLiteralLike { type: 'StringLiteral', value: string }
interface NumericLiteralLike { type: 'NumericLiteral', value: number }
interface BooleanLiteralLike { type: 'BooleanLiteral', value: boolean }
interface NullLiteralLike { type: 'NullLiteral' }

function isExpressionLike(value: unknown): boolean {
  return Boolean(asRecord(value)?.type)
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
