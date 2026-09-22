/** UTF-16 offsets into the analyzed buffer, independent of any host/editor model. */
export interface EditorAuthoringField {
  label: string
  start: number
  end: number
  kind: 'string' | 'number' | 'boolean' | 'text' | 'expression'
  value: string
  choices?: string[]
  assetRoots?: string[]
  assetExtensions?: string[]
  characterNames?: boolean
}
export interface EditorAuthoringDecorator {
  name: string
  start: number
  end: number
  fields: EditorAuthoringField[]
}
export interface EditorAuthoringStep {
  index: number
  start: number
  end: number
  line: number
  endLine: number
  kind: 'dialogue' | 'action' | 'choice'
  title: string
  fields: EditorAuthoringField[]
  decorators: EditorAuthoringDecorator[]
}
export interface EditorAuthoring {
  steps: EditorAuthoringStep[]
  decorators: { name: string, description?: string, args: string[], module: string, binding: string }[]
  characters: string[]
  error?: string
}
