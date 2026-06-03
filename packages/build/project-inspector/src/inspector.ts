import type {
  QuaAssetLineageSnapshot,
  QuaInspectorRisk,
  QuaInspectorRiskCounts,
  QuaPackageHealthReportSnapshot,
  QuaProjectInspectorOptions,
  QuaProjectInspectorSnapshot,
  QuaRuntimePackageGraphSnapshot,
  QuaStoryPointInspection,
  QuaStoryPointRef,
  QuaStoryTreeSnapshot,
  SourceRange,
  StoryIndex,
} from './types'
import { buildProjectIndex } from './indexer'
import { arrayOfStrings, asRecord } from './utils'

export interface QuaProjectInspector {
  getAssetLineage: (ref?: { name?: string, packageId?: string, type?: string }) => QuaAssetLineageSnapshot
  getPackageHealthReport: () => QuaPackageHealthReportSnapshot
  getRuntimePackageGraph: () => QuaRuntimePackageGraphSnapshot
  getSnapshot: () => QuaProjectInspectorSnapshot
  getStoryTree: () => QuaStoryTreeSnapshot
  inspectStoryPoint: (ref: QuaStoryPointRef) => QuaStoryPointInspection
  refresh: (options?: Partial<QuaProjectInspectorOptions>) => Promise<QuaProjectInspectorSnapshot>
}

export function createQuaProjectInspector(options: QuaProjectInspectorOptions = {}): QuaProjectInspector {
  return new QuaProjectInspectorImpl(options)
}

class QuaProjectInspectorImpl implements QuaProjectInspector {
  private index: StoryIndex | undefined
  private options: QuaProjectInspectorOptions
  private snapshot: QuaProjectInspectorSnapshot

  constructor(options: QuaProjectInspectorOptions) {
    this.options = options
    this.snapshot = emptySnapshot()
  }

  getAssetLineage(ref: { name?: string, packageId?: string, type?: string } = {}): QuaAssetLineageSnapshot {
    const snapshot = this.getSnapshot().assetLineage
    const matchesRef = (item: { assetName?: string, assetType?: string, name?: string, packageId?: string, type?: string }) =>
      (!ref.name || item.name === ref.name || item.assetName === ref.name)
      && (!ref.type || item.type === ref.type || item.assetType === ref.type)
      && (!ref.packageId || item.packageId === ref.packageId)
    return {
      assets: snapshot.assets.filter(matchesRef),
      risks: snapshot.risks.filter(matchesRef),
    }
  }

  getRuntimePackageGraph(): QuaRuntimePackageGraphSnapshot {
    return this.getSnapshot().packageGraph
  }

  getPackageHealthReport(): QuaPackageHealthReportSnapshot {
    return this.getSnapshot().packageHealthReport
  }

  getSnapshot(): QuaProjectInspectorSnapshot {
    return this.snapshot
  }

  getStoryTree(): QuaStoryTreeSnapshot {
    return this.getSnapshot().storyTree
  }

  inspectStoryPoint(ref: QuaStoryPointRef): QuaStoryPointInspection {
    const index = this.index
    if (!index) {
      return emptyInspection()
    }

    const node = ref.nodeId || (!ref.entryId && !ref.labelId) ? findInspectionNode(index, ref) : undefined
    const entry = node ? undefined : ref.entryId || (!ref.nodeId && !ref.labelId) ? findInspectionEntry(index, ref) : undefined
    const label = node || entry ? undefined : ref.labelId || (!ref.nodeId && !ref.entryId) ? findInspectionLabel(index, ref) : undefined
    const linkedNode = node || labelToNode(index, label)
    const kind = node ? 'node' : entry ? 'entry' : label ? 'label' : undefined
    const targetId = linkedNode?.id || entry?.id || label?.nodeId || label?.id || ref.id || ref.nodeId || ref.labelId || ref.entryId
    const inbound = targetId ? index.edges.filter(edge => edge.to === targetId) : []
    const outbound = targetId ? index.edges.filter(edge => edge.from === targetId) : []
    const point = linkedNode?.point || entry?.point
    const packageId = linkedNode?.packageId || entry?.packageId || label?.packageId || ref.packageId
    const requiredRuntimePackages = mergeStrings(
      packageId ? [packageId] : [],
      arrayOfStrings(asRecord(point)?.requiredRuntimePackages),
      arrayOfStrings(asRecord(asRecord(point)?.metadata)?.requiredRuntimePackages),
    )
    const assets = index.assetLineage.filter(asset =>
      !targetId
      || asset.sourceId === targetId
      || asset.sourceId === label?.id
      || asset.sourceId === entry?.id
      || asset.packageId === packageId,
    )
    const risks = index.risks.filter(risk =>
      (packageId ? risk.packageId === packageId : false)
      || (targetId ? risk.targetId === targetId : false),
    )

    return {
      assets,
      entry,
      edges: { inbound, outbound },
      kind,
      label,
      node: linkedNode,
      packageId,
      point,
      requiredRuntimePackages,
      risks,
      sourceLocation: inspectionSourceLocation(kind, linkedNode, entry, label),
    }
  }

  async refresh(options: Partial<QuaProjectInspectorOptions> = {}): Promise<QuaProjectInspectorSnapshot> {
    this.options = {
      ...this.options,
      ...options,
    }
    this.index = await buildProjectIndex(this.options)
    this.snapshot = createSnapshot(this.index)
    return this.snapshot
  }
}

function createSnapshot(index: StoryIndex): QuaProjectInspectorSnapshot {
  const packageGraph = {
    packages: Array.from(index.packages.values()).sort((left, right) => left.id.localeCompare(right.id)),
    risks: index.risks.filter(risk => risk.code.startsWith('qpk') || risk.code.startsWith('package')),
  }
  const assetLineage = {
    assets: index.assetLineage,
    risks: index.risks.filter(risk => risk.code.startsWith('asset')),
  }
  const packageHealthReport = createPackageHealthReport(index)
  return {
    assetLineage,
    generatedAt: Date.now(),
    packageHealthReport,
    packageGraph,
    risks: index.risks,
    storyTree: {
      choices: index.choices,
      edges: index.edges,
      entries: index.entries,
      labels: index.labels,
      nodes: index.nodes,
      packages: Array.from(index.packages.values()).map(packageRecord => ({
        dependencies: packageRecord.dependencies,
        id: packageRecord.id,
        locked: packageRecord.locked,
        sourcePath: packageRecord.sourcePath,
        version: packageRecord.version,
      })),
      scenes: index.scenes,
    },
  }
}

function emptySnapshot(): QuaProjectInspectorSnapshot {
  return {
    assetLineage: { assets: [], risks: [] },
    generatedAt: Date.now(),
    packageHealthReport: {
      packages: [],
      risks: [],
      summary: {
        assetCount: 0,
        integrityPackageCount: 0,
        lockedPackageCount: 0,
        missingAssetCount: 0,
        missingDependencyCount: 0,
        packageCount: 0,
        referencedAssetCount: 0,
        riskCounts: emptyRiskCounts(),
        signaturePackageCount: 0,
        storyPointCount: 0,
      },
    },
    packageGraph: { packages: [], risks: [] },
    risks: [],
    storyTree: {
      choices: [],
      edges: [],
      entries: [],
      labels: [],
      nodes: [],
      packages: [],
      scenes: [],
    },
  }
}

function mergeStrings(...groups: Array<readonly string[] | undefined>): string[] {
  return [...new Set(groups.flatMap(group => group || []))]
}

function emptyInspection(): QuaStoryPointInspection {
  return {
    assets: [],
    edges: { inbound: [], outbound: [] },
    requiredRuntimePackages: [],
    risks: [],
  }
}

function findInspectionNode(index: StoryIndex, ref: QuaStoryPointRef): StoryIndex['nodes'][number] | undefined {
  const id = ref.nodeId || ref.id
  if (!id && !ref.labelId) {
    return undefined
  }
  return index.nodes.find(item =>
    (!id || item.id === id)
    && (!ref.labelId || item.labelId === ref.labelId)
    && matchesStoryPointScope(item, ref),
  )
}

function findInspectionEntry(index: StoryIndex, ref: QuaStoryPointRef): StoryIndex['entries'][number] | undefined {
  const id = ref.entryId || (!ref.nodeId && !ref.labelId ? ref.id : undefined)
  if (!id) {
    return undefined
  }
  return index.entries.find(item =>
    item.id === id
    && matchesStoryPointScope(item, ref),
  )
}

function findInspectionLabel(index: StoryIndex, ref: QuaStoryPointRef): StoryIndex['labels'][number] | undefined {
  const id = ref.labelId || (!ref.nodeId && !ref.entryId ? ref.id : undefined)
  if (!id) {
    return undefined
  }
  return index.labels.find(item =>
    item.id === id
    && matchesStoryPointScope(item, ref),
  )
}

function labelToNode(index: StoryIndex, label: StoryIndex['labels'][number] | undefined): StoryIndex['nodes'][number] | undefined {
  if (!label?.nodeId) {
    return undefined
  }
  return index.nodes.find(node =>
    node.id === label.nodeId
    && (!label.packageId || node.packageId === label.packageId)
    && (!label.sceneId || node.sceneId === label.sceneId),
  )
}

function matchesStoryPointScope(
  item: { packageId?: string, sceneId?: string, sourceLocation?: { filePath?: string, range?: SourceRange } },
  ref: QuaStoryPointRef,
): boolean {
  return (!ref.packageId || item.packageId === ref.packageId)
    && (!ref.sceneId || item.sceneId === ref.sceneId)
    && (!ref.sourcePath || item.sourceLocation?.filePath === ref.sourcePath)
}

function inspectionSourceLocation(
  kind: QuaStoryPointInspection['kind'],
  node: StoryIndex['nodes'][number] | undefined,
  entry: StoryIndex['entries'][number] | undefined,
  label: StoryIndex['labels'][number] | undefined,
): QuaStoryPointInspection['sourceLocation'] {
  if (kind === 'entry') {
    return entry?.sourceLocation
  }
  if (kind === 'label') {
    return label?.sourceLocation || node?.sourceLocation
  }
  return node?.sourceLocation || entry?.sourceLocation || label?.sourceLocation
}

function createPackageHealthReport(index: StoryIndex): QuaPackageHealthReportSnapshot {
  const packages = Array.from(index.packages.values())
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((packageRecord) => {
      const risks = uniqueRisks([
        ...packageRecord.risks,
        ...index.risks.filter(risk => risk.packageId === packageRecord.id),
      ])
      const missingDependencies = packageRecord.dependencies.filter(dependency => !index.packageIds.has(dependency))
      const referencedAssets = index.assetLineage.filter(asset => asset.packageId === packageRecord.id)
      const missingAssets = referencedAssets.filter(asset => asset.status === 'missing')
      const storyPointCount = index.nodes.filter(node => node.packageId === packageRecord.id).length
        + index.entries.filter(entry => entry.packageId === packageRecord.id).length
        + index.labels.filter(label => label.packageId === packageRecord.id).length

      return {
        assetCount: packageRecord.assetCount,
        dependencyCount: packageRecord.dependencies.length,
        hasIntegrity: Boolean(packageRecord.integrity),
        hasSignature: Boolean(packageRecord.signature),
        id: packageRecord.id,
        locked: packageRecord.locked,
        migrationCount: packageRecord.migrations.length,
        missingAssetCount: missingAssets.length,
        missingDependencies,
        pluginCount: packageRecord.plugins.length,
        referencedAssetCount: referencedAssets.length,
        riskCounts: countRisks(risks),
        risks,
        sceneCount: packageRecord.scenes.length,
        scriptCount: packageRecord.scripts.length,
        sourcePath: packageRecord.sourcePath,
        storyGraphDeltaCount: packageRecord.storyGraphDeltas.length,
        storyPointCount,
        version: packageRecord.version,
      }
    })

  const reportRisks = uniqueRisks([
    ...index.risks.filter(risk =>
      risk.code.startsWith('package')
      || risk.code.startsWith('qpk')
      || risk.code.startsWith('asset'),
    ),
    ...packages.flatMap(packageRecord => packageRecord.risks),
  ])

  return {
    packages,
    risks: reportRisks,
    summary: {
      assetCount: packages.reduce((total, packageRecord) => total + packageRecord.assetCount, 0),
      integrityPackageCount: packages.filter(packageRecord => packageRecord.hasIntegrity).length,
      lockedPackageCount: packages.filter(packageRecord => packageRecord.locked).length,
      missingAssetCount: packages.reduce((total, packageRecord) => total + packageRecord.missingAssetCount, 0),
      missingDependencyCount: packages.reduce((total, packageRecord) => total + packageRecord.missingDependencies.length, 0),
      packageCount: packages.length,
      referencedAssetCount: packages.reduce((total, packageRecord) => total + packageRecord.referencedAssetCount, 0),
      riskCounts: countRisks(reportRisks),
      signaturePackageCount: packages.filter(packageRecord => packageRecord.hasSignature).length,
      storyPointCount: packages.reduce((total, packageRecord) => total + packageRecord.storyPointCount, 0),
    },
  }
}

function countRisks(risks: readonly QuaInspectorRisk[]): QuaInspectorRiskCounts {
  const counts = emptyRiskCounts()
  for (const risk of risks) {
    counts[risk.severity] += 1
  }
  return counts
}

function emptyRiskCounts(): QuaInspectorRiskCounts {
  return {
    error: 0,
    info: 0,
    warning: 0,
  }
}

function uniqueRisks(risks: QuaInspectorRisk[]): QuaInspectorRisk[] {
  const seen = new Set<string>()
  return risks.filter((risk) => {
    const key = [
      risk.code,
      risk.packageId || '',
      risk.targetId || '',
      risk.filePath || '',
      risk.range?.start.line ?? '',
      risk.range?.start.column ?? '',
      risk.message,
    ].join('\0')
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
