import { monacoThemeName } from '../theme/monaco'
import { monaco } from './monaco'
import { DEFAULT_FONT_SIZE, DEFAULT_LINE_HEIGHT } from './preferences'

/** A read-only comparison; closing it never replaces the working buffer. */
export class DiskDiff {
  private editor?: monaco.editor.IStandaloneDiffEditor
  private models: monaco.editor.ITextModel[] = []
  constructor(private readonly container: HTMLElement) {}

  show(disk: string, draft: string, language: string, view?: monaco.editor.IDiffEditorViewState | null): void {
    this.close()
    this.container.hidden = false
    this.editor = monaco.editor.createDiffEditor(this.container, {
      theme: monacoThemeName,
      readOnly: true,
      originalEditable: false,
      automaticLayout: true,
      fontSize: DEFAULT_FONT_SIZE,
      lineHeight: DEFAULT_LINE_HEIGHT,
      renderSideBySide: false,
      minimap: { enabled: false },
      wordWrap: 'on',
    })
    this.models = [monaco.editor.createModel(disk, language), monaco.editor.createModel(draft, language)]
    this.editor.setModel({ original: this.models[0], modified: this.models[1] })
    if (view)
      this.editor.restoreViewState(view)
  }

  saveViewState(): monaco.editor.IDiffEditorViewState | null {
    return this.editor?.saveViewState() || null
  }

  close(): void {
    this.editor?.dispose()
    this.editor = undefined
    this.models.forEach(model => model.dispose())
    this.models = []
    this.container.hidden = true
  }
}
