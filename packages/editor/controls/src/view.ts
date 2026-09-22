import type { TemplateResult } from 'lit'
import { LitElement, render } from 'lit'

export { html, nothing, render, svg } from 'lit'
export type { TemplateResult } from 'lit'
export { live } from 'lit/directives/live.js'
export { createRef, ref } from 'lit/directives/ref.js'
export { repeat } from 'lit/directives/repeat.js'
export { styleMap } from 'lit/directives/style-map.js'

/** Shared light-DOM base: host tokens and native form semantics cross plugin boundaries. */
export abstract class EditorElement extends LitElement {
  protected createRenderRoot(): HTMLElement { return this }
}

/**
 * Construct an owned root from a template, for native integrations and virtualized rows.
 * Update its contents with render(); never replace a Lit render root's child nodes.
 */
export function element<T extends HTMLElement = HTMLElement>(template: TemplateResult): T {
  const fragment = document.createDocumentFragment()
  render(template, fragment)
  if (fragment.childElementCount !== 1)
    throw new Error('An editor view template must have exactly one root element.')
  return fragment.firstElementChild as T
}
