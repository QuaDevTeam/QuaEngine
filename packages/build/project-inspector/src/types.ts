import type {
  ParsedQuaScript,
  QuaScriptDiagnostic,
  SourceRange,
  StoryDeclaration,
} from '@quajs/script-compiler'
import type { BundleManifest } from '@quajs/quack'
import type { QpkReaderOptions } from '@quajs/quack/qpk-reader'

export type { SourceRange }

export type QuaInspectorRiskSeverity = 'error' | 'info' | 'warning'

export interface QuaInspectorRisk {
  assetName?: string
  assetType?: string
  code: string
  filePath?: string
  message: string
  packageId?: string
  range?: SourceRange
  severity: QuaInspectorRiskSeverity
  targetId?: string
}

export interface QuaProjectInspectorOptions {
  extraFiles?: Record<string, string>
  filePath?: string
  projectRoot?: string
  qpkReader?: QpkReaderOptions
  source?: string
}

export interface QuaSourceLocation {
  filePath?: string
  range?: SourceRange
}

export interface StoryTargetData {
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

export interface QuaStoryChoiceRef {
  condition?: string
  id: string
  point?: Record<string, unknown>
  source?: string
  sourceLocation?: QuaSourceLocation
  target?: StoryTargetData
  text: string
}

export interface QuaStoryEdgeRef {
  condition?: string
  from: string
  id: string
  kind: string
  packageId?: string
  sourceLocation?: QuaSourceLocation
  to: string
}

export interface QuaStoryEntryRef {
  id: string
  metadata?: Record<string, unknown>
  packageId?: string
  point?: Record<string, unknown>
  sceneId?: string
  sourceLocation?: QuaSourceLocation
}

export interface QuaStoryLabelRef {
  graphId?: string
  id: string
  nodeId?: string
  packageId?: string
  sceneId?: string
  sourceLocation?: QuaSourceLocation
}

export interface QuaStoryNodeRef {
  chapterSelectable?: boolean
  chapterSelectOrder?: number
  graphId?: string
  id: string
  labelId?: string
  moduleId?: string
  packageId?: string
  point?: Record<string, unknown>
  sceneId?: string
  sourceLocation?: QuaSourceLocation
  title?: string
  summary?: string
}

export interface QuaStorySceneRef {
  id: string
  sourceLocation?: QuaSourceLocation
}

export interface QuaStoryPackageRef {
  dependencies: string[]
  id: string
  locked?: boolean
  sourcePath?: string
  version?: string
}

export interface QuaStoryTreeSnapshot {
  choices: QuaStoryChoiceRef[]
  edges: QuaStoryEdgeRef[]
  entries: QuaStoryEntryRef[]
  labels: QuaStoryLabelRef[]
  nodes: QuaStoryNodeRef[]
  packages: QuaStoryPackageRef[]
  scenes: QuaStorySceneRef[]
}

export interface QuaRuntimePackageAssetRef {
  hash?: string
  name: string
  packageId?: string
  path?: string
  size?: number
  sourcePath?: string
  type: string
}

export interface QuaRuntimePackageRef {
  assetCount: number
  assets: QuaRuntimePackageAssetRef[]
  dependencies: string[]
  integrity?: Record<string, unknown>
  locked?: boolean
  manifest?: BundleManifest
  migrations: Array<Record<string, unknown>>
  plugins: Array<Record<string, unknown>>
  risks: QuaInspectorRisk[]
  scenes: Array<Record<string, unknown>>
  scripts: Array<Record<string, unknown>>
  signature?: Record<string, unknown>
  sourcePath?: string
  storyGraphDeltas: Array<Record<string, unknown>>
  version?: string
  id: string
}

export interface QuaRuntimePackageGraphSnapshot {
  packages: QuaRuntimePackageRef[]
  risks: QuaInspectorRisk[]
}

export interface QuaInspectorRiskCounts {
  error: number
  info: number
  warning: number
}

export interface QuaPackageHealthPackageRef {
  assetCount: number
  dependencyCount: number
  hasIntegrity: boolean
  hasSignature: boolean
  id: string
  locked?: boolean
  migrationCount: number
  missingAssetCount: number
  missingDependencies: string[]
  pluginCount: number
  referencedAssetCount: number
  riskCounts: QuaInspectorRiskCounts
  risks: QuaInspectorRisk[]
  sceneCount: number
  scriptCount: number
  sourcePath?: string
  storyGraphDeltaCount: number
  storyPointCount: number
  version?: string
}

export interface QuaPackageHealthSummary {
  assetCount: number
  integrityPackageCount: number
  lockedPackageCount: number
  missingAssetCount: number
  missingDependencyCount: number
  packageCount: number
  referencedAssetCount: number
  riskCounts: QuaInspectorRiskCounts
  signaturePackageCount: number
  storyPointCount: number
}

export interface QuaPackageHealthReportSnapshot {
  packages: QuaPackageHealthPackageRef[]
  risks: QuaInspectorRisk[]
  summary: QuaPackageHealthSummary
}

export interface QuaStoryPointRef {
  id?: string
  nodeId?: string
  labelId?: string
  entryId?: string
  packageId?: string
  sceneId?: string
  sourcePath?: string
}

export type QuaStoryPointInspectionKind = 'entry' | 'label' | 'node'

export interface QuaStoryPointInspection {
  assets: QuaAssetLineageRef[]
  entry?: QuaStoryEntryRef
  edges: {
    inbound: QuaStoryEdgeRef[]
    outbound: QuaStoryEdgeRef[]
  }
  kind?: QuaStoryPointInspectionKind
  label?: QuaStoryLabelRef
  node?: QuaStoryNodeRef
  packageId?: string
  point?: Record<string, unknown>
  requiredRuntimePackages: string[]
  risks: QuaInspectorRisk[]
  sourceLocation?: QuaSourceLocation
}

export interface QuaAssetLineageRef {
  field?: string
  name: string
  packageId?: string
  sourceId?: string
  sourceKind: string
  sourceLocation?: QuaSourceLocation
  status: 'missing' | 'present' | 'unknown'
  type: string
}

export interface QuaAssetLineageSnapshot {
  assets: QuaAssetLineageRef[]
  risks: QuaInspectorRisk[]
}

export interface QuaProjectInspectorSnapshot {
  assetLineage: QuaAssetLineageSnapshot
  generatedAt: number
  packageHealthReport: QuaPackageHealthReportSnapshot
  packageGraph: QuaRuntimePackageGraphSnapshot
  risks: QuaInspectorRisk[]
  storyTree: QuaStoryTreeSnapshot
}

export type StoryDeclarationWithEntries = StoryDeclaration & {
  entries?: Array<{ id: string, metadata?: Record<string, unknown>, point: Record<string, unknown> }>
}

export interface StoryIndex {
  choices: QuaStoryChoiceRef[]
  edges: QuaStoryEdgeRef[]
  entries: QuaStoryEntryRef[]
  hasProjectDeclarations: boolean
  labels: QuaStoryLabelRef[]
  nodes: QuaStoryNodeRef[]
  packageDependencies: Map<string, Set<string>>
  packages: Map<string, QuaRuntimePackageRef>
  packageIds: Set<string>
  risks: QuaInspectorRisk[]
  scenes: QuaStorySceneRef[]
  scriptModuleIds: Set<string>
  assetLineage: QuaAssetLineageRef[]
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

export interface StoryDiagnosticInput {
  parsed: ParsedQuaScript
  source: string
}

export type StoryDiagnostic = QuaScriptDiagnostic
