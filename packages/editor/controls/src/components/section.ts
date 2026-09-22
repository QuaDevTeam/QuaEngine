import { element, html, render } from '../view.js'

const ElementBase = globalThis.HTMLElement ?? class {} as typeof HTMLElement

export class EditorSection extends ElementBase {
  readonly heading = element(html`<h3 class="editor-section-title"></h3>`)
  configure(title: string, children: HTMLElement[]): void {
    this.classList.add('editor-section')
    this.heading.className = 'editor-section-title'
    this.heading.id ||= `editor-section-${crypto.randomUUID()}`
    this.heading.textContent = title
    this.setAttribute('role', 'group')
    this.setAttribute('aria-labelledby', this.heading.id)
    render(html`${this.heading}${children}`, this)
  }
}

export function section(title: string, ...children: HTMLElement[]): EditorSection {
  if (!customElements.get('qua-property-section'))
    customElements.define('qua-property-section', EditorSection)
  const group = document.createElement('qua-property-section') as EditorSection
  group.configure(title, children)
  return group
}
