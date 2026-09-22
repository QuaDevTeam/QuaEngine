import type { EditorDialogueHighlight } from '@quajs/editor-core'
import { html, nothing, render, styleMap } from '@quajs/editor-controls'
import { monaco } from './monaco'

/** Presentation only: identities and ranges come from the shared compiler AST. */
export class DialogueColors {
  private readonly decorations: monaco.editor.IEditorDecorationsCollection
  private readonly style = document.createElement('style')
  private readonly colors = new Map<string, { className: string, hue: number }>()
  constructor(editor: monaco.editor.IStandaloneCodeEditor, private readonly legend: HTMLElement) {
    this.decorations = editor.createDecorationsCollection()
    document.head.append(this.style)
    editor.onDidDispose(() => this.style.remove())
  }

  clear(): void {
    this.decorations.clear()
    render(nothing, this.legend)
  }

  reset(): void {
    this.clear()
    this.colors.clear()
    this.style.textContent = ''
  }

  apply(highlights: EditorDialogueHighlight[]): void {
    const decorations: monaco.editor.IModelDeltaDecoration[] = []
    const speakers = new Set<string>()
    const range = (range: EditorDialogueHighlight['speaker']): monaco.Range => new monaco.Range(range.start.line, range.start.column, range.end.line, range.end.column)
    for (const highlight of highlights) {
      speakers.add(highlight.character)
      let color = this.colors.get(highlight.character)
      if (!color) {
        let hash = 2166136261
        for (const character of highlight.character) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619)
        let hue = (hash >>> 0) % 360
        // Separate nearby colors within the current workspace, preserving earlier assignments.
        for (let attempt = 0; attempt < 12 && [...this.colors.values()].some(color => Math.min(Math.abs(hue - color.hue), 360 - Math.abs(hue - color.hue)) < 22); attempt++) hue = (hue + 137) % 360
        color = { className: `qua-speaker-${this.colors.size}`, hue }
        this.colors.set(highlight.character, color)
        this.style.textContent += `.${color.className}-name { color: hsl(${hue} var(--editor-speaker-saturation) var(--editor-speaker-lightness)) !important; font-weight: 600; } .${color.className}-text { color: hsl(${hue} var(--editor-dialogue-saturation) var(--editor-dialogue-lightness)) !important; } .${color.className}-line { border-left: 2px solid hsl(${hue} var(--editor-speaker-saturation) var(--editor-speaker-lightness)); margin-left: 5px; }`
      }
      decorations.push({ range: range(highlight.speaker), options: { inlineClassName: `${color.className}-name`, linesDecorationsClassName: `${color.className}-line`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })
      for (const text of highlight.text) decorations.push({ range: range(text), options: { inlineClassName: `${color.className}-text`, stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })
    }
    this.decorations.set(decorations)
    render(html`${[...speakers].slice(0, 8).map(character => html`<span title=${`角色：${character}`}
      style=${styleMap({ color: `hsl(${this.colors.get(character)!.hue} var(--editor-speaker-saturation) var(--editor-speaker-lightness))` })}>${character}</span>`)}`, this.legend)
    this.legend.title = `当前文档角色：${[...speakers].join('、')}`
  }
}
