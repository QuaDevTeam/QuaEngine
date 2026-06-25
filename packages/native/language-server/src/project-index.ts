import type {
  NativeQssDocument,
  NativeQuiDocument,
  NativeUiDiagnostic,
  NativeUiDocument,
  NativeUiDocumentKind,
  NativeUiLanguageOptions,
} from '@quajs/native-ui-compiler'
import { fileURLToPath } from 'node:url'
import {
  analyzeNativeUiDocument,
  detectNativeUiDocumentKind,
} from '@quajs/native-ui-compiler'

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

export interface NativeUiProjectIndexedDocument {
  classes: string[]
  componentImports: string[]
  components: string[]
  diagnostics: NativeUiDiagnostic[]
  documentBytes: number
  filePath?: string
  kind: NativeUiDocumentKind
  qssDeclarations: number
  qssRules: number
  styleImports: string[]
  tokenImports: string[]
  uri: string
  version?: number
}

export interface NativeUiProjectIndexSummary {
  classes: number
  componentImports: number
  components: number
  diagnostics: number
  documentBytes: number
  documentCount: number
  qssDeclarations: number
  qssDocumentCount: number
  qssRules: number
  quiDocumentCount: number
  skippedDocumentCount: number
  styleImports: number
  tokenImports: number
}

export interface NativeUiProjectIndex {
  documents: NativeUiProjectIndexedDocument[]
  skippedDocuments: string[]
  summary: NativeUiProjectIndexSummary
}

export function buildNativeUiProjectIndex(
  files: readonly NativeUiProjectFile[],
  options: NativeUiProjectIndexOptions = {},
): NativeUiProjectIndex {
  return createProjectIndex(files.map(file => indexProjectFile(file, options)))
}

export function updateNativeUiProjectIndex(
  previous: NativeUiProjectIndex,
  changes: readonly NativeUiProjectIndexChange[],
  options: NativeUiProjectIndexOptions = {},
): NativeUiProjectIndex {
  const documents = new Map(previous.documents.map(document => [document.uri, document]))
  const skippedDocuments = new Set(previous.skippedDocuments)

  for (const change of changes) {
    if (change.deleted) {
      documents.delete(change.uri)
      skippedDocuments.delete(change.uri)
      continue
    }
    if (change.source === undefined)
      continue

    documents.delete(change.uri)
    skippedDocuments.delete(change.uri)

    const indexed = indexProjectFile({
      filePath: change.filePath,
      languageId: change.languageId,
      source: change.source,
      uri: change.uri,
      version: change.version,
    }, options)

    if (indexed.document)
      documents.set(indexed.document.uri, indexed.document)
    else
      skippedDocuments.add(indexed.skippedUri)
  }

  return summarizeProjectIndex(
    Array.from(documents.values()),
    Array.from(skippedDocuments),
  )
}

function indexProjectFile(
  file: NativeUiProjectFile,
  options: NativeUiProjectIndexOptions,
): { document: NativeUiProjectIndexedDocument, skippedUri?: never } | { document?: never, skippedUri: string } {
  const languageOptions = languageOptionsForFile(file, options)
  const kind = detectNativeUiDocumentKind(languageOptions)
  if (!kind)
    return { skippedUri: file.uri }

  const document = analyzeNativeUiDocument(file.source, languageOptions)
  return {
    document: indexedDocumentFromNativeDocument(file, document),
  }
}

function indexedDocumentFromNativeDocument(
  file: NativeUiProjectFile,
  document: NativeUiDocument,
): NativeUiProjectIndexedDocument {
  const qui = document.kind === 'qui' ? document : undefined
  const qss = document.kind === 'qss' ? document : undefined

  return {
    classes: qui ? uniqueSorted(qui.nodes.flatMap(node => node.classes)) : [],
    componentImports: qui ? importPathsByKind(qui, 'component') : [],
    components: qui ? uniqueSorted(qui.nodes.map(node => node.name)) : [],
    diagnostics: document.diagnostics,
    documentBytes: new TextEncoder().encode(document.source).byteLength,
    filePath: file.filePath,
    kind: document.kind,
    qssDeclarations: qss ? countQssDeclarations(qss) : 0,
    qssRules: qss?.rules.length ?? 0,
    styleImports: qui ? importPathsByKind(qui, 'style') : [],
    tokenImports: qui ? importPathsByKind(qui, 'tokens') : [],
    uri: file.uri,
    version: file.version,
  }
}

function createProjectIndex(
  indexedFiles: readonly ({ document: NativeUiProjectIndexedDocument, skippedUri?: never } | { document?: never, skippedUri: string })[],
): NativeUiProjectIndex {
  return summarizeProjectIndex(
    indexedFiles.flatMap(file => file.document ? [file.document] : []),
    indexedFiles.flatMap(file => file.skippedUri ? [file.skippedUri] : []),
  )
}

function summarizeProjectIndex(
  documents: readonly NativeUiProjectIndexedDocument[],
  skippedDocuments: readonly string[],
): NativeUiProjectIndex {
  const sortedDocuments = [...documents].sort((left, right) => left.uri.localeCompare(right.uri))
  const sortedSkippedDocuments = [...skippedDocuments].sort((left, right) => left.localeCompare(right))

  return {
    documents: sortedDocuments,
    skippedDocuments: sortedSkippedDocuments,
    summary: {
      classes: countUnique(sortedDocuments.flatMap(document => document.classes)),
      componentImports: sum(sortedDocuments, document => document.componentImports.length),
      components: countUnique(sortedDocuments.flatMap(document => document.components)),
      diagnostics: sum(sortedDocuments, document => document.diagnostics.length),
      documentBytes: sum(sortedDocuments, document => document.documentBytes),
      documentCount: sortedDocuments.length,
      qssDeclarations: sum(sortedDocuments, document => document.qssDeclarations),
      qssDocumentCount: sortedDocuments.filter(document => document.kind === 'qss').length,
      qssRules: sum(sortedDocuments, document => document.qssRules),
      quiDocumentCount: sortedDocuments.filter(document => document.kind === 'qui').length,
      skippedDocumentCount: sortedSkippedDocuments.length,
      styleImports: sum(sortedDocuments, document => document.styleImports.length),
      tokenImports: sum(sortedDocuments, document => document.tokenImports.length),
    },
  }
}

function languageOptionsForFile(
  file: NativeUiProjectFile,
  options: NativeUiProjectIndexOptions,
): NativeUiLanguageOptions {
  return {
    ...options.language,
    filePath: file.filePath ?? uriToFilePath(file.uri),
    languageId: file.languageId ?? options.language?.languageId,
  }
}

function importPathsByKind(document: NativeQuiDocument, kind: NativeQuiDocument['imports'][number]['kind']): string[] {
  return uniqueSorted(document.imports.filter(item => item.kind === kind).map(item => item.path))
}

function countQssDeclarations(document: NativeQssDocument): number {
  return document.rules.reduce((total, rule) => total + rule.declarations.length, 0)
}

function sum(
  documents: readonly NativeUiProjectIndexedDocument[],
  read: (document: NativeUiProjectIndexedDocument) => number,
): number {
  return documents.reduce((total, document) => total + read(document), 0)
}

function countUnique(values: readonly string[]): number {
  return new Set(values).size
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right))
}

function uriToFilePath(uri: string): string | undefined {
  try {
    return fileURLToPath(uri)
  }
  catch {
    return undefined
  }
}
