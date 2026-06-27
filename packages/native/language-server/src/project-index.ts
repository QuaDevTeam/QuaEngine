import { indexNativeUiProjectFile } from './project-index-document'
import { summarizeProjectIndex } from './project-index-summary'
import type { NativeUiProjectIndexedFile } from './project-index-document'
import type {
  NativeUiProjectFile,
  NativeUiProjectIndex,
  NativeUiProjectIndexChange,
  NativeUiProjectIndexOptions,
} from './project-index-types'

export type {
  NativeUiProjectClassReference,
  NativeUiProjectComponentReference,
  NativeUiProjectDocumentLink,
  NativeUiProjectFile,
  NativeUiProjectIdReference,
  NativeUiProjectImport,
  NativeUiProjectIndex,
  NativeUiProjectIndexChange,
  NativeUiProjectIndexedDocument,
  NativeUiProjectIndexOptions,
  NativeUiProjectIndexSummary,
  NativeUiProjectReference,
  NativeUiProjectReferenceKind,
} from './project-index-types'

export function buildNativeUiProjectIndex(
  files: readonly NativeUiProjectFile[],
  options: NativeUiProjectIndexOptions = {},
): NativeUiProjectIndex {
  return createProjectIndex(files.map(file => indexNativeUiProjectFile(file, options)))
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

    const indexed = indexNativeUiProjectFile({
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

function createProjectIndex(
  indexedFiles: readonly NativeUiProjectIndexedFile[],
): NativeUiProjectIndex {
  return summarizeProjectIndex(
    indexedFiles.flatMap(file => file.document ? [file.document] : []),
    indexedFiles.flatMap(file => file.skippedUri ? [file.skippedUri] : []),
  )
}
