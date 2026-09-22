import type {
  EditorSourceEdit,
  EditorSourceLocation,
} from '@quajs/editor-core'

export const CHARACTER_EDITOR_ID = 'qua.character'
export type SourceTarget = Omit<EditorSourceEdit, 'newText'> & {
  appendComma?: boolean
}
export interface CharacterField {
  value: string
  edit?: SourceTarget
}
export interface CharacterAsset {
  name: string
  path?: string
  source?: EditorSourceLocation
  edit?: SourceTarget
}
export interface CharacterExpression {
  name: string
  source: EditorSourceLocation
  assets: CharacterAsset[]
  /** Whole expression entry; preserves arbitrary layer metadata through source editing. */
  remove?: SourceTarget
}
export interface CharacterRecord {
  key: string
  id: CharacterField
  displayName: CharacterField
  aliases: string[]
  source: EditorSourceLocation
  manifest?: EditorSourceLocation
  expressions: CharacterExpression[]
  base: CharacterAsset[]
  addExpression?: SourceTarget
  remove?: SourceTarget
  warnings: string[]
}
export interface CharacterCatalog {
  characters: CharacterRecord[]
  registrations: { source: EditorSourceLocation, append: SourceTarget }[]
  issues: { message: string, source?: EditorSourceLocation }[]
}
