import type {
  ParsedQuaScript,
  QuaScriptChoice,
  QuaScriptDiagnostic,
  QuaScriptDialogue,
  SourceRange,
  StoryDeclaration,
} from '@quajs/script-compiler'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import {
  createLineStarts,
  extractQuaScriptStoryDeclaration,
  rangeFromOffsets,
} from '@quajs/script-compiler'

type StoryDeclarationWithEntries = StoryDeclaration & {
  entries?: Array<{ id: string, metadata?: Record<string, unknown>, point: Record<string, unknown> }>
}

export interface QuaScriptStoryDiagnosticOptions {
  extraFiles?: Record<string, string>
  filePath?: string
  projectRoot?: string
}

interface StoryTargetData {
  kind: string
  id?: string
  nodeId?: string
  labelId?: string
  entry?: string
  entryId?: string
  stepId?: string
  moduleId?: string
  packageId?: string
  sceneId?: string
  state?: unknown
  scope?: unknown
  requiredRuntimePackages?: string[]
}

interface StoryNodeRef {
  filePath?: string
  id: string
  graphId?: string
  labelId?: string
  moduleId?: string
  packageId?: string
  range?: SourceRange
  sceneId?: string
}

interface StoryEntryRef {
  filePath?: string
  id: string
  metadata?: Record<string, unknown>
  packageId?: string
  point?: Record<string, unknown>
  range?: SourceRange
  sceneId?: string
}

interface StoryLabelRef {
  filePath?: string
  id: string
  graphId?: string
  nodeId?: string
  packageId?: string
  range?: SourceRange
  sceneId?: string
}

interface StorySceneRef {
  filePath?: string
  id: string
  range?: SourceRange
}

interface StoryIndex {
  hasProjectDeclarations: boolean
  entries: StoryEntryRef[]
  labels: StoryLabelRef[]
  nodes: StoryNodeRef[]
  packageDependencies: Map<string, Set<string>>
  packageIds: Set<string>
  scenes: StorySceneRef[]
  scriptModuleIds: Set<string>
}

export interface StoryTargetCompletion {
  detail: string
  insertText: string
  label: string
}

export interface StoryTargetDefinition {
  filePath?: string
  range: SourceRange
}

interface ChoiceContext {
  currentSceneId?: string
  range?: SourceRange
}

const PROJECT_SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'coverage', '.quack-logs'])
const STORY_ASSET_TYPES = new Set(['images', 'audio', 'video', 'sprites', 'backgrounds', 'data'])

export function collectQuaScriptStoryDiagnostics(
  source: string,
  parsed: ParsedQuaScript,
  options: QuaScriptStoryDiagnosticOptions = {},
): QuaScriptDiagnostic[] {
  const index = buildStoryIndex(source, options)
  return [
    ...collectCurrentChoiceDiagnostics(parsed, index),
    ...collectCurrentAssetDiagnostics(parsed, options, index),
  ]
}

export function getQuaScriptStoryTargetCompletions(
  source: string,
  options: QuaScriptStoryDiagnosticOptions = {},
): StoryTargetCompletion[] {
  const index = buildStoryIndex(source, options)
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
  options: QuaScriptStoryDiagnosticOptions = {},
): StoryTargetDefinition[] {
  const target = targetAtPosition(source, position)
  if (!target) {
    return []
  }
  const index = buildStoryIndex(source, options)
  return findTargetDefinitionRefs(target, index)
    .filter((ref): ref is { filePath?: string, range: SourceRange } => Boolean(ref.range))
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
          message: 'Choice sugar uses a complex if expression. Prefer <script setup> bindings or @Choice(..., { when }) for maintainable branching.',
          range: option.conditionRange || option.range,
          severity: 'warning',
        })
      }

      const target = normalizeChoiceTarget(option.target)
      if (!target) {
        diagnostics.push({
          message: `Choice "${option.text}" does not declare a structured story target.`,
          range: context.range,
          severity: 'error',
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
        message: `Scene target "${target.sceneId || 'unknown'}" passes non-serializable initial state. Scene state must be JSON-serializable.`,
        range: context.range,
        severity: 'warning',
      })
    }
    const sceneMatches = index.scenes.filter(scene => scene.id === target.sceneId)
    const entryMatches = target.entry
      ? index.entries.filter(entry => entry.sceneId === target.sceneId && entry.id === target.entry)
      : []
    if (index.hasProjectDeclarations && sceneMatches.length === 0 && entryMatches.length === 0) {
      diagnostics.push({
        message: `Unresolved scene target "${describeTarget(target)}".`,
        range: context.range,
        severity: 'error',
      })
      return diagnostics
    }
    if (target.entry && entryMatches.length === 0 && sceneMatches.length > 0) {
      diagnostics.push({
        message: `Scene target "${describeTarget(target)}" references an entry that does not exist in the indexed story tree.`,
        range: context.range,
        severity: 'error',
      })
    }
    return diagnostics
  }

  if (target.kind === 'script') {
    if (!isSerializableLiteral(target.scope)) {
      diagnostics.push({
        message: `Script target "${target.moduleId || 'unknown'}" passes non-serializable scope. Script jump scope must be JSON-serializable.`,
        range: context.range,
        severity: 'warning',
      })
    }
    if (target.moduleId && index.scriptModuleIds.size > 0 && !index.scriptModuleIds.has(target.moduleId)) {
      diagnostics.push({
        message: `Unresolved script target "${target.moduleId}".`,
        range: context.range,
        severity: 'error',
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
        message: `Package-scoped target references unknown runtime package "${packageId}".`,
        range: context.range,
        severity: 'error',
      })
    }
    else if (!target.requiredRuntimePackages?.includes(packageId) && !projectDeclaresDependencyOn(index, packageId)) {
      diagnostics.push({
        message: `Package-scoped target "${packageId}" should be declared through runtime package dependencies or requiredRuntimePackages.`,
        range: context.range,
        severity: 'warning',
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
      message: `Ambiguous story target "${describeTarget(target)}" resolves to ${sameSceneCandidates.length} story nodes.`,
      range: context.range,
      severity: 'error',
    })
    return diagnostics
  }

  if (sameSceneCandidates.length === 0 && crossSceneCandidates.length > 0) {
    diagnostics.push({
      message: `Choice "${choiceText}" targets "${describeTarget(target)}" in another scene. Use scene(...) or scene:id#entry for cross-scene choice jumps.`,
      range: context.range,
      severity: 'error',
    })
    return diagnostics
  }

  if (sameSceneCandidates.length === 0 && index.hasProjectDeclarations) {
    diagnostics.push({
      message: `Unresolved story target "${describeTarget(target)}".`,
      range: context.range,
      severity: 'error',
    })
  }

  return diagnostics
}

function collectCurrentAssetDiagnostics(
  parsed: ParsedQuaScript,
  options: QuaScriptStoryDiagnosticOptions,
  index: StoryIndex,
): QuaScriptDiagnostic[] {
  const diagnostics: QuaScriptDiagnostic[] = []
  if (!options.projectRoot) {
    return diagnostics
  }

  for (const step of parsed.steps) {
    const decorators = step.type === 'dialogue'
      ? (step.content as QuaScriptDialogue).decorators
      : []

    for (const decorator of decorators) {
      for (const asset of collectAssetRefs(decorator.args)) {
        diagnostics.push(...diagnoseAssetRef(asset, decorator.range, options, index))
      }
    }

    if (step.type === 'choice') {
      const choice = step.content as QuaScriptChoice
      for (const option of choice.options) {
        diagnostics.push(...collectAssetRefs([option.options]).flatMap(asset =>
          diagnoseAssetRef(asset, option.range, options, index),
        ))
      }
    }
  }

  return diagnostics
}

function diagnoseAssetRef(
  asset: { name: string, runtimePackageId?: string, type: string },
  range: SourceRange | undefined,
  options: QuaScriptStoryDiagnosticOptions,
  index: StoryIndex,
): QuaScriptDiagnostic[] {
  const diagnostics: QuaScriptDiagnostic[] = []
  if (asset.runtimePackageId && index.packageIds.size > 0 && !index.packageIds.has(asset.runtimePackageId)) {
    diagnostics.push({
      message: `Story asset "${asset.name}" references unknown runtime package "${asset.runtimePackageId}".`,
      range,
      severity: 'error',
    })
  }

  if (!storyAssetExists(options, asset.type, asset.name)) {
    diagnostics.push({
      message: `Story asset "${asset.name}" was not found under project assets.`,
      range,
      severity: 'error',
    })
  }

  return diagnostics
}

function buildStoryIndex(source: string, options: QuaScriptStoryDiagnosticOptions): StoryIndex {
  const index: StoryIndex = {
    hasProjectDeclarations: false,
    entries: [],
    labels: [],
    nodes: [],
    packageDependencies: new Map(),
    packageIds: new Set(),
    scenes: [],
    scriptModuleIds: new Set(),
  }

  addStoryDeclaration(index, safeExtractStoryDeclaration(source, {
    moduleId: moduleIdFromFilePath(options.filePath),
  }), { filePath: options.filePath })
  attachQuaScriptDeclarationRanges(index, source, options.filePath)

  for (const [filePath, content] of Object.entries(options.extraFiles || {})) {
    if (filePath.endsWith('.qs')) {
      addStoryDeclaration(index, safeExtractStoryDeclaration(content, { moduleId: moduleIdFromFilePath(filePath) }), { filePath })
      attachQuaScriptDeclarationRanges(index, content, filePath)
    }
    if (filePath.endsWith('.json')) {
      addRuntimePackageManifest(index, safeParseJson(content))
    }
  }

  if (options.projectRoot) {
    const projectRoot = resolve(options.projectRoot)
    for (const filePath of listProjectFiles(projectRoot)) {
      if (options.filePath && resolve(filePath) === resolve(options.filePath)) {
        continue
      }
      const extension = extname(filePath)
      if (extension !== '.qs' && extension !== '.json') {
        continue
      }
      const content = readFileSync(filePath, 'utf8')
      if (extension === '.qs') {
        addStoryDeclaration(index, safeExtractStoryDeclaration(content, { moduleId: moduleIdFromFilePath(filePath) }), { filePath })
        attachQuaScriptDeclarationRanges(index, content, filePath)
      }
      else {
        addRuntimePackageManifest(index, safeParseJson(content))
      }
    }
  }

  return index
}

function addStoryDeclaration(index: StoryIndex, declaration: StoryDeclarationWithEntries | undefined, meta: { filePath?: string } = {}): void {
  if (!declaration) {
    return
  }
  index.hasProjectDeclarations = index.hasProjectDeclarations
    || declaration.nodes.length > 0
    || declaration.labels.length > 0
    || declaration.scenes.length > 0
    || (declaration.entries?.length || 0) > 0

  if (declaration.moduleId) {
    index.scriptModuleIds.add(declaration.moduleId)
  }
  if (declaration.runtimePackageId) {
    index.packageIds.add(declaration.runtimePackageId)
  }

  for (const scene of declaration.scenes) {
    index.scenes.push({ filePath: meta.filePath, id: scene.id })
  }
  for (const entry of declaration.entries || []) {
    const entryPoint = asRecord(entry.point) || {}
    index.entries.push({
      filePath: meta.filePath,
      id: entry.id,
      metadata: asRecord(entry.metadata),
      packageId: stringValue(entryPoint.contentPackageId) || declaration.runtimePackageId,
      point: entryPoint,
      sceneId: stringValue(entryPoint.sceneId),
    })
  }
  for (const node of declaration.nodes) {
    index.nodes.push({
      filePath: meta.filePath,
      id: node.id,
      graphId: stringValue(node.point.storyId),
      labelId: stringValue(node.point.labelId),
      moduleId: stringValue(node.point.scriptModuleId) || declaration.moduleId,
      packageId: stringValue(node.point.contentPackageId) || declaration.runtimePackageId,
      sceneId: stringValue(node.point.sceneId),
    })
  }
  for (const label of declaration.labels) {
    index.labels.push({
      filePath: meta.filePath,
      id: label.id,
      graphId: stringValue(label.point.storyId),
      nodeId: stringValue(label.point.nodeId),
      packageId: stringValue(label.point.contentPackageId) || declaration.runtimePackageId,
      sceneId: stringValue(label.point.sceneId),
    })
  }
}

function addRuntimePackageManifest(index: StoryIndex, value: unknown): void {
  const runtimePackage = runtimePackageFromJson(value)
  if (!runtimePackage) {
    return
  }

  const packageId = stringValue(runtimePackage.id)
  if (packageId) {
    index.packageIds.add(packageId)
    index.packageDependencies.set(packageId, new Set(arrayOfStrings(runtimePackage.dependencies)))
  }

  for (const script of arrayOfRecords(runtimePackage.scripts)) {
    const scriptId = stringValue(script.id)
    if (scriptId) {
      index.scriptModuleIds.add(scriptId)
    }
    const scriptMetadata = asRecord(script.metadata)
    addStoryDeclaration(index, storyDeclarationFromUnknown(scriptMetadata?.story, packageId, scriptId))
  }

  for (const delta of arrayOfRecords(runtimePackage.storyGraphDeltas)) {
    const graphId = stringValue(delta.graphId)
    for (const node of arrayOfRecords(delta.nodes)) {
      const point = asRecord(node.point) || {}
      const nodeId = stringValue(node.id) || stringValue(point.nodeId)
      if (!nodeId) {
        continue
      }
      index.nodes.push({
        id: nodeId,
        graphId,
        labelId: stringValue(point.labelId),
        moduleId: stringValue(point.scriptModuleId),
        packageId: stringValue(point.contentPackageId) || packageId,
        sceneId: stringValue(point.sceneId),
      })
    }
  }
}

function attachQuaScriptDeclarationRanges(index: StoryIndex, source: string, filePath?: string): void {
  if (!filePath) {
    return
  }
  const lineStarts = createLineStarts(source)
  source.split(/\r?\n/).forEach((line, lineIndex) => {
    const match = line.match(/^\s*@(Scene|Entry|Node|Label)\s*\(\s*(['"])(.*?)\2/)
    if (!match) {
      return
    }
    const range = rangeForLineSubstring(source, lineStarts, lineIndex, match[3])
    if (match[1] === 'Scene') {
      const scene = findLast(index.scenes, item => item.filePath === filePath && item.id === match[3] && !item.range)
      if (scene) {
        scene.range = range
      }
    }
    else if (match[1] === 'Entry') {
      const entry = findLast(index.entries, item => item.filePath === filePath && item.id === match[3] && !item.range)
      if (entry) {
        entry.range = range
      }
    }
    else if (match[1] === 'Node') {
      const node = findLast(index.nodes, item => item.filePath === filePath && item.id === match[3] && !item.range)
      if (node) {
        node.range = range
      }
    }
    else {
      const label = findLast(index.labels, item => item.filePath === filePath && item.id === match[3] && !item.range)
      if (label) {
        label.range = range
      }
    }
  })
}

function targetAtPosition(source: string, position: { character: number, line: number }): StoryTargetData | undefined {
  const line = source.split(/\r?\n/)[position.line] || ''
  const candidates: Array<{ end: number, start: number, target: StoryTargetData }> = []
  collectLineTargetCandidates(line, candidates)
  return candidates.find(candidate => position.character >= candidate.start && position.character <= candidate.end)?.target
}

function collectLineTargetCandidates(line: string, candidates: Array<{ end: number, start: number, target: StoryTargetData }>): void {
  const sugar = /^\s*-\s+.+?->\s*([#\w:.-]+)/.exec(line)
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

function findTargetDefinitionRefs(target: StoryTargetData, index: StoryIndex): Array<{ filePath?: string, range?: SourceRange }> {
  if (target.kind === 'scene') {
    if (target.entry) {
      const entryRefs = index.entries.filter(entry => entry.sceneId === target.sceneId && entry.id === target.entry)
      if (entryRefs.length > 0) {
        return entryRefs
      }
    }
    return index.scenes.filter(scene => scene.id === target.sceneId)
  }
  if (target.kind === 'label') {
    return index.labels.filter(label => label.id === target.id && targetMatchesCommonFields(target, label))
  }
  return findTargetCandidates(target, index)
}

function storyDeclarationFromUnknown(value: unknown, runtimePackageId?: string, moduleId?: string): StoryDeclarationWithEntries | undefined {
  const record = asRecord(value)
  if (!record || !Array.isArray(record.nodes) && !Array.isArray(record.labels) && !Array.isArray(record.scenes) && !Array.isArray(record.entries)) {
    return undefined
  }
  return {
    moduleId: stringValue(record.moduleId) || moduleId,
    runtimePackageId: stringValue(record.runtimePackageId) || runtimePackageId,
    scenes: arrayOfRecords(record.scenes).map(scene => ({ id: String(scene.id || '') })).filter(scene => scene.id.length > 0),
    entries: arrayOfRecords(record.entries).map(entry => ({
      id: String(entry.id || ''),
      metadata: asRecord(entry.metadata),
      point: asRecord(entry.point) || {},
    })).filter(entry => entry.id.length > 0),
    nodes: arrayOfRecords(record.nodes).map(node => ({
      id: String(node.id || ''),
      point: asRecord(node.point) || {},
    })).filter(node => node.id.length > 0),
    labels: arrayOfRecords(record.labels).map(label => ({
      id: String(label.id || ''),
      point: asRecord(label.point) || {},
    })).filter(label => label.id.length > 0),
    choices: [],
    edges: [],
  }
}

function normalizeChoiceTarget(value: unknown): StoryTargetData | undefined {
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

function normalizeTargetSugar(source: string): StoryTargetData {
  const target = source.trim()
  if (target.startsWith('#')) {
    return { kind: 'label', id: target.slice(1) }
  }
  const sceneMatch = /^scene:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
  if (sceneMatch) {
    return { kind: 'scene', sceneId: sceneMatch[1], ...(sceneMatch[2] ? { entry: sceneMatch[2] } : {}) }
  }
  const packageMatch = /^package:([^#\s]+)#([^\s]+)$/.exec(target)
  if (packageMatch) {
    return { kind: 'package-node', packageId: packageMatch[1], nodeId: packageMatch[2] }
  }
  const scriptMatch = /^script:([^#\s]+)(?:#([^\s]+))?$/.exec(target)
  if (scriptMatch) {
    return { kind: 'script', moduleId: scriptMatch[1], ...(scriptMatch[2] ? { nodeId: scriptMatch[2] } : {}) }
  }
  return { kind: 'node', id: target }
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

function findTargetCandidates(target: StoryTargetData, index: StoryIndex): StoryNodeRef[] {
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
      && (!target.packageId || label.packageId === target.packageId)
    )
    return matchingLabels.map(label => ({
      id: label.nodeId || label.id,
      graphId: label.graphId,
      labelId: label.id,
      packageId: label.packageId,
      sceneId: label.sceneId,
    }))
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

function targetMatchesCommonFields(target: StoryTargetData, node: StoryNodeRef): boolean {
  return (!target.sceneId || node.sceneId === target.sceneId)
    && (!target.packageId || node.packageId === target.packageId)
}

function describeTarget(target: StoryTargetData): string {
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

function isComplexSugarCondition(condition: string): boolean {
  const operators = condition.match(/&&|\|\||[!=]==?|[<>]=?|\?/g) || []
  return condition.length > 60
    || operators.length > 1
    || /\b(?:await|new)\b/.test(condition)
    || /\([^)]*\([^)]*\)/.test(condition)
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

function collectAssetRefs(values: unknown[]): Array<{ name: string, runtimePackageId?: string, type: string }> {
  const refs: Array<{ name: string, runtimePackageId?: string, type: string }> = []
  for (const value of values) {
    collectAssetRefsFromUnknown(value, refs)
  }
  return refs
}

function collectAssetRefsFromUnknown(value: unknown, refs: Array<{ name: string, runtimePackageId?: string, type: string }>): void {
  if (isImageHelperCall(value)) {
    const name = stringArgument(value.arguments[0])
    const options = objectArgument(value.arguments[1]) || {}
    if (name) {
      refs.push({ type: 'images', name, runtimePackageId: stringValue(options.runtimePackageId) })
    }
    return
  }

  const record = asRecord(value)
  if (record && typeof record.type === 'string' && STORY_ASSET_TYPES.has(record.type) && typeof record.name === 'string') {
    refs.push({ type: record.type, name: record.name, runtimePackageId: stringValue(record.runtimePackageId) })
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectAssetRefsFromUnknown(item, refs))
    return
  }
  if (record) {
    Object.values(record).forEach(item => collectAssetRefsFromUnknown(item, refs))
  }
}

function storyAssetExists(options: QuaScriptStoryDiagnosticOptions, type: string, name: string): boolean {
  if (!options.projectRoot) {
    return true
  }
  const projectRoot = resolve(options.projectRoot)
  const candidates = [
    join(projectRoot, 'assets', type, name),
    join(projectRoot, 'assets', name),
    join(projectRoot, name),
    options.filePath ? join(dirname(options.filePath), name) : undefined,
  ].filter((candidate): candidate is string => Boolean(candidate))
  return candidates.some(candidate => existsSync(candidate))
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

function safeExtractStoryDeclaration(source: string, options: { moduleId?: string, runtimePackageId?: string } = {}): StoryDeclarationWithEntries | undefined {
  try {
    return extractQuaScriptStoryDeclaration(source, options) as StoryDeclarationWithEntries
  }
  catch {
    return undefined
  }
}

function safeParseJson(source: string): unknown {
  try {
    return JSON.parse(source)
  }
  catch {
    return undefined
  }
}

function listProjectFiles(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (PROJECT_SKIP_DIRS.has(entry.name)) {
        return []
      }
      return listProjectFiles(join(root, entry.name))
    }
    return entry.isFile() ? [join(root, entry.name)] : []
  })
}

function moduleIdFromFilePath(filePath: string | undefined): string | undefined {
  if (!filePath) {
    return undefined
  }
  return relative(dirname(filePath), filePath).replace(/\\/g, '/')
}

function runtimePackageFromJson(value: unknown): Record<string, unknown> | undefined {
  const record = asRecord(value)
  return asRecord(record?.runtimePackage)
    || asRecord(asRecord(record?.manifest)?.runtimePackage)
}

function projectDeclaresDependencyOn(index: StoryIndex, packageId: string): boolean {
  return Array.from(index.packageDependencies.values()).some(dependencies => dependencies.has(packageId))
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : []
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.map(asRecord).filter((item): item is Record<string, unknown> => Boolean(item))
    : []
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function findLast<T>(items: T[], predicate: (item: T) => boolean): T | undefined {
  for (let index = items.length - 1; index >= 0; index--) {
    if (predicate(items[index])) {
      return items[index]
    }
  }
  return undefined
}

function rangeForLineSubstring(source: string, lineStarts: readonly number[], lineIndex: number, value: string): SourceRange {
  const line = source.split(/\r?\n/)[lineIndex] || ''
  const localStart = Math.max(0, line.indexOf(value))
  const start = (lineStarts[lineIndex] || 0) + localStart
  return rangeFromOffsets(lineStarts, start, start + value.length)
}

function isSameFile(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right) && resolve(left!) === resolve(right!)
}

type CallExpressionLike = { arguments: unknown[], callee?: unknown, type: 'CallExpression' }
type IdentifierLike = { name: string, type: 'Identifier' }
type StringLiteralLike = { type: 'StringLiteral', value: string }
type NumericLiteralLike = { type: 'NumericLiteral', value: number }
type BooleanLiteralLike = { type: 'BooleanLiteral', value: boolean }
type ObjectPropertyLike = { computed?: boolean, key: IdentifierLike | StringLiteralLike | NumericLiteralLike, type: 'ObjectProperty', value: unknown }
type ObjectExpressionLike = { properties: unknown[], type: 'ObjectExpression' }

function isTargetHelperCall(value: unknown): value is CallExpressionLike {
  const callee = getCallCalleeName(value)
  return Boolean(callee && ['node', 'label', 'scene', 'script', 'checkpoint', 'packageNode'].includes(callee))
}

function isImageHelperCall(value: unknown): value is CallExpressionLike {
  return getCallCalleeName(value) === 'image'
}

function getCallCalleeName(value: unknown): string | undefined {
  const record = asRecord(value)
  if (record?.type !== 'CallExpression' || !isIdentifierNode(record.callee)) {
    return undefined
  }
  return record.callee.name
}

function objectArgument(value: unknown): Record<string, unknown> | undefined {
  if (!isObjectExpressionNode(value)) {
    return asRecord(value)
  }
  return Object.fromEntries(value.properties
    .filter(isObjectPropertyNode)
    .map((property) => {
      const key = isIdentifierNode(property.key)
        ? property.key.name
        : String((property.key as StringLiteralLike | NumericLiteralLike).value)
      return [key, expressionValue(property.value)]
    }))
}

function expressionValue(value: unknown): unknown {
  if (isStringLiteralNode(value) || isNumericLiteralNode(value) || isBooleanLiteralNode(value)) {
    return value.value
  }
  if (isNullLiteralNode(value)) {
    return null
  }
  if (isArrayExpressionNode(value)) {
    return value.elements.map(expressionValue)
  }
  if (isObjectExpressionNode(value)) {
    return objectArgument(value)
  }
  return value
}

function stringArgument(value: unknown): string | undefined {
  return isStringLiteralNode(value) ? value.value : stringValue(value)
}

function isExpressionLike(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
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

function isNullLiteralNode(value: unknown): boolean {
  return Boolean(value) && typeof value === 'object' && (value as { type?: unknown }).type === 'NullLiteral'
}

function isObjectExpressionNode(value: unknown): value is ObjectExpressionLike {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'ObjectExpression'
    && Array.isArray((value as { properties?: unknown }).properties)
}

function isObjectPropertyNode(value: unknown): value is ObjectPropertyLike {
  const record = asRecord(value)
  return record?.type === 'ObjectProperty'
    && record.computed !== true
    && (isIdentifierNode(record.key) || isStringLiteralNode(record.key) || isNumericLiteralNode(record.key))
}

function isArrayExpressionNode(value: unknown): value is { elements: unknown[], type: 'ArrayExpression' } {
  return Boolean(value)
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'ArrayExpression'
    && Array.isArray((value as { elements?: unknown }).elements)
}

export function diagnosticRangeForLine(source: string, lineIndex: number): SourceRange {
  const lineStarts = createLineStarts(source)
  const lines = source.split(/\r?\n/)
  const lineStart = lineStarts[Math.max(0, Math.min(lineIndex, lineStarts.length - 1))] || 0
  return rangeFromOffsets(lineStarts, lineStart, lineStart + (lines[lineIndex] || '').length)
}
