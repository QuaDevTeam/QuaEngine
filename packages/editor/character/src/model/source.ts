import type { EditorSourceLocation } from '@quajs/editor-core'
import type { CharacterCatalog, CharacterRecord } from '../contracts.js'

/** Use indexed source coordinates; shared manifests keep the current character when possible. */
export function characterForSource(catalog: CharacterCatalog | undefined, source: EditorSourceLocation, selected?: string): CharacterRecord | undefined {
  const definitions = catalog?.characters.filter(character => character.source.path === source.path) ?? []
  if (definitions.length) {
    const sameLine = definitions.filter(character => character.source.line === source.line).sort((a, b) => a.source.column - b.source.column)
    if (sameLine.length)
      return sameLine.filter(character => character.source.column <= source.column).at(-1) ?? sameLine[0]
    const before = definitions.filter(character => character.source.line < source.line)
    return before.sort((a, b) => b.source.line - a.source.line || b.source.column - a.source.column)[0]
      ?? definitions.find(character => character.key === selected)
      ?? definitions[0]
  }
  const manifests = catalog?.characters.filter(character => character.manifest?.path === source.path) ?? []
  return manifests.find(character => character.key === selected) ?? manifests[0]
}
