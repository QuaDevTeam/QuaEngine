import type { TemplateResult } from '../view.js'
import { html, nothing } from '../view.js'

export type ButtonVariant = 'default' | 'primary' | 'quiet' | 'danger'
export interface ButtonOptions {
  variant?: ButtonVariant
  size?: 'compact' | 'comfortable'
  disabled?: boolean
  busy?: boolean
  icon?: TemplateResult
  title?: string
  id?: string
  className?: string
  type?: 'button' | 'submit' | 'reset'
}

const spinner = html`<svg class="editor-button-spinner" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.5"/></svg>`

function template(label: string, action: (() => void) | undefined, options: ButtonOptions, iconOnly = false): TemplateResult {
  return html`<button type=${options.type ?? 'button'} id=${options.id ?? nothing}
    class=${`${iconOnly ? 'editor-button icon-button' : 'editor-button'} ${options.className ?? ''}`}
    data-variant=${options.variant ?? (iconOnly ? 'quiet' : 'default')}
    data-size=${options.size ?? 'compact'} ?disabled=${options.disabled || options.busy}
    aria-busy=${options.busy ? 'true' : nothing} aria-label=${iconOnly ? label : nothing}
    title=${options.title ?? (iconOnly ? label : nothing)} @click=${action}>
    ${options.busy ? spinner : options.icon ? html`<span class="editor-button-icon" aria-hidden="true">${options.icon}</span>` : nothing}${iconOnly ? nothing : label}
  </button>`
}

/** Stable native button template for reactive views; shares the imperative adapter's markup. */
export function buttonView(label: string, action?: () => void, options: ButtonOptions = {}): TemplateResult {
  return template(label, action, options)
}

export function iconButtonView(label: string, icon: TemplateResult, action?: () => void, options: Omit<ButtonOptions, 'icon'> = {}): TemplateResult {
  return template(label, action, { ...options, icon }, true)
}
