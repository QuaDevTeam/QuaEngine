import type { EditorDocument } from './project.js'

export interface EditorWritingContext {
  root: string
  name: string
  outline: string
  worldbuilding: string
  characters: string
  sources: { path: string, line: number, kind: string }[]
  warnings: string[]
}

/** Captured Monaco buffer; unsaved edits and the selected source range are retained. */
export interface EditorWritingDocument extends EditorDocument {
  root: string
  start: number
  end: number
}

export interface EditorWritingApply {
  root: string
  path: string
  text: string
  base?: EditorWritingDocument
  selection?: { start: number, end: number }
}

/** AI chooses source anchors; executable source is never supplied by the model. */
export interface EditorWritingPlan {
  summary: string
  assignments: Array<{
    line: number
    anchor: number
    expressions: Array<{ expression: number, start: number, end: number }>
  }>
}

export type EditorAuthoringRequest = { id: number, deadline: number } & (
  | { kind: 'capture' }
  | { kind: 'apply', value: EditorWritingApply }
  | { kind: 'validate', value: EditorWritingApply }
)

export interface EditorWritingBridge {
  context: () => Promise<EditorWritingContext>
  capture: () => Promise<{ document: EditorWritingDocument, prose: string }>
  convert: (prose: string) => Promise<string>
  validate: (request: { base: EditorWritingDocument, text?: string }) => Promise<EditorWritingDocument>
  apply: (request: { root: string, path: string, prose: string, mode: 'create' | 'append' | 'rewrite', base?: EditorWritingDocument, plan?: EditorWritingPlan }) => Promise<EditorWritingDocument>
  onProjectChange: (listener: () => void) => () => void
}
