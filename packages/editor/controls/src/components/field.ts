import { element, html, render } from '../view.js'

export interface FieldOptions {
  layout?: 'row' | 'stack' | 'inline'
  unit?: string
  accessibleName?: string
}
const ElementBase = globalThis.HTMLElement ?? class {} as typeof HTMLElement

export class EditorField extends ElementBase {
  readonly caption = element<HTMLLabelElement>(html`<label class="editor-field-label"></label>`)

  configure(label: string, control: HTMLElement, options: FieldOptions): void {
    this.classList.add('editor-field')
    this.dataset.layout = options.layout ?? 'row'
    this.caption.className = 'editor-field-label'
    this.caption.textContent = label
    control.id ||= `editor-field-${crypto.randomUUID()}`
    this.caption.htmlFor = control.id
    control.setAttribute('aria-label', options.accessibleName ?? control.getAttribute('aria-label') ?? label)
    render(html`${this.caption}${options.unit
      ? html`<div class="editor-input-unit">${control}<span class="editor-unit" aria-hidden="true">${options.unit}</span></div>`
      : control}`, this)
  }
}

export function field(label: string, control: HTMLElement, options: FieldOptions = {}): EditorField {
  if (!customElements.get('qua-field'))
    customElements.define('qua-field', EditorField)
  const row = document.createElement('qua-field') as EditorField
  row.configure(label, control, options)
  return row
}
