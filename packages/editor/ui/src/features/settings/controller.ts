import type { monaco } from '../source/monaco'
import { element as createElement, html as template } from '@quajs/editor-controls'
import { fontFamilies } from './schema'
import { preferences } from './store'
import { SettingsView } from './view'

/** Applies local preferences; the Lit component owns settings presentation. */
export class SettingsPanel {
  readonly dialog = createElement<HTMLDialogElement>(template`<dialog></dialog>`)
  private readonly view = new SettingsView()
  private previousFocus?: HTMLElement
  resetLayout = () => {}
  get value() {
    return preferences.value
  }

  get open(): boolean {
    return this.dialog.open
  }

  constructor(private readonly editor: monaco.editor.IStandaloneCodeEditor, private readonly models: () => monaco.editor.ITextModel[], private readonly visibilityChanged: () => void) {
    this.dialog.id = 'settings-dialog'
    this.dialog.setAttribute('aria-labelledby', 'settings-title')
    this.view.close = () => this.dialog.close()
    this.view.resetLayout = () => this.resetLayout()
    this.dialog.append(this.view)
    document.body.append(this.dialog)
    this.dialog.addEventListener('close', () => {
      this.visibilityChanged()
      if (this.previousFocus?.isConnected)
        this.previousFocus.focus()
    })
    const unsubscribe = preferences.subscribe(() => {
      this.apply()
      this.visibilityChanged()
    })
    editor.onDidDispose(() => {
      unsubscribe()
      this.dialog.remove()
    })
    this.apply()
  }

  show(): void {
    if (this.open)
      return
    this.previousFocus = document.activeElement as HTMLElement
    this.dialog.showModal()
    this.visibilityChanged()
    void this.view.updateComplete.then(() => this.view.querySelector<HTMLInputElement>('[aria-label="搜索设置"]')?.focus())
  }

  apply(): void {
    const p = this.value
    this.editor.updateOptions({
      fontSize: p.fontSize,
      fontFamily: fontFamilies[p.fontFamily],
      fontLigatures: p.fontLigatures,
      lineHeight: Math.round(p.fontSize * p.lineHeight),
      wordWrap: p.wordWrap ? 'on' : 'off',
      lineNumbers: p.lineNumbers ? 'on' : 'off',
      minimap: { enabled: p.minimap },
      renderWhitespace: p.whitespace as 'none' | 'selection' | 'boundary' | 'all',
      guides: { indentation: p.indentGuides },
      bracketPairColorization: { enabled: p.bracketColors },
      stickyScroll: { enabled: p.stickyScroll },
      smoothScrolling: p.smoothScrolling && !p.reducedMotion,
      cursorBlinking: p.reducedMotion ? 'solid' : p.cursorBlinking as 'blink' | 'smooth' | 'solid',
    })
    document.body.dataset.density = p.density
    document.body.dataset.reducedMotion = String(p.reducedMotion)
    for (const model of this.models()) model.updateOptions({ tabSize: p.tabSize, insertSpaces: p.insertSpaces })
  }
}
