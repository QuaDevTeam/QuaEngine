import type { ParsedQuaScript, QuaScriptChoice, QuaScriptDecorator, QuaScriptDialogue, SourceRange } from './types'

export interface QuaScriptOutlineSymbol {
  kind: 'chapter' | 'scene' | 'entry' | 'node' | 'label' | 'choice'
  id: string
  title: string
  range: SourceRange
  /** Index of the containing declaration, in this document only. */
  parent?: number
}

/** Source structure, not inferred execution order. Never executes expressions. */
export function collectQuaScriptOutline(parsed: ParsedQuaScript): QuaScriptOutlineSymbol[] {
  const symbols: QuaScriptOutlineSymbol[] = []
  const kinds = ['chapter', 'scene', 'entry', 'node', 'label', 'choice'] as const
  const parents: Array<number | undefined> = []
  const append = (kind: QuaScriptOutlineSymbol['kind'], id: string, title: string, range?: SourceRange): void => {
    if (!range)
      return
    const depth = kinds.indexOf(kind)
    parents.length = depth
    symbols.push({ kind, id, title, range, parent: [...parents].reverse().find(value => value !== undefined) })
    parents[depth] = symbols.length - 1
  }
  for (const step of parsed.steps) {
    const decorators: QuaScriptDecorator[] = step.type === 'dialogue'
      ? (step.content as QuaScriptDialogue).decorators
      : step.type === 'action' ? (step.content as { decorators?: QuaScriptDecorator[] }).decorators || [] : []
    for (const decorator of decorators) {
      const kind = kinds.find(kind => kind !== 'choice' && `${kind[0].toUpperCase()}${kind.slice(1)}` === decorator.name)
      const id = decorator.args[0]
      if (!kind || typeof id !== 'string')
        continue
      const metadata = decorator.args[1]
      const title = metadata && typeof metadata === 'object' && 'title' in metadata && typeof metadata.title === 'string' ? metadata.title : id
      append(kind, id, title, decorator.range)
    }
    if (step.type === 'choice') {
      for (const option of (step.content as QuaScriptChoice).options)
        append('choice', option.id || `choice:${option.range?.start.offset}`, option.text, option.range)
    }
  }
  return symbols
}
