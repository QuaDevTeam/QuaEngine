import type { TemplateResult } from 'lit'
import { EditorElement as BaseElement } from '@quajs/editor-controls'

/** Light DOM shares editor tokens and leaves Monaco/xterm/native view hosts intact. */
export abstract class EditorElement extends BaseElement {
  protected createRenderRoot(): HTMLElement {
    return this
  }

  protected abstract template(): TemplateResult
  protected initialize(): void {}
  protected render(): TemplateResult {
    return this.template()
  }

  protected firstUpdated(): void {
    this.initialize()
  }
}

export function defineElement(name: string, element: CustomElementConstructor): void {
  if (!customElements.get(name))
    customElements.define(name, element)
}

export { element } from '@quajs/editor-controls'
