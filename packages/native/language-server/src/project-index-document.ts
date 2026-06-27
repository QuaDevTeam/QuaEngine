import type {
  NativeQssDocument,
  NativeQuiAstNode,
  NativeQuiDocument,
  NativeQuiImport,
  NativeUiDocument,
  NativeUiLanguageOptions,
  NativeUiRange,
} from '@quajs/native-ui-compiler'
import { fileURLToPath } from 'node:url'
import {
  analyzeNativeUiDocument,
  detectNativeUiDocumentKind,
} from '@quajs/native-ui-compiler'
import { collectNativeUiProjectAssetReferences } from './asset-references'
import type {
  NativeUiProjectClassReference,
  NativeUiProjectComponentReference,
  NativeUiProjectFile,
  NativeUiProjectIdReference,
  NativeUiProjectImport,
  NativeUiProjectIndexedDocument,
  NativeUiProjectIndexOptions,
} from './project-index-types'

export type NativeUiProjectIndexedFile
  = | { document: NativeUiProjectIndexedDocument, skippedUri?: never }
    | { document?: never, skippedUri: string }

export function indexNativeUiProjectFile(
  file: NativeUiProjectFile,
  options: NativeUiProjectIndexOptions,
): NativeUiProjectIndexedFile {
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
    ...idReferencesFromQui(quiComponentNodes, document.source),
    ...(qss ? idReferencesFromQss(qss) : []),
  ]

  return {
    assetReferences: collectNativeUiProjectAssetReferences(document.source, quiComponentNodes, qss),
    classReferences: [
      ...classReferencesFromQui(quiComponentNodes, document.source),
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

function classReferencesFromQui(
  nodes: readonly NativeQuiAstNode[],
  source: string,
): NativeUiProjectClassReference[] {
  return nodes.flatMap(node => classReferenceRangesFromQuiNode(node, source).map(({ name, range }) => ({
    name,
    range,
    source: 'qui-node' as const,
  })))
}

function classReferenceRangesFromQuiNode(
  node: NativeQuiAstNode,
  source: string,
): Array<{ name: string, range: NativeUiRange }> {
  const references: Array<{ name: string, range: NativeUiRange }> = []
  let cursor = offsetAtPosition(source, node.nameRange.end)

  for (const name of node.classes) {
    if (source[cursor] !== '.') {
      references.push({ name, range: node.nameRange })
      continue
    }

    const start = cursor + 1
    const end = start + name.length
    references.push({
      name,
      range: rangeFromRelativeOffsets({ line: 0, character: 0 }, source, start, end),
    })
    cursor = end
  }

  return references
}

function idReferencesFromQui(
  nodes: readonly NativeQuiAstNode[],
  source: string,
): NativeUiProjectIdReference[] {
  return nodes.flatMap(node => node.props
    .filter(prop => prop.name === 'id' && prop.value)
    .map((prop) => {
      const name = prop.value?.trim().replace(/^['"]|['"]$/g, '') ?? ''
      return {
        name,
        range: prop.valueRange
          ? stringLiteralContentRange(source, prop.value, prop.valueRange)
          : prop.nameRange,
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

function stringLiteralContentRange(
  source: string,
  value: string | undefined,
  range: NativeUiRange,
): NativeUiRange {
  if (!value || value.length < 2)
    return range

  const quote = value[0]
  if ((quote !== '"' && quote !== '\'') || value[value.length - 1] !== quote)
    return range

  const rangeStart = offsetAtPosition(source, range.start)
  const rangeEnd = offsetAtPosition(source, range.end)
  const raw = source.slice(rangeStart, rangeEnd)
  const leadingWhitespace = raw.search(/\S/)
  if (leadingWhitespace < 0)
    return range

  const start = rangeStart + leadingWhitespace + 1
  const end = start + value.length - 2
  return rangeFromRelativeOffsets({ line: 0, character: 0 }, source, start, end)
}

function offsetAtPosition(source: string, position: NativeUiRange['start']): number {
  const lineStarts = createLineStartOffsets(source)
  const line = Math.max(0, Math.min(position.line, lineStarts.length - 1))
  const nextLineStart = lineStarts[line + 1] ?? source.length
  return Math.min(lineStarts[line] + Math.max(0, position.character), nextLineStart)
}

function createLineStartOffsets(source: string): number[] {
  const starts = [0]
  for (let index = 0; index < source.length; index += 1) {
    if (source.charCodeAt(index) === 10)
      starts.push(index + 1)
  }
  return starts
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
