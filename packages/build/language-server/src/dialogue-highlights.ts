import type { ParsedQuaScript, QuaScriptDialogue, SourceRange } from '@quajs/script-compiler'
import { createLineStarts, rangeFromOffsets } from '@quajs/script-compiler'

export interface QuaScriptDialogueHighlight {
  character: string
  speaker: SourceRange
  /** Literal dialogue segments only; embedded TypeScript retains its own syntax colors. */
  text: SourceRange[]
}

export function collectDialogueHighlights(source: string, parsed: ParsedQuaScript): QuaScriptDialogueHighlight[] {
  const starts = createLineStarts(source)
  const highlights: QuaScriptDialogueHighlight[] = []
  for (const step of parsed.steps) {
    if (step.type !== 'dialogue')
      continue
    const dialogue = step.content as QuaScriptDialogue
    if (!dialogue.character || !dialogue.range)
      continue
    const prefix = source.slice(dialogue.range.start.offset, dialogue.textRange.start.offset)
    const speakerStart = dialogue.range.start.offset + prefix.length - prefix.trimStart().length
    const text: SourceRange[] = []
    let cursor = dialogue.textRange.start.offset
    for (const expression of dialogue.templateExpressionRanges) {
      // Parser expression ranges contain the body, excluding the ${ and } delimiters.
      const end = Math.max(cursor, expression.start.offset - 2)
      if (cursor < end)
        text.push(rangeFromOffsets(starts, cursor, end))
      cursor = expression.end.offset + 1
    }
    if (cursor < dialogue.textRange.end.offset)
      text.push(rangeFromOffsets(starts, cursor, dialogue.textRange.end.offset))
    highlights.push({ character: dialogue.character, speaker: rangeFromOffsets(starts, speakerStart, speakerStart + dialogue.character.length), text })
  }
  return highlights
}
