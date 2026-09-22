import type { ButtonVariant } from '../components/button.js'
import { buttonView } from '../components/button.js'
import { element, html, nothing, render } from '../view.js'

/** Native form adapters for imperative integrations. New feature views use Lit templates. */
export interface InputOptions {
  type?: 'text' | 'number' | 'search' | 'password' | 'url' | 'range'
  min?: number
  max?: number
  step?: number | 'any'
  placeholder?: string
}

export function button(label: string, action: () => void, variant: ButtonVariant = 'default'): HTMLButtonElement {
  return element(buttonView(label, action, { variant }))
}

export function input(value: string | number = '', changed?: (value: string) => void, options: InputOptions = {}): HTMLInputElement {
  return element(html`<input class="editor-input" type=${options.type ?? 'text'}
    .defaultValue=${String(value)} .value=${String(value)}
    min=${options.min ?? nothing} max=${options.max ?? nothing}
    step=${options.step ?? (options.type === 'number' ? 'any' : nothing)} placeholder=${options.placeholder ?? nothing}
    @change=${(event: Event) => {
      const control = event.currentTarget as HTMLInputElement
      if (!changed || (control.type === 'number' && (!control.value.trim() || !Number.isFinite(control.valueAsNumber))))
        return
      if (!control.checkValidity()) {
        control.reportValidity()
        return
      }
      changed(control.value)
    }}>`)
}

export function select(options: readonly (string | { value: string, title: string })[] = [], value?: string, changed?: (value: string) => void): HTMLSelectElement {
  const control = element<HTMLSelectElement>(html`<select class="editor-select" @change=${(event: Event) => changed?.((event.currentTarget as HTMLSelectElement).value)}></select>`)
  render(html`${options.map(item => html`<option value=${typeof item === 'string' ? item : item.value}>${typeof item === 'string' ? item : item.title}</option>`)}`, control)
  if (value !== undefined)
    control.value = value
  return control
}

export function checkbox(checked = false, changed?: (checked: boolean) => void): HTMLInputElement {
  return element(html`<input type="checkbox" class="editor-checkbox" .checked=${checked} @change=${(event: Event) => changed?.((event.currentTarget as HTMLInputElement).checked)}>`)
}

export function textarea(value = ''): HTMLTextAreaElement {
  return element(html`<textarea class="editor-textarea" rows="3" .value=${value}></textarea>`)
}
