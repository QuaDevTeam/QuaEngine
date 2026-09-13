import type {
  NativeQuiImport,
  NativeUiDiagnostic,
  NativeUiDocumentKind,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'
import type { NativeUiProjectAssetReference } from './asset-references'

export interface NativeUiProjectFile {
  filePath?: string
  languageId?: string
  source: string
  uri: string
  version?: number
}

export interface NativeUiProjectIndexOptions {
  language?: NativeUiLanguageOptions
}

export interface NativeUiProjectIndexChange extends Partial<NativeUiProjectFile> {
  deleted?: boolean
  uri: string
}

export interface NativeUiProjectImport {
  kind: NativeQuiImport['kind']
  path: string
  pathRange: NativeUiRange
  range: NativeUiRange
}

export interface NativeUiProjectComponentReference {
  name: string
  range: NativeUiRange
  source: 'qss-selector' | 'qui-node'
}

export interface NativeUiProjectClassReference {
  name: string
  range: NativeUiRange
  source: 'qss-selector' | 'qui-node'
}

export interface NativeUiProjectIdReference {
  name: string
  range: NativeUiRange
  source: 'qss-selector' | 'qui-node'
}

export interface NativeUiProjectIndexedDocument {
  assetReferences: NativeUiProjectAssetReference[]
  classReferences: NativeUiProjectClassReference[]
  classes: string[]
  componentImports: string[]
  componentReferences: NativeUiProjectComponentReference[]
  components: string[]
  diagnostics: NativeUiDiagnostic[]
  documentBytes: number
  filePath?: string
  idReferences: NativeUiProjectIdReference[]
  ids: string[]
  imports: NativeUiProjectImport[]
  kind: NativeUiDocumentKind
  qssDeclarations: number
  qssRules: number
  styleImports: string[]
  tokenImports: string[]
  uri: string
  version?: number
}

export interface NativeUiProjectIndexSummary {
  assetReferences: number
  classes: number
  componentImports: number
  components: number
  diagnostics: number
  documentBytes: number
  documentCount: number
  qssDeclarations: number
  qssDocumentCount: number
  qssRules: number
  ids: number
  quiDocumentCount: number
  skippedDocumentCount: number
  styleImports: number
  tokenImports: number
}

export interface NativeUiProjectDocumentLink {
  candidateUri?: string
  kind: NativeQuiImport['kind'] | 'asset'
  path: string
  pathRange: NativeUiRange
  resolved: boolean
  sourceUri: string
  targetUri?: string
}

export type NativeUiProjectReferenceKind = 'class' | 'component' | 'id'

export interface NativeUiProjectReference {
  filePath?: string
  kind: NativeUiProjectReferenceKind
  name: string
  range: NativeUiRange
  source: 'qss-selector' | 'qui-node'
  uri: string
}

export interface NativeUiProjectIndex {
  documentLinks: NativeUiProjectDocumentLink[]
  documents: NativeUiProjectIndexedDocument[]
  references: NativeUiProjectReference[]
  skippedDocuments: string[]
  summary: NativeUiProjectIndexSummary
}
