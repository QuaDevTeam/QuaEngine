import { element as createElement, html, render } from '../view.js'

const ElementBase = globalThis.HTMLElement ?? class {} as typeof HTMLElement

/** Light DOM preserves shared tokens and native accessibility across plugin boundaries. */
export class EditorEmptyState extends ElementBase {
  readonly symbol = createElement(html`<div></div>`)
  readonly heading = createElement(html`<h3></h3>`)
  readonly detail = createElement(html`<p></p>`)
  readonly actions = createElement(html`<div></div>`)
  private initialized = false
  static observedAttributes = ['heading', 'description']

  connectedCallback(): void { this.initialize() }
  attributeChangedCallback(name: string, _old: string, value: string | null): void {
    if (name === 'heading')
      this.heading.textContent = value
    else this.detail.textContent = value
  }

  initialize(): void {
    if (this.initialized)
      return
    this.initialized = true
    this.classList.add('editor-empty-state')
    this.symbol.className = 'editor-empty-symbol'
    this.symbol.setAttribute('aria-hidden', 'true')
    this.actions.className = 'editor-empty-actions'
    render(html`${this.symbol}<div class="editor-empty-copy" role="status">${this.heading}${this.detail}</div>${this.actions}`, this)
  }
}

export function emptyState(title: string, description = '', actions: HTMLElement[] = []) {
  if (!customElements.get('qua-empty-state'))
    customElements.define('qua-empty-state', EditorEmptyState)
  const element = document.createElement('qua-empty-state') as EditorEmptyState
  element.initialize()
  element.setAttribute('heading', title)
  element.setAttribute('description', description)
  render(html`${actions}`, element.actions)
  return { element, symbol: element.symbol, heading: element.heading, detail: element.detail, actions: element.actions }
}
