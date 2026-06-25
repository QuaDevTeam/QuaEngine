import type {
  NativeUiProjectDocumentLink,
  NativeUiProjectIndexedDocument,
  NativeUiProjectReference,
  NativeUiProjectReferenceKind,
} from './project-index'
import { pathToFileURL } from 'node:url'

export interface FindNativeUiProjectReferencesOptions {
  kind?: NativeUiProjectReferenceKind
  name?: string
  uri?: string
}

export interface FindNativeUiProjectDefinitionsOptions {
  kind: NativeUiProjectReferenceKind
  name: string
}

export function getNativeUiProjectDocumentLinks(
  index: { documentLinks: readonly NativeUiProjectDocumentLink[] },
  uri?: string,
): NativeUiProjectDocumentLink[] {
  return index.documentLinks
    .filter(link => !uri || link.sourceUri === uri)
    .map(link => ({ ...link }))
}

export function findNativeUiProjectReferences(
  index: { references: readonly NativeUiProjectReference[] },
  options: FindNativeUiProjectReferencesOptions = {},
): NativeUiProjectReference[] {
  return index.references
    .filter(reference => !options.kind || reference.kind === options.kind)
    .filter(reference => !options.name || reference.name === options.name)
    .filter(reference => !options.uri || reference.uri === options.uri)
    .map(reference => ({ ...reference }))
}

export function findNativeUiProjectDefinitions(
  index: { references: readonly NativeUiProjectReference[] },
  options: FindNativeUiProjectDefinitionsOptions,
): NativeUiProjectReference[] {
  const references = findNativeUiProjectReferences(index, {
    kind: options.kind,
    name: options.name,
  })
  const definitions = references.filter(isDefinitionReference)
  return definitions.length > 0 ? definitions : references
}

export function createNativeUiProjectDocumentLinks(
  documents: readonly NativeUiProjectIndexedDocument[],
): NativeUiProjectDocumentLink[] {
  const documentUris = new Set(documents.map(document => document.uri))
  return documents
    .filter(document => document.kind === 'qui')
    .flatMap(document => document.imports.map((item): NativeUiProjectDocumentLink => {
      const candidateUri = resolveImportCandidateUri(document, item.path)
      const resolved = candidateUri !== undefined && documentUris.has(candidateUri)
      return {
        candidateUri,
        kind: item.kind,
        path: item.path,
        pathRange: item.pathRange,
        resolved,
        sourceUri: document.uri,
        targetUri: resolved ? candidateUri : undefined,
      }
    }))
    .sort(compareDocumentLinks)
}

export function createNativeUiProjectReferences(
  documents: readonly NativeUiProjectIndexedDocument[],
): NativeUiProjectReference[] {
  return documents
    .flatMap(document => [
      ...document.componentReferences.map(reference => ({
        ...reference,
        filePath: document.filePath,
        kind: 'component' as const,
        uri: document.uri,
      })),
      ...document.classReferences.map(reference => ({
        ...reference,
        filePath: document.filePath,
        kind: 'class' as const,
        uri: document.uri,
      })),
      ...document.idReferences.map(reference => ({
        ...reference,
        filePath: document.filePath,
        kind: 'id' as const,
        uri: document.uri,
      })),
    ])
    .sort(compareReferences)
}

function resolveImportCandidateUri(
  document: NativeUiProjectIndexedDocument,
  importPath: string,
): string | undefined {
  if (/^[a-z][a-z0-9+.-]*:/i.test(importPath))
    return undefined

  try {
    return new URL(importPath, document.uri).href
  }
  catch {
    if (!document.filePath)
      return undefined
    return new URL(importPath, pathToFileURL(document.filePath).href).href
  }
}

function compareDocumentLinks(left: NativeUiProjectDocumentLink, right: NativeUiProjectDocumentLink): number {
  return left.sourceUri.localeCompare(right.sourceUri)
    || left.path.localeCompare(right.path)
    || left.kind.localeCompare(right.kind)
}

function compareReferences(left: NativeUiProjectReference, right: NativeUiProjectReference): number {
  return left.uri.localeCompare(right.uri)
    || left.kind.localeCompare(right.kind)
    || left.name.localeCompare(right.name)
    || left.source.localeCompare(right.source)
}

function isDefinitionReference(reference: NativeUiProjectReference): boolean {
  switch (reference.kind) {
    case 'component':
    case 'id':
      return reference.source === 'qui-node'
    case 'class':
      return reference.source === 'qui-node'
    default:
      return false
  }
}
