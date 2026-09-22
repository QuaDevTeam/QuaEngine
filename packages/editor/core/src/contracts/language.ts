/** All editor locations use one-based lines/columns; ranges have an exclusive end. */
export interface EditorPosition {
  line: number
  column: number
}
export interface EditorRange {
  start: EditorPosition
  end: EditorPosition
}
export interface EditorLanguageRequest {
  path: string
  text: string
  position: EditorPosition
}
export interface EditorCompletion {
  documentation?: string
  range?: EditorRange
  snippet?: boolean
  label: string
  kind: string
  detail?: string
  insertText?: string
  sortText?: string
}
export interface EditorFormatOptions { tabSize: number, insertSpaces: boolean }
export interface EditorHover {
  contents: string
  range?: EditorRange
}
export interface EditorDefinition {
  path: string
  range: EditorRange
}
export interface EditorTextEdit {
  range: EditorRange
  newText: string
}
export interface EditorDialogueHighlight {
  character: string
  speaker: EditorRange
  text: EditorRange[]
}
export interface EditorAnalysis {
  authoring?: import('./authoring.js').EditorAuthoring
  previewSteps: { index: number, line: number, endLine: number }[]
  diagnostics: import('./project.js').EditorDiagnostic[]
  dialogueHighlights: EditorDialogueHighlight[]
}
export interface EditorProjectCheck {
  root: string
  phase: 'checking' | 'complete' | 'error'
  completed: number
  total: number
  diagnostics: import('./project.js').EditorDiagnostic[]
}

export interface EditorSignatureHelp {
  signatures: { label: string, documentation?: string, parameters: { label: string, documentation?: string }[] }[]
  activeSignature: number
  activeParameter: number
}
