import type { QuaScriptChoice, QuaScriptDialogue } from '@quajs/script-compiler'
import type {
  QuaInspectorRisk,
  QuaProjectInspectorOptions,
  QuaRuntimePackageAssetRef,
  QuaRuntimePackageRef,
  StoryDeclarationWithEntries,
  StoryIndex,
} from './types'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { readQpkSummary } from '@quajs/quack/qpk-reader'
import {
  createLineStarts,
  extractQuaScriptStoryDeclaration,
  parseQuaScriptDocument,
  QuaScriptParser,
} from '@quajs/script-compiler'
import { collectAssetRefs } from './assets'
import { normalizeChoiceTarget } from './targets'
import {
  arrayOfRecords,
  arrayOfStrings,
  asRecord,
  findLast,
  listProjectFiles,
  moduleIdFromFilePath,
  rangeForLineSubstring,
  runtimePackageFromJson,
  safeParseJson,
  storyAssetExists,
  stringValue,
} from './utils'

export async function buildProjectIndex(options: QuaProjectInspectorOptions = {}): Promise<StoryIndex> {
  const index = createEmptyIndex()
  const currentSource = options.source
  if (currentSource !== undefined) {
    addQuaScriptSource(index, currentSource, options.filePath)
  }

  for (const [filePath, content] of Object.entries(options.extraFiles || {})) {
    await addFileContent(index, filePath, content, options)
  }

  if (options.projectRoot) {
    const projectRoot = resolve(options.projectRoot)
    for (const filePath of listProjectFiles(projectRoot)) {
      if (options.filePath && resolve(filePath) === resolve(options.filePath) && currentSource !== undefined) {
        continue
      }
      const extension = extname(filePath)
      if (extension !== '.qs' && extension !== '.json' && extension !== '.qpk') {
        continue
      }
      if (!existsSync(filePath)) {
        continue
      }
      if (extension === '.qpk') {
        await addQpkFile(index, filePath, options)
      }
      else {
        await addFileContent(index, filePath, readFileSync(filePath, 'utf8'), options)
      }
    }
  }

  finalizeAssetStatuses(index, options)
  finalizePackageDependencyRisks(index)
  return index
}

export function buildProjectIndexSync(options: QuaProjectInspectorOptions = {}): StoryIndex {
  const index = createEmptyIndex()
  if (options.source !== undefined) {
    addQuaScriptSource(index, options.source, options.filePath)
  }
  for (const [filePath, content] of Object.entries(options.extraFiles || {})) {
    if (filePath.endsWith('.qs')) {
      addQuaScriptSource(index, content, filePath)
    }
    else if (filePath.endsWith('.json')) {
      addManifestJson(index, safeParseJson(content), filePath)
    }
  }
  if (options.projectRoot) {
    const projectRoot = resolve(options.projectRoot)
    for (const filePath of listProjectFiles(projectRoot)) {
      if (options.filePath && resolve(filePath) === resolve(options.filePath) && options.source !== undefined) {
        continue
      }
      const extension = extname(filePath)
      if (extension !== '.qs' && extension !== '.json') {
        continue
      }
      const content = readFileSync(filePath, 'utf8')
      if (extension === '.qs') {
        addQuaScriptSource(index, content, filePath)
      }
      else {
        addManifestJson(index, safeParseJson(content), filePath)
      }
    }
  }
  finalizeAssetStatuses(index, options)
  finalizePackageDependencyRisks(index)
  return index
}

export function createEmptyIndex(): StoryIndex {
  return {
    assetLineage: [],
    choices: [],
    edges: [],
    entries: [],
    hasProjectDeclarations: false,
    labels: [],
    nodes: [],
    packageDependencies: new Map(),
    packages: new Map(),
    packageIds: new Set(),
    risks: [],
    scenes: [],
    scriptModuleIds: new Set(),
  }
}

function addQuaScriptSource(index: StoryIndex, source: string, filePath?: string): void {
  const moduleId = moduleIdFromFilePath(filePath)
  const declaration = safeExtractStoryDeclaration(source, { moduleId })
  addStoryDeclaration(index, declaration, { filePath })
  attachQuaScriptDeclarationRanges(index, source, filePath)
  collectQuaScriptAssetLineage(index, source, filePath)
}

async function addFileContent(index: StoryIndex, filePath: string, content: string, _options: QuaProjectInspectorOptions): Promise<void> {
  if (filePath.endsWith('.qs')) {
    addQuaScriptSource(index, content, filePath)
  }
  else if (filePath.endsWith('.json')) {
    addManifestJson(index, safeParseJson(content), filePath)
  }
}

function addManifestJson(index: StoryIndex, value: unknown, filePath?: string): void {
  const runtimePackage = runtimePackageFromJson(value)
  if (!runtimePackage) {
    return
  }
  addRuntimePackageManifest(index, runtimePackage, filePath, asRecord(value))
}

async function addQpkFile(index: StoryIndex, filePath: string, options: QuaProjectInspectorOptions): Promise<void> {
  try {
    const summary = await readQpkSummary(filePath, options.qpkReader)
    const packageId = summary.manifest?.runtimePackage?.id || `locked:${filePath}`
    const risks: QuaInspectorRisk[] = summary.errors.map((message: string) => ({
      code: summary.locked ? 'qpk.locked' : 'qpk.manifest',
      filePath,
      message,
      packageId,
      severity: summary.locked ? 'warning' : 'error',
    }))
    if (summary.manifest?.runtimePackage) {
      addRuntimePackageManifest(index, summary.manifest.runtimePackage as unknown as Record<string, unknown>, filePath, summary.manifest as unknown as Record<string, unknown>, summary.assets)
    }
    else if (summary.locked) {
      const packageRecord: QuaRuntimePackageRef = {
        assetCount: summary.assets.length,
        assets: summary.assets.map((asset: { path: string, size: number }) => ({
          name: asset.path,
          path: asset.path,
          size: asset.size,
          sourcePath: filePath,
          type: asset.path.split('/')[1] || 'unknown',
        })),
        dependencies: [],
        id: packageId,
        locked: true,
        migrations: [],
        plugins: [],
        risks,
        scenes: [],
        scripts: [],
        sourcePath: filePath,
        storyGraphDeltas: [],
      }
      index.packages.set(packageId, packageRecord)
      index.risks.push(...risks)
    }
  }
  catch (error) {
    index.risks.push({
      code: 'qpk.read_failed',
      filePath,
      message: error instanceof Error ? error.message : String(error),
      severity: 'error',
    })
  }
}

function addRuntimePackageManifest(
  index: StoryIndex,
  runtimePackage: Record<string, unknown>,
  sourcePath?: string,
  manifest?: Record<string, unknown>,
  qpkAssets: Array<{ path: string, size: number }> = [],
): void {
  const packageId = stringValue(runtimePackage.id)
  if (!packageId) {
    return
  }

  const dependencies = arrayOfStrings(runtimePackage.dependencies)
  index.packageIds.add(packageId)
  index.packageDependencies.set(packageId, new Set(dependencies))

  const scripts = arrayOfRecords(runtimePackage.scripts)
  const storyGraphDeltas = arrayOfRecords(runtimePackage.storyGraphDeltas)
  const packageAssets = collectRuntimePackageAssets(packageId, sourcePath, manifest, qpkAssets)
  const packageRecord: QuaRuntimePackageRef = {
    assetCount: packageAssets.length,
    assets: packageAssets,
    dependencies,
    id: packageId,
    integrity: asRecord(runtimePackage.integrity),
    manifest: manifest as QuaRuntimePackageRef['manifest'],
    migrations: arrayOfRecords(runtimePackage.storeMigrations),
    plugins: arrayOfRecords(runtimePackage.plugins),
    risks: [],
    scenes: arrayOfRecords(runtimePackage.scenes),
    scripts,
    signature: asRecord(runtimePackage.signature),
    sourcePath,
    storyGraphDeltas,
    version: stringValue(runtimePackage.version),
  }
  index.packages.set(packageId, packageRecord)

  for (const script of scripts) {
    const scriptId = stringValue(script.id)
    if (scriptId) {
      index.scriptModuleIds.add(scriptId)
    }
    const scriptMetadata = asRecord(script.metadata)
    addStoryDeclaration(index, storyDeclarationFromUnknown(scriptMetadata?.story, packageId, scriptId), { filePath: sourcePath })
  }

  for (const delta of storyGraphDeltas) {
    addStoryGraphDelta(index, delta, packageId, sourcePath)
  }
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
    index.scenes.push({ id: scene.id, sourceLocation: { filePath: meta.filePath } })
  }
  for (const entry of declaration.entries || []) {
    const entryPoint = asRecord(entry.point) || {}
    index.entries.push({
      id: entry.id,
      metadata: asRecord(entry.metadata),
      packageId: stringValue(entryPoint.contentPackageId) || declaration.runtimePackageId,
      point: entryPoint,
      sceneId: stringValue(entryPoint.sceneId),
      sourceLocation: { filePath: meta.filePath },
    })
  }
  for (const node of declaration.nodes) {
    index.nodes.push({
      graphId: stringValue(node.point.storyId),
      id: node.id,
      labelId: stringValue(node.point.labelId),
      moduleId: stringValue(node.point.scriptModuleId) || declaration.moduleId,
      packageId: stringValue(node.point.contentPackageId) || declaration.runtimePackageId,
      point: asRecord(node.point) || {},
      sceneId: stringValue(node.point.sceneId),
      sourceLocation: { filePath: meta.filePath },
      summary: node.summary,
      title: node.title,
    })
  }
  for (const label of declaration.labels) {
    index.labels.push({
      graphId: stringValue(label.point.storyId),
      id: label.id,
      nodeId: stringValue(label.point.nodeId),
      packageId: stringValue(label.point.contentPackageId) || declaration.runtimePackageId,
      sceneId: stringValue(label.point.sceneId),
      sourceLocation: { filePath: meta.filePath },
    })
  }
  for (const choice of declaration.choices || []) {
    const normalizedTarget = choice.target ? normalizeChoiceTarget(choice.target) : undefined
    index.choices.push({
      condition: choice.condition,
      id: choice.id,
      point: asRecord(choice.point),
      source: choice.source,
      sourceLocation: { filePath: meta.filePath },
      target: normalizedTarget,
      text: choice.text,
    })
    index.assetLineage.push(...collectAssetRefs([choice], {
      sourceId: choice.id,
      sourceKind: 'choice',
      sourceLocation: { filePath: meta.filePath },
    }))
  }
  for (const edge of declaration.edges || []) {
    index.edges.push({
      condition: edge.condition,
      from: edge.from,
      id: edge.id,
      kind: edge.kind,
      packageId: declaration.runtimePackageId,
      sourceLocation: { filePath: meta.filePath },
      to: edge.to,
    })
  }
}

function addStoryGraphDelta(index: StoryIndex, delta: Record<string, unknown>, packageId: string, sourcePath?: string): void {
  const graphId = stringValue(delta.graphId)
  for (const node of arrayOfRecords(delta.nodes)) {
    const point = asRecord(node.point) || {}
    const nodeId = stringValue(node.id) || stringValue(point.nodeId)
    if (!nodeId) {
      continue
    }
    index.nodes.push({
      graphId,
      id: nodeId,
      labelId: stringValue(point.labelId),
      moduleId: stringValue(point.scriptModuleId),
      packageId: stringValue(point.contentPackageId) || packageId,
      point,
      sceneId: stringValue(point.sceneId),
      sourceLocation: { filePath: sourcePath },
      summary: stringValue(node.summary),
      title: stringValue(node.title),
    })
  }
  for (const edge of arrayOfRecords(delta.edges)) {
    const id = stringValue(edge.id)
    const from = stringValue(edge.from)
    const to = stringValue(edge.to)
    if (!id || !from || !to) {
      continue
    }
    index.edges.push({
      condition: stringValue(edge.condition),
      from,
      id,
      kind: stringValue(edge.kind) || 'choice',
      packageId,
      sourceLocation: { filePath: sourcePath },
      to,
    })
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
      const scene = findLast(index.scenes, item => item.sourceLocation?.filePath === filePath && item.id === match[3] && !item.sourceLocation?.range)
      if (scene) {
        scene.sourceLocation = { filePath, range }
      }
    }
    else if (match[1] === 'Entry') {
      const entry = findLast(index.entries, item => item.sourceLocation?.filePath === filePath && item.id === match[3] && !item.sourceLocation?.range)
      if (entry) {
        entry.sourceLocation = { filePath, range }
      }
    }
    else if (match[1] === 'Node') {
      const node = findLast(index.nodes, item => item.sourceLocation?.filePath === filePath && item.id === match[3] && !item.sourceLocation?.range)
      if (node) {
        node.sourceLocation = { filePath, range }
      }
    }
    else {
      const label = findLast(index.labels, item => item.sourceLocation?.filePath === filePath && item.id === match[3] && !item.sourceLocation?.range)
      if (label) {
        label.sourceLocation = { filePath, range }
      }
    }
  })
}

function collectQuaScriptAssetLineage(index: StoryIndex, source: string, filePath?: string): void {
  const document = parseQuaScriptDocument(source)
  if (document.diagnostics.some(diagnostic => diagnostic.severity === 'error')) {
    return
  }
  const parser = new QuaScriptParser()
  const parsed = parser.parse(document.dslBody)
  let currentNodeId: string | undefined
  for (const step of parsed.steps) {
    const decorators = step.type === 'dialogue'
      ? (step.content as QuaScriptDialogue).decorators
      : step.type === 'action'
        ? ((step.content as { decorators?: QuaScriptDialogue['decorators'] }).decorators || [])
        : []
    for (const decorator of decorators) {
      if (decorator.name === 'Node' && typeof decorator.args[0] === 'string') {
        currentNodeId = decorator.args[0]
      }
      index.assetLineage.push(...collectAssetRefs(decorator.args, {
        sourceId: currentNodeId,
        sourceKind: `decorator:${decorator.name}`,
        sourceLocation: {
          filePath,
          range: decorator.range,
        },
      }))
    }

    if (step.type === 'choice') {
      const choice = step.content as QuaScriptChoice
      for (const option of choice.options) {
        index.assetLineage.push(...collectAssetRefs([option.options], {
          sourceId: option.id,
          sourceKind: 'choice',
          sourceLocation: {
            filePath,
            range: option.range,
          },
        }))
      }
    }
  }
}

function collectRuntimePackageAssets(
  packageId: string,
  sourcePath: string | undefined,
  manifest: Record<string, unknown> | undefined,
  qpkAssets: Array<{ path: string, size: number }>,
): QuaRuntimePackageAssetRef[] {
  const refs: QuaRuntimePackageAssetRef[] = []
  for (const asset of qpkAssets) {
    refs.push({
      name: asset.path.split('/').pop() || asset.path,
      packageId,
      path: asset.path,
      size: asset.size,
      sourcePath,
      type: asset.path.split('/')[1] || 'unknown',
    })
  }
  const manifestAssets = asRecord(manifest?.assets)
  for (const [type, group] of Object.entries(manifestAssets || {})) {
    for (const [name, asset] of Object.entries(asRecord(group) || {})) {
      const record = asRecord(asset) || {}
      refs.push({
        hash: stringValue(record.hash),
        name,
        packageId,
        path: stringValue(record.path) || stringValue(record.relativePath),
        size: typeof record.size === 'number' ? record.size : undefined,
        sourcePath,
        type,
      })
    }
  }
  return uniqueAssets(refs)
}

function finalizeAssetStatuses(index: StoryIndex, options: QuaProjectInspectorOptions): void {
  const packageAssetKeys = new Set<string>()
  for (const packageRecord of index.packages.values()) {
    for (const asset of packageRecord.assets) {
      packageAssetKeys.add(assetKey(asset.type, asset.name, asset.packageId || packageRecord.id))
      if (asset.path) {
        packageAssetKeys.add(assetKey(asset.type, asset.path, asset.packageId || packageRecord.id))
      }
    }
  }

  index.assetLineage = index.assetLineage.map((asset) => {
    const packageKey = asset.packageId ? assetKey(asset.type, asset.name, asset.packageId) : undefined
    const present = packageKey && packageAssetKeys.has(packageKey)
      ? true
      : storyAssetExists({ filePath: asset.sourceLocation?.filePath || options.filePath, projectRoot: options.projectRoot }, asset.type, asset.name)
    return {
      ...asset,
      status: present ? 'present' : 'missing',
    }
  })

  for (const asset of index.assetLineage) {
    if (asset.status === 'missing') {
      index.risks.push({
        assetName: asset.name,
        assetType: asset.type,
        code: 'asset.missing',
        filePath: asset.sourceLocation?.filePath,
        message: `Story asset "${asset.name}" was not found under project assets.`,
        packageId: asset.packageId,
        range: asset.sourceLocation?.range,
        severity: 'error',
        targetId: asset.sourceId,
      })
    }
  }
}

function finalizePackageDependencyRisks(index: StoryIndex): void {
  for (const packageRecord of index.packages.values()) {
    for (const dependency of packageRecord.dependencies) {
      if (index.packageIds.has(dependency)) {
        continue
      }
      const risk: QuaInspectorRisk = {
        code: 'package.dependency_missing',
        filePath: packageRecord.sourcePath,
        message: `Runtime package "${packageRecord.id}" depends on missing package "${dependency}".`,
        packageId: packageRecord.id,
        severity: 'error',
      }
      packageRecord.risks.push(risk)
      index.risks.push(risk)
    }
  }
}

function safeExtractStoryDeclaration(source: string, options: { moduleId?: string, runtimePackageId?: string } = {}): StoryDeclarationWithEntries | undefined {
  try {
    return extractQuaScriptStoryDeclaration(source, options) as StoryDeclarationWithEntries
  }
  catch {
    return undefined
  }
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

function uniqueAssets(assets: QuaRuntimePackageAssetRef[]): QuaRuntimePackageAssetRef[] {
  const seen = new Set<string>()
  return assets.filter((asset) => {
    const key = `${asset.packageId || ''}:${asset.type}:${asset.path || asset.name}`
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}

function assetKey(type: string, name: string, packageId?: string): string {
  return `${packageId || ''}:${type}:${name}`
}
