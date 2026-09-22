import type { TemplateResult } from '../view.js'
import { html } from '../view.js'

export interface DisclosureOptions {
  /** Omit to let the native details element retain its own open state. */
  open?: boolean
  /** Enabled by default; also respects host and OS reduced-motion settings. */
  transition?: boolean
  className?: string
  onToggle?: (open: boolean) => void
}

/** Native disclosure semantics, retained children and an intrinsic-height transition. */
export function disclosure(summary: string | TemplateResult, content: unknown, options: DisclosureOptions = {}): TemplateResult {
  return html`<details class=${`editor-disclosure ${options.className ?? ''}`}
    ?open=${options.open} data-transition=${options.transition !== false}
    @toggle=${(event: Event) => {
      // Nested disclosures must not change their parent's controlled state.
      if (event.target === event.currentTarget)
        options.onToggle?.((event.currentTarget as HTMLDetailsElement).open)
    }}>
    <summary><svg class="editor-disclosure-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>${summary}</summary>
    <div class="editor-disclosure-content">${content}</div>
  </details>`
}
