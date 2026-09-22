import type { FieldOptions, InputOptions } from '@quajs/editor-controls'
import { field as editorField, input as editorInput } from '@quajs/editor-controls'

export { button, checkbox, section, select } from '@quajs/editor-controls'

export function field(label: string, control: HTMLElement, options?: FieldOptions): HTMLElement {
  const row = editorField(label, control, options)
  row.classList.add('animation-field')
  return row
}

export function input(value: string | number, changed: (value: string) => void, type: InputOptions['type'] = 'text'): HTMLInputElement {
  return editorInput(value, changed, { type })
}
