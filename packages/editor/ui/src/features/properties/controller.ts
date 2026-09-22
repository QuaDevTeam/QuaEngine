import type { CharacterCatalog } from '@quajs/editor-character'
import type { EditorAuthoring, EditorAuthoringField, EditorAuthoringStep, EditorProject } from '@quajs/editor-core'
import { button, field as editorField, input as editorInput, select as editorSelect, element, html, nothing, render as renderView, textarea } from '@quajs/editor-controls'
import { workbenchEmpty } from '../../shared/empty-state'
import { iconButton } from '../../shared/icons'
import { monaco } from '../source/monaco'
import { visualDecoratorLabel, visualFieldLabel, visualPresets } from './presets'
import './styles.scss'

/** A second view of the same Monaco buffer. It never saves or executes game code. */
export class VisualScriptEditor {
  private visible = false
  private snapshot?: EditorAuthoring
  private snapshotText = ''
  private selected = -1
  private applying = false
  private stale = true
  private form?: HTMLFieldSetElement
  private tracked: string[] = []
  private trackedModel?: monaco.editor.ITextModel
  private readonly message = element(html`<p class="visual-message" role="status"></p>`)
  private readonly navigation = editorSelect()
  private readonly previous = button('‹', () => this.select(this.selected - 1))
  private readonly next = button('›', () => this.select(this.selected + 1))
  private readonly body = element(html`<div class="visual-body"></div>`)
  private readonly pane: HTMLElement
  private readonly container: HTMLElement
  private readonly modes: HTMLElement
  private readonly listeners: monaco.IDisposable[] = []
  private readonly observer: MutationObserver
  private historyFocus?: { index: number, step: number, start: number | null, end: number | null }

  constructor(
    private readonly editor: monaco.editor.IStandaloneCodeEditor,
    private readonly project: () => EditorProject | undefined,
    private readonly writable: () => boolean,
    private readonly revealProperties: () => void,
    private readonly revealSource: () => void,
  ) {
    this.container = document.getElementById('source-authoring')!
    this.pane = document.getElementById('visual-editor')!
    this.modes = document.getElementById('source-modes')!
    const control = iconButton('grid', '打开语句属性')
    control.onclick = this.revealProperties
    renderView(control, this.modes)
    this.previous.classList.add('icon-button')
    this.next.classList.add('icon-button')
    this.previous.title = '上一语句'
    this.next.title = '下一语句'
    this.navigation.setAttribute('aria-label', '当前语句')
    renderView(html`<option value="-1">未选择语句</option>`, this.navigation)
    this.navigation.onchange = () => this.select(Number(this.navigation.value))
    this.previous.setAttribute('aria-label', '上一语句')
    this.next.setAttribute('aria-label', '下一语句')
    renderView(html`<div class="visual-toolbar">${this.previous}${this.navigation}${this.next}</div>${this.message}${this.body}`, this.pane)
    this.pane.addEventListener('focusout', () => queueMicrotask(() => {
      if (!this.pane.contains(document.activeElement) && this.snapshotText === this.editor.getValue())
        this.render()
    }))
    this.pane.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        const active = document.activeElement
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
          this.historyFocus = { index: [...this.body.querySelectorAll('[data-field]')].indexOf(active), step: this.selected, start: active.selectionStart, end: active.selectionEnd }
        }
        void this.editor.getModel()?.[event.shiftKey ? 'redo' : 'undo']()
      }
    })
    this.listeners.push(editor.onDidChangeModel(() => {
      this.clearTracked()
      this.snapshot = undefined
      this.historyFocus = undefined
      this.selected = -1
      this.stale = true
      this.updateMode()
      this.render()
    }), editor.onDidChangeModelContent(() => {
      if (this.applying)
        return
      this.stale = true
      if (this.form)
        this.form.disabled = true
      this.updateNavigation()
      this.message.textContent = '正在同步代码…'
    }), editor.onDidChangeCursorPosition(() => {
      if (this.applying || this.stale || this.snapshotText !== this.editor.getValue())
        return
      const offset = this.offset()
      const step = this.snapshot?.steps.find(step => offset >= step.start && offset <= step.end)
      const index = step?.index ?? -1
      if (index !== this.selected) {
        this.selected = index
        this.render()
      }
    }))
    this.observer = new MutationObserver(() => this.updateMode())
    this.observer.observe(document.getElementById('editor')!, { attributes: true, attributeFilter: ['hidden'] })
    this.updateMode()
    this.updateNavigation()
    editor.onDidDispose(() => this.dispose())
  }

  update(authoring: EditorAuthoring | undefined, source: string): void {
    if (this.editor.getValue() !== source)
      return
    this.snapshot = authoring
    this.snapshotText = source
    const wasStale = this.stale
    this.stale = false
    if (wasStale) {
      const offset = this.offset()
      this.selected = authoring?.steps.find(step => offset >= step.start && offset <= step.end)?.index ?? -1
    }
    this.updateMode()
    this.updateNavigation()
    // Keep live inputs/IME/caret attached while our own range edits are analyzed.
    if (!wasStale && this.pane.contains(document.activeElement))
      return
    this.render()
  }

  private offset(): number {
    return this.editor.getModel()?.getOffsetAt(this.editor.getPosition() || { lineNumber: 1, column: 1 }) ?? 0
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible)
      return
    this.visible = visible
    if (visible)
      this.render()
  }

  private editCode(): void {
    this.revealSource()
    this.editor.focus()
  }

  private updateMode(): void {
    this.modes.hidden = this.editor.getModel()?.getLanguageId() !== 'quascript'
    this.container.hidden = document.getElementById('editor')!.hidden
    this.editor.layout()
  }

  private select(index: number): void {
    const step = this.snapshot?.steps[index]
    if (!step || this.stale || this.snapshotText !== this.editor.getValue())
      return
    this.selected = index
    this.applying = true
    this.editor.setPosition(this.editor.getModel()!.getPositionAt(step.start))
    this.editor.revealLineInCenter(step.line)
    this.applying = false
    this.render()
  }

  private render(): void {
    if (!this.visible)
      return
    // Live inputs use tracked ranges, but rebuilding a form needs a complete,
    // byte-identical analysis. Never bind old offsets to the current buffer.
    if (this.snapshot && this.snapshotText !== this.editor.getValue()) {
      this.updateNavigation()
      return
    }
    if (this.editor.getModel()?.getLanguageId() !== 'quascript') {
      this.message.textContent = ''
      renderView(workbenchEmpty('document', '选择语句以编辑属性', '打开 QuaScript，将光标放到对话或指令上。').element, this.body)
      return
    }
    const scroll = this.body.scrollTop
    this.clearTracked()
    renderView(nothing, this.body)
    this.form = undefined
    const data = this.snapshot
    this.updateNavigation()
    this.message.textContent = this.stale ? '正在同步代码…' : data?.error || ''
    const step = data?.steps[this.selected]
    if (!step || this.stale || data?.error) {
      if (!this.stale && !data?.error)
        renderView(workbenchEmpty('document', '选择语句以编辑属性', '打开 QuaScript，将光标放到对话或指令上。').element, this.body)
      return
    }
    if (step.kind === 'choice') {
      renderView(button('在代码中编辑选择分支', () => this.editCode()), this.body)
      return
    }
    const form = this.form = element<HTMLFieldSetElement>(html`<fieldset ?disabled=${!this.writable()}>
      ${step.fields.length ? html`<div class="visual-section"><h3>${step.kind === 'dialogue' ? '当前台词' : '当前指令'}</h3>${step.fields.map(field => this.field(field))}</div>` : nothing}
      ${step.decorators.map((decorator) => {
        const model = this.editor.getModel()!
        const from = model.getPositionAt(decorator.start)
        const to = model.getPositionAt(decorator.end)
        const removeStart = model.getOffsetAt({ lineNumber: from.lineNumber, column: 1 })
        const removeEnd = to.lineNumber < model.getLineCount() ? model.getOffsetAt({ lineNumber: to.lineNumber + 1, column: 1 }) : model.getValueLength()
        const remove = this.target(removeStart, removeEnd)
        return html`<section class="visual-section" data-decorator=${decorator.name}>
          <div class="visual-section-heading"><h3 title=${`@${decorator.name}`}>${visualDecoratorLabel(decorator.name)}</h3>
            ${button('移除', () => {
              if (remove(''))
                this.waitForStructure(step.index)
            })}</div>
          ${decorator.fields.map(field => this.field(field))}
          ${!decorator.fields.length ? html`<span class="visual-empty-params">@${decorator.name}</span>` : nothing}
        </section>`
      })}
      ${!step.decorators.some(item => ['SetBackground', 'ClearBackground', 'VideoBackground', 'SetLayeredBackground'].includes(item.name)) ? html`<p class="visual-hint">背景沿用前文</p>` : nothing}
      ${this.addForm(step)}
    </fieldset>`)
    renderView(form, this.body)
    this.body.scrollTop = scroll
    const focus = this.historyFocus
    this.historyFocus = undefined
    if (focus?.step === this.selected && (document.activeElement === document.body || this.pane.contains(document.activeElement))) {
      const input = this.body.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-field]')[focus.index]
      input?.focus({ preventScroll: true })
      if (input && focus.start !== null && focus.end !== null)
        input.setSelectionRange(focus.start, focus.end)
    }
  }

  private field(field: EditorAuthoringField): HTMLElement {
    const input = field.label === '文本' || field.kind === 'expression' ? textarea() : editorInput()
    input.dataset.field = field.label
    input.setAttribute('aria-label', visualFieldLabel(field.label))
    input.value = field.value
    const row = editorField(visualFieldLabel(field.label), input, { layout: 'stack' })
    row.classList.add('visual-field')
    if (input instanceof HTMLTextAreaElement)
      input.rows = field.kind === 'expression' ? 2 : 3
    if (field.kind === 'expression') {
      const reference = this.track(field.start, field.end)
      input.readOnly = true
      input.title = '表达式保留原样；在代码中编辑'
      return element(html`<div>${row}${button('编辑代码', () => {
        const range = reference.model.isDisposed() ? null : reference.model.getDecorationRange(reference.id)
        this.editCode()
        if (range) {
          this.editor.setPosition(range.getStartPosition())
          this.editor.revealRangeInCenter(range)
        }
      })}</div>`)
    }
    const write = this.target(field.start, field.end)
    if (field.kind === 'boolean' && input instanceof HTMLInputElement) {
      input.type = 'checkbox'
      input.checked = field.value === 'true'
      input.onchange = () => {
        write(String(input.checked))
      }
    }
    else {
      if (field.kind === 'number' && input instanceof HTMLInputElement) {
        input.type = 'number'
        input.step = 'any'
      }
      const commit = () => {
        if (field.kind === 'number' && (!input.value.trim() || !Number.isFinite(Number(input.value))))
          return
        if (field.kind === 'text' && (/[\r\n]/u.test(input.value) || (field.label === '说话角色' && (!input.value.trim() || input.value.includes(':'))))) {
          input.setCustomValidity('此字段需要单行文本；角色名不能为空或包含冒号。')
          input.reportValidity()
          return
        }
        input.setCustomValidity('')
        write(field.kind === 'string' ? JSON.stringify(input.value) : field.kind === 'number' ? String(Number(input.value)) : input.value)
      }
      input.oninput = (event) => {
        if (!(event as InputEvent).isComposing)
          commit()
      }
      input.addEventListener('compositionend', commit)
    }
    return element(html`<div>${row}${this.suggest(input, this.choices(field))}</div>`)
  }

  private catalog(): CharacterCatalog | undefined {
    return this.project()?.plugins?.['qua.character']?.data as CharacterCatalog | undefined
  }

  private choices(field: Pick<EditorAuthoringField, 'choices' | 'characterNames' | 'assetRoots' | 'assetExtensions' | 'label'>): string[] {
    const values = [...field.choices || []]
    if (field.characterNames) {
      values.push(...this.snapshot?.characters || [])
      for (const character of this.catalog()?.characters || []) values.push(character.id.value, character.displayName.value, ...character.aliases)
    }
    if (field.label === 'expression') {
      for (const character of this.catalog()?.characters || []) values.push(...character.expressions.map(item => item.name))
    }
    for (const root of field.assetRoots || []) {
      const prefix = `${root.replace(/\/$/u, '')}/`
      for (const entry of this.project()?.entries || []) {
        if (entry.path.startsWith(prefix) && (!field.assetExtensions?.length || field.assetExtensions.some(extension => entry.path.toLowerCase().endsWith(extension))))
          values.push(entry.path.slice(prefix.length))
      }
    }
    return [...new Set(values)].filter(Boolean).slice(0, 500)
  }

  private suggest(input: HTMLInputElement | HTMLTextAreaElement, values: string[]) {
    if (!(input instanceof HTMLInputElement) || !values.length)
      return nothing
    const id = `visual-options-${crypto.randomUUID()}`
    input.setAttribute('list', id)
    return html`<datalist id=${id}>${values.map(value => html`<option value=${value}></option>`)}</datalist>`
  }

  private addForm(step: EditorAuthoringStep) {
    const presets = visualPresets(this.snapshot!)
    if (!presets.length)
      return nothing
    const select = editorSelect([{ value: '', title: '添加指令…' }, ...presets.map(item => ({ value: item.name, title: item.label }))])
    select.setAttribute('aria-label', '添加指令')
    const fields = element(html`<div></div>`)
    select.onchange = () => {
      const preset = presets.find(item => item.name === select.value)
      if (!preset) {
        renderView(nothing, fields)
        return
      }
      const inputs = preset.fields.map(field => editorInput(field.value, undefined, { type: field.kind === 'number' ? 'number' : 'text' }))
      const rows = preset.fields.map((field, index) => {
        const input = inputs[index]
        input.setAttribute('aria-label', `新增${field.label}`)
        const roots = field.source === 'image' ? ['assets/images', 'assets/backgrounds', 'assets/characters'] : field.source === 'audio' ? ['assets/audio', 'assets/voice', 'assets/bgm'] : []
        const suggestions = this.suggest(input, this.choices({ label: field.source === 'expression' ? 'expression' : '', characterNames: field.source === 'character', assetRoots: roots, assetExtensions: field.source === 'image' ? ['.png', '.jpg', '.jpeg', '.webp', '.avif'] : ['.ogg', '.mp3', '.wav', '.flac', '.m4a', '.aac'] }))
        const row = editorField(field.label, input, { layout: 'stack' })
        row.classList.add('visual-field')
        return html`${row}${suggestions}`
      })
      const lineStart = this.editor.getModel()!.getOffsetAt({ lineNumber: step.line, column: 1 })
      const insert = this.target(lineStart, lineStart)
      renderView(html`${rows}${button('添加到当前语句', () => {
        for (const input of inputs) {
          if (!input.value.trim() || (input.type === 'number' && !Number.isFinite(Number(input.value)))) {
            input.focus()
            input.setCustomValidity('请填写有效参数。')
            input.reportValidity()
            return
          }
          input.setCustomValidity('')
        }
        const model = this.editor.getModel()!
        const eol = model.getEOL()
        const position = model.getPositionAt(step.start)
        const indent = model.getLineContent(position.lineNumber).match(/^[\t ]*/u)![0]
        const call = `${indent}@${preset.name}(${preset.args(inputs.map(input => input.type === 'number' ? String(Number(input.value)) : input.value))})${eol}`
        if (insert(call))
          this.waitForStructure(step.index)
      })}`, fields)
    }
    return html`<section class="visual-section visual-add">${select}${fields}</section>`
  }

  private waitForStructure(index: number): void {
    this.selected = index
    this.stale = true
    if (this.form)
      this.form.disabled = true
    this.message.textContent = '正在同步代码…'
  }

  private track(start: number, end: number): { model: monaco.editor.ITextModel, id: string } {
    const model = this.editor.getModel()!
    this.trackedModel = model
    const a = model.getPositionAt(start)
    const b = model.getPositionAt(end)
    const id = model.deltaDecorations([], [{ range: new monaco.Range(a.lineNumber, a.column, b.lineNumber, b.column), options: { stickiness: monaco.editor.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges } }])[0]
    this.tracked.push(id)
    return { model, id }
  }

  private target(start: number, end: number): (value: string) => boolean {
    const { model, id } = this.track(start, end)
    let expected = this.snapshotText.slice(start, end)
    return (value) => {
      const range = model.isDisposed() ? null : model.getDecorationRange(id)
      if (!range || this.stale || !this.writable() || this.editor.getModel() !== model || model.getValueInRange(range) !== expected) {
        this.message.textContent = '代码已变化，请等待表单同步后重试。'
        return false
      }
      if (value === expected)
        return true
      if ((model.getValueLength() - expected.length + value.length) * 2 > 2 * 1024 * 1024) {
        this.message.textContent = '编辑结果超过文档大小上限。'
        return false
      }
      this.applying = true
      try {
        this.editor.pushUndoStop()
        this.editor.executeEdits('visual-authoring', [{ range, text: value }])
        this.editor.pushUndoStop()
        expected = value
        this.updateNavigation()
      }
      finally {
        this.applying = false
      }
      return true
    }
  }

  private clearTracked(): void {
    if (this.trackedModel && !this.trackedModel.isDisposed())
      this.trackedModel.deltaDecorations(this.tracked, [])
    this.tracked = []
    this.trackedModel = undefined
  }

  hasFocus(): boolean {
    return this.pane.contains(document.activeElement)
  }

  revealStep(index: number, kind: string): void {
    this.revealProperties()
    this.select(index)
    const section = [...this.body.querySelectorAll<HTMLElement>('[data-decorator]')].find(element => kind === 'background' ? /Background/u.test(element.dataset.decorator || '') : kind === 'character' ? /Character|Expression|Sprite/u.test(element.dataset.decorator || '') : kind === 'audio' ? /Voice|BGM|SFX|Ambient|Audio/u.test(element.dataset.decorator || '') : false)
    ;
    (section || this.body.querySelector<HTMLElement>('.visual-section'))?.scrollIntoView({ block: 'nearest' })
  }

  private updateNavigation(): void {
    const steps = this.snapshot?.steps || []
    const pending = this.stale || this.snapshotText !== this.editor.getValue()
    this.navigation.disabled = pending || !steps.length
    this.previous.disabled = pending || this.selected <= 0
    this.next.disabled = pending || this.selected >= steps.length - 1
    if (pending)
      return
    renderView(html`<option value="-1">选择语句…</option>${steps.map(step => html`<option value=${String(step.index)}>第 ${step.line} 行：${step.title}</option>`)}`, this.navigation)
    this.navigation.value = String(this.selected)
  }

  dispose(): void {
    this.clearTracked()
    this.listeners.forEach(listener => listener.dispose())
    this.observer.disconnect()
  }
}
