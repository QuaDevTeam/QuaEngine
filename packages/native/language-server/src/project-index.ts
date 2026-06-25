import type {
  NativeQssDocument,
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiImport,
  NativeUiDiagnostic,
  NativeUiDocument,
  NativeUiDocumentKind,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'
import { fileURLToPath } from 'node:url'
import {
  analyzeNativeUiDocument,
  detectNativeUiDocumentKind,
} from '@quajs/native-ui-compiler'
import {
  createNativeUiProjectDocumentLinks,
  createNativeUiProjectReferences,
} from './project-references'

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
  kind: NativeQuiImport['kind']
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
  const quiComponentNodes = qui ? componentAstNodes(qui) : []
  const idReferences = [
    ...idReferencesFromQui(quiComponentNodes),
    ...(qss ? idReferencesFromQss(qss) : []),
  ]

  return {
    classReferences: [
      ...classReferencesFromQui(quiComponentNodes),
      ...(qss ? classReferencesFromQss(qss) : []),
    ],
    classes: uniqueSorted(quiComponentNodes.flatMap(node => node.classes)),
    componentImports: qui ? importPathsByKind(qui, 'component') : [],
    componentReferences: [
      ...componentReferencesFromQui(quiComponentNodes),
      ...(qss ? componentReferencesFromQss(qss) : []),
    ],
    components: uniqueSorted(quiComponentNodes.map(node => node.name)),
    diagnostics: document.diagnostics,
    documentBytes: new TextEncoder().encode(document.source).byteLength,
    filePath: file.filePath,
    idReferences,
    ids: uniqueSorted(idReferences.map(reference => reference.name)),
    imports: qui ? qui.imports.map(importFromQui) : [],
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
    documentLinks: createNativeUiProjectDocumentLinks(sortedDocuments),
    documents: sortedDocuments,
    references: createNativeUiProjectReferences(sortedDocuments),
    skippedDocuments: sortedSkippedDocuments,
    summary: {
      classes: countUnique(sortedDocuments.flatMap(document => document.classes)),
      componentImports: sum(sortedDocuments, document => document.componentImports.length),
      components: countUnique(sortedDocuments.flatMap(document => document.components)),
      diagnostics: sum(sortedDocuments, document => document.diagnostics.length),
      documentBytes: sum(sortedDocuments, document => document.documentBytes),
      documentCount: sortedDocuments.length,
      ids: countUnique(sortedDocuments.flatMap(document => document.ids)),
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

function importFromQui(item: NativeQuiImport): NativeUiProjectImport {
  return {
    kind: item.kind,
    path: item.path,
    pathRange: item.pathRange,
    range: item.range,
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

function componentReferencesFromQui(nodes: readonly NativeQuiAstNode[]): NativeUiProjectComponentReference[] {
  return nodes.map(node => ({
    name: node.name,
    range: node.nameRange,
    source: 'qui-node',
  }))
}

function classReferencesFromQui(nodes: readonly NativeQuiAstNode[]): NativeUiProjectClassReference[] {
  return nodes.flatMap(node => node.classes.map(name => ({
    name,
    range: node.nameRange,
    source: 'qui-node' as const,
  })))
}

function idReferencesFromQui(nodes: readonly NativeQuiAstNode[]): NativeUiProjectIdReference[] {
  return nodes.flatMap(node => node.props
    .filter(prop => prop.name === 'id' && prop.value)
    .map((prop) => {
      const name = prop.value?.trim().replace(/^['"]|['"]$/g, '') ?? ''
      return {
        name,
        range: prop.valueRange ?? prop.nameRange,
        source: 'qui-node' as const,
      }
    })
    .filter(reference => /^[A-Za-z_][\w-]*$/.test(reference.name)))
}

function componentAstNodes(document: NativeQuiDocument): NativeQuiAstNode[] {
  const nodes: NativeQuiAstNode[] = []
  visitQuiAstNodes(document.tree, (node) => {
    if (node.kind === 'component')
      nodes.push(node)
  })
  return nodes
}

function visitQuiAstNodes(
  nodes: readonly NativeQuiAstNode[],
  visit: (node: NativeQuiAstNode) => void,
): void {
  for (const node of nodes) {
    visit(node)
    visitQuiAstNodes(node.children, visit)
  }
}

function componentReferencesFromQss(document: NativeQssDocument): NativeUiProjectComponentReference[] {
  return document.rules.flatMap(rule => selectorMatches(rule.selector, rule.selectorRange, /\b[A-Z]\w*\b/g).map(match => ({
    name: match.name,
    range: match.range,
    source: 'qss-selector' as const,
  })))
}

function classReferencesFromQss(document: NativeQssDocument): NativeUiProjectClassReference[] {
  return document.rules.flatMap(rule => selectorMatches(rule.selector, rule.selectorRange, /\.([a-z_][\w-]*)/gi).map(match => ({
    name: match.name,
    range: match.range,
    source: 'qss-selector' as const,
  })))
}

function idReferencesFromQss(document: NativeQssDocument): NativeUiProjectIdReference[] {
  return document.rules.flatMap(rule => selectorMatches(rule.selector, rule.selectorRange, /#([A-Za-z_][\w-]*)/g).map(match => ({
    name: match.name,
    range: match.range,
    source: 'qss-selector' as const,
  })))
}

function selectorMatches(source: string, sourceRange: NativeUiRange, pattern: RegExp): Array<{ name: string, range: NativeUiRange }> {
  return Array.from(source.matchAll(pattern), (match) => {
    const name = match[1] || match[0]
    const nameStart = match.index + match[0].indexOf(name)
    const nameEnd = nameStart + name.length
    return {
      name,
      range: rangeFromRelativeOffsets(sourceRange.start, source, nameStart, nameEnd),
    }
  })
}

function rangeFromRelativeOffsets(
  startPosition: NativeUiRange['start'],
  text: string,
  startOffset: number,
  endOffset: number,
): NativeUiRange {
  return {
    start: positionFromRelativeOffset(startPosition, text, startOffset),
    end: positionFromRelativeOffset(startPosition, text, endOffset),
  }
}

function positionFromRelativeOffset(
  startPosition: NativeUiRange['start'],
  text: string,
  offset: number,
): NativeUiRange['start'] {
  const before = text.slice(0, Math.max(0, offset))
  const lines = before.split(/\r?\n/)
  const lineDelta = lines.length - 1
  return {
    line: startPosition.line + lineDelta,
    character: lineDelta === 0
      ? startPosition.character + before.length
      : lines[lines.length - 1].length,
  }
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
