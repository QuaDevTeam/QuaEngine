import type {
  NativeUiProjectIndex,
  NativeUiProjectIndexedDocument,
} from './project-index-types'
import {
  createNativeUiProjectDocumentLinks,
  createNativeUiProjectReferences,
} from './project-references'

export function summarizeProjectIndex(
  documents: readonly NativeUiProjectIndexedDocument[],
  skippedDocuments: readonly string[],
): NativeUiProjectIndex {
  const sortedDocuments = [...documents].sort((left, right) => left.uri.localeCompare(right.uri))
  const sortedSkippedDocuments = [...skippedDocuments].sort((left, right) => left.localeCompare(right))

  return {
    documentLinks: createNativeUiProjectDocumentLinks(sortedDocuments, sortedSkippedDocuments),
    documents: sortedDocuments,
    references: createNativeUiProjectReferences(sortedDocuments),
    skippedDocuments: sortedSkippedDocuments,
    summary: {
      assetReferences: sum(sortedDocuments, document => document.assetReferences.length),
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

function sum(
  documents: readonly NativeUiProjectIndexedDocument[],
  read: (document: NativeUiProjectIndexedDocument) => number,
): number {
  return documents.reduce((total, document) => total + read(document), 0)
}

function countUnique(values: readonly string[]): number {
  return new Set(values).size
}
